import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { decideDeepLinkRestorePagePublish } from "@/lib/auth/deep-link-restore-page-publish"
import { selectLiveRegistryRows } from "@/lib/auth/registry-list-publish"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  canDeleteListedMatter,
  canDeleteWorkProduct,
  canWriteListedMatter,
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  requireActiveOrganizationReadMembershipInTx,
  requireMatterPermissionLocked,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { researchSessionPresenceByIds } from "@/lib/documents/work-product-presence"
import { prisma } from "@/lib/prisma"
import { ResearchClient } from "./_research-client"
import { restoreResearchSession, type ResearchOutput } from "./actions"

export const dynamic = "force-dynamic"
/** Research actions may embed + complete sequentially under this budget. */
export const maxDuration = 300

/** Matter picker rows for the research surface. */
const RESEARCH_MATTERS_LIMIT = 100

type ResearchPageProps = {
  searchParams?: Promise<{
    matter?: string
    session?: string
  }>
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const session = await resolvePlatformClerkId()
  if (session.status === "unauthenticated") return null
  if (session.status === "unavailable") {
    return (
      <WorkspaceLoadError
        title="Identity service unavailable"
        description={session.error}
        homeHref="/app"
      />
    )
  }
  const { clerkId } = session


  const params = (await searchParams) ?? {}
  const initialMatterId = params.matter?.trim() || undefined
  const initialSessionId = params.session?.trim() || undefined

  let loadFailed = false
  let matters: {
    id: string
    title: string
    canWrite: boolean
    canDelete: boolean
    _count: { documents: number }
  }[] = []
  let recentSessions: {
    id: string
    hasResponse: boolean
    chunkCount: number
    createdAt: Date
    matterId: string
    matterTitle: string
    canDelete: boolean
  }[] = []
  let canWrite = false
  let initialResults: ResearchOutput | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) {
      loadFailed = true
    } else {
      const activeOrg = await getActiveOrganization(user.id)
      const orgCanWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true
      const orgCanDelete = activeOrg
        ? roleHasPermission(activeOrg.role, "delete")
        : true
      canWrite = orgCanWrite
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)

      const [matterRows, sessionRows, focusedSession, focusedMatter] =
        await Promise.all([
          prisma.matter.findMany({
            where: { AND: [matterWhere, { status: { not: "archived" } }] },
            orderBy: { updatedAt: "desc" },
            take: RESEARCH_MATTERS_LIMIT,
            select: {
              id: true,
              title: true,
              userId: true,
              organizationId: true,
              _count: { select: { documents: true } },
            },
          }),
          prisma.researchSession.findMany({
            where: {
              matter: initialMatterId
                ? { AND: [matterWhere, { id: initialMatterId }] }
                : matterWhere,
            },
            orderBy: { createdAt: "desc" },
            take: initialMatterId ? 24 : 8,
            select: {
              id: true,
              // Metadata only — body/chunk presence via SQL flags.
              createdAt: true,
              matterId: true,
              userId: true,
              matter: {
                select: {
                  title: true,
                  userId: true,
                  organizationId: true,
                },
              },
            },
          }),
          initialSessionId
            ? prisma.researchSession.findFirst({
                where: {
                  id: initialSessionId,
                  matter: matterWhere,
                },
                select: {
                  id: true,
                  createdAt: true,
                  matterId: true,
                  userId: true,
                  matter: {
                    select: {
                      title: true,
                      userId: true,
                      organizationId: true,
                    },
                  },
                },
              })
            : Promise.resolve(null),
          // Allow deep-link preselection for archived matters.
          initialMatterId
            ? prisma.matter.findFirst({
                where: { AND: [matterWhere, { id: initialMatterId }] },
                select: {
                  id: true,
                  title: true,
                  userId: true,
                  organizationId: true,
                  _count: { select: { documents: true } },
                },
              })
            : Promise.resolve(null),
        ])

      // Presence + deep-link restore before final publish reauth.
      // Only restore when focusedSession matched the active-org matterWhere —
      // restoreResearchSession uses any-org matterAccessWhere, so restoring by
      // raw session id would publish bodies from another org after that org's
      // membership is revoked while the active-org reauth still passes.
      // Body-bearing restores re-check session liveness under the SAME final
      // txn as active-org membership — no await may remain between that proof
      // and serialize (concurrent workspace switch must not ship stale lists
      // or old-org bodies after a post-membership body check).
      const presence = await researchSessionPresenceByIds([
        ...sessionRows.map((session) => session.id),
        ...(focusedSession ? [focusedSession.id] : []),
      ])
      const pendingRestore = focusedSession
        ? await restoreResearchSession(focusedSession.id)
        : null

      const needsBodyPublish = Boolean(
        pendingRestore &&
          focusedSession &&
          !pendingRestore.error &&
          pendingRestore.matterId === focusedSession.matterId
      )
      const needsErrorPublish = Boolean(
        pendingRestore && focusedSession && pendingRestore.error
      )

      try {
        const finalPublish = await prisma.$transaction(async (tx) => {
          // Body path takes Matter locks before User (Org → Member → Matter →
          // User) so lock order matches matter writers and avoids deadlocks.
          let bodyDecision:
            | { mode: "none" }
            | { mode: "error" }
            | { mode: "body"; title: string } = { mode: "none" }

          if (needsBodyPublish && focusedSession && pendingRestore) {
            const permission = await requireMatterPermissionLocked(
              tx,
              user.id,
              focusedSession.matterId,
              "read"
            )
            let workProductPresent = false
            let lockedTitle: string | null = null
            if (permission.ok) {
              const stillPresent = await tx.researchSession.findFirst({
                where: {
                  id: focusedSession.id,
                  matterId: focusedSession.matterId,
                },
                select: {
                  id: true,
                  matter: { select: { title: true } },
                },
              })
              workProductPresent = Boolean(stillPresent)
              lockedTitle = stillPresent?.matter.title ?? null
            }
            const decided = decideDeepLinkRestorePagePublish({
              // Active-org membership is verified in this same txn below —
              // fail closed if that check rejects after body probes.
              membershipOk: true,
              focusedMatterId: focusedSession.matterId,
              pendingMatterId: pendingRestore.matterId,
              pendingHasError: false,
              workProductPresent,
              lockedTitle,
            })
            bodyDecision =
              decided.ok && decided.mode === "body"
                ? { mode: "body", title: decided.title }
                : { mode: "none" }
          }

          const membership = await requireActiveOrganizationReadMembershipInTx(
            tx,
            user.id,
            activeOrg?.id
          )
          if (!membership.ok) {
            return { ok: false as const }
          }

          if (needsErrorPublish) {
            bodyDecision = { mode: "error" }
          }

          // Re-confirm picker/list descriptors under the same final txn so
          // deleteMatter / deleteResearchSession cannot leave titles shipping
          // after membership alone.
          const probedMatterIds = [
            ...matterRows.map((matter) => matter.id),
            ...(focusedMatter &&
            !matterRows.some((matter) => matter.id === focusedMatter.id)
              ? [focusedMatter.id]
              : []),
          ]
          const probedSessionIds = [
            ...sessionRows.map((session) => session.id),
            ...(focusedSession &&
            !sessionRows.some((session) => session.id === focusedSession.id)
              ? [focusedSession.id]
              : []),
          ]
          const liveMatters =
            probedMatterIds.length === 0
              ? []
              : await tx.matter.findMany({
                  where: {
                    AND: [matterWhere, { id: { in: probedMatterIds } }],
                  },
                  select: {
                    id: true,
                    title: true,
                    userId: true,
                    organizationId: true,
                    _count: { select: { documents: true } },
                  },
                })
          const liveSessions =
            probedSessionIds.length === 0
              ? []
              : await tx.researchSession.findMany({
                  where: {
                    id: { in: probedSessionIds },
                    matter: matterWhere,
                  },
                  select: {
                    id: true,
                    createdAt: true,
                    matterId: true,
                    userId: true,
                    matter: {
                      select: {
                        title: true,
                        userId: true,
                        organizationId: true,
                      },
                    },
                  },
                })
          const mattersById = new Map(
            liveMatters.map((matter) => [matter.id, matter])
          )
          const sessionsById = new Map(
            liveSessions.map((session) => [session.id, session])
          )

          return {
            ok: true as const,
            role: membership.role,
            body: bodyDecision,
            liveMatters: selectLiveRegistryRows({
              probedIds: probedMatterIds,
              lockedById: mattersById,
            }),
            liveSessions: selectLiveRegistryRows({
              probedIds: probedSessionIds,
              lockedById: sessionsById,
            }),
          }
        })

        if (!finalPublish.ok) {
          matters = []
          recentSessions = []
          canWrite = false
          initialResults = null
        } else {
          const finalOrgCanWrite = finalPublish.role
            ? roleHasPermission(finalPublish.role, "write")
            : true
          const finalOrgCanDelete = finalPublish.role
            ? roleHasPermission(finalPublish.role, "delete")
            : true

          const mappedMatters = finalPublish.liveMatters.map((matter) => ({
            id: matter.id,
            title: matter.title,
            canWrite: canWriteListedMatter(matter, user.id, finalOrgCanWrite),
            canDelete: canDeleteListedMatter(matter, user.id, finalOrgCanDelete),
            _count: matter._count,
          }))
          matters = mappedMatters
          canWrite =
            finalOrgCanWrite || mappedMatters.some((matter) => matter.canWrite)

          recentSessions = finalPublish.liveSessions.map((session) => {
            const matterCanWrite = canWriteListedMatter(
              session.matter,
              user.id,
              finalOrgCanWrite
            )
            const matterCanDelete = canDeleteListedMatter(
              session.matter,
              user.id,
              finalOrgCanDelete
            )
            const flags = presence.get(session.id)
            return {
              id: session.id,
              // Never ship saved queries/bodies in list props — restore under lock.
              hasResponse: flags?.hasBody ?? false,
              chunkCount: flags?.chunkCount ?? 0,
              createdAt: session.createdAt,
              matterId: session.matterId,
              matterTitle: session.matter.title,
              canDelete: canDeleteWorkProduct({
                actorUserId: user.id,
                createdByUserId: session.userId,
                matterCanWrite,
                matterCanDelete,
              }),
            }
          })

          if (finalPublish.body.mode === "error" && pendingRestore) {
            initialResults = pendingRestore
          } else if (
            finalPublish.body.mode === "body" &&
            pendingRestore
          ) {
            initialResults = {
              ...pendingRestore,
              matterTitle: finalPublish.body.title,
            }
          } else {
            initialResults = null
          }
        }
      } catch {
        matters = []
        recentSessions = []
        canWrite = false
        initialResults = null
      }
    }
  } catch {
    loadFailed = true
  }

  if (loadFailed) {
    return <WorkspaceLoadError title="Research workspace unavailable" />
  }

  return (
    <ResearchClient
      matters={matters}
      recentSessions={recentSessions}
      canWrite={canWrite}
      initialMatterId={initialMatterId}
      initialResults={initialResults}
    />
  )
}
