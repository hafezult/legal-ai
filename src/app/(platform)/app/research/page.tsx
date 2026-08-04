import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  canDeleteListedMatter,
  canDeleteWorkProduct,
  canWriteListedMatter,
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  requireActiveOrganizationReadMembership,
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

      // Presence + deep-link restore before final membership reauth so the
      // lock check stays immediately before list serialize (restore has its
      // own matter lock; a concurrent remove must not keep matter titles).
      // Only restore when focusedSession matched the active-org matterWhere —
      // restoreResearchSession uses any-org matterAccessWhere, so restoring by
      // raw session id would publish bodies from another org after that org's
      // membership is revoked while the active-org reauth still passes.
      const presence = await researchSessionPresenceByIds([
        ...sessionRows.map((session) => session.id),
        ...(focusedSession ? [focusedSession.id] : []),
      ])
      const pendingRestore = focusedSession
        ? await restoreResearchSession(focusedSession.id)
        : null

      const finalMembership = await requireActiveOrganizationReadMembership(
        user.id,
        activeOrg?.id
      )
      if (!finalMembership.ok) {
        matters = []
        recentSessions = []
        canWrite = false
        initialResults = null
      } else {
        const finalOrgCanWrite = finalMembership.role
          ? roleHasPermission(finalMembership.role, "write")
          : true
        const finalOrgCanDelete = finalMembership.role
          ? roleHasPermission(finalMembership.role, "delete")
          : true

        const mappedMatters = matterRows.map((matter) => ({
          id: matter.id,
          title: matter.title,
          canWrite: canWriteListedMatter(matter, user.id, finalOrgCanWrite),
          canDelete: canDeleteListedMatter(matter, user.id, finalOrgCanDelete),
          _count: matter._count,
        }))
        if (
          focusedMatter &&
          !mappedMatters.some((matter) => matter.id === focusedMatter.id)
        ) {
          mappedMatters.unshift({
            id: focusedMatter.id,
            title: focusedMatter.title,
            canWrite: canWriteListedMatter(focusedMatter, user.id, finalOrgCanWrite),
            canDelete: canDeleteListedMatter(focusedMatter, user.id, finalOrgCanDelete),
            _count: focusedMatter._count,
          })
        }
        matters = mappedMatters
        canWrite =
          finalOrgCanWrite || mappedMatters.some((matter) => matter.canWrite)

        const mapSession = (session: (typeof sessionRows)[number]) => {
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
        }

        const mapped = sessionRows.map(mapSession)
        if (
          focusedSession &&
          !mapped.some((session) => session.id === focusedSession.id)
        ) {
          mapped.unshift(mapSession(focusedSession))
        }
        recentSessions = mapped
        // Publish restored bodies only when they still bind to the active-org
        // focused session row (no awaits after finalMembership above).
        // Error payloads keep matterId null — still surface those to the client.
        initialResults =
          pendingRestore &&
          focusedSession &&
          (Boolean(pendingRestore.error) ||
            pendingRestore.matterId === focusedSession.matterId)
            ? pendingRestore
            : null
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
