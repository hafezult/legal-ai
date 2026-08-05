import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { decideDeepLinkRestorePagePublish } from "@/lib/auth/deep-link-restore-page-publish"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  canDeleteListedMatter,
  canDeleteWorkProduct,
  canWriteListedMatter,
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  requireActiveOrganizationReadMembership,
  requireMatterPermissionLocked,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { draftDocumentPresenceByIds } from "@/lib/documents/work-product-presence"
import { prisma } from "@/lib/prisma"
import { DraftingClient } from "./_drafting-client"
import { restoreDraft, type DraftOutput } from "./actions"

export const dynamic = "force-dynamic"
/** Drafting actions may embed + complete sequentially under this budget. */
export const maxDuration = 300

/** Matter picker rows for the drafting surface. */
const DRAFTING_MATTERS_LIMIT = 100

type DraftingPageProps = {
  searchParams?: Promise<{
    matter?: string
    draft?: string
  }>
}

export default async function DraftingPage({ searchParams }: DraftingPageProps) {
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
  const initialDraftId = params.draft?.trim() || undefined

  let loadFailed = false
  let matters: {
    id: string
    title: string
    canWrite: boolean
    canDelete: boolean
    _count: { documents: number }
  }[] = []
  let recentDrafts: {
    id: string
    draftType: string
    hasContent: boolean
    chunkCount: number
    createdAt: Date
    matterId: string
    matterTitle: string
    canDelete: boolean
  }[] = []
  let canWrite = false
  let initialResults: DraftOutput | null = null

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

      const [matterRows, draftRows, focusedDraft, focusedMatter] =
        await Promise.all([
          prisma.matter.findMany({
            where: { AND: [matterWhere, { status: { not: "archived" } }] },
            orderBy: { updatedAt: "desc" },
            take: DRAFTING_MATTERS_LIMIT,
            select: {
              id: true,
              title: true,
              userId: true,
              organizationId: true,
              _count: { select: { documents: true } },
            },
          }),
          prisma.draftDocument.findMany({
            where: {
              matter: initialMatterId
                ? { AND: [matterWhere, { id: initialMatterId }] }
                : matterWhere,
            },
            orderBy: { createdAt: "desc" },
            take: initialMatterId ? 24 : 8,
            select: {
              id: true,
              // draftType/metadata only — titles embed instruction excerpts;
              // instruction/body/title return via locked restore. Presence via SQL.
              draftType: true,
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
          initialDraftId
            ? prisma.draftDocument.findFirst({
                where: {
                  id: initialDraftId,
                  matter: matterWhere,
                },
                select: {
                  id: true,
                  draftType: true,
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

      // Presence + deep-link restore before active-org membership reauth.
      // Only restore when focusedDraft matched the active-org matterWhere —
      // restoreDraft uses any-org matterAccessWhere, so restoring by raw draft
      // id would publish bodies from another org after that org's membership
      // is revoked while the active-org reauth still passes.
      // Body-bearing restores re-check draft liveness after membership
      // (below) before SSR publish — membership alone is not enough.
      const presence = await draftDocumentPresenceByIds([
        ...draftRows.map((draft) => draft.id),
        ...(focusedDraft ? [focusedDraft.id] : []),
      ])
      const pendingRestore = focusedDraft
        ? await restoreDraft(focusedDraft.id)
        : null

      const finalMembership = await requireActiveOrganizationReadMembership(
        user.id,
        activeOrg?.id
      )
      if (!finalMembership.ok) {
        matters = []
        recentDrafts = []
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

        const mapDraft = (draft: (typeof draftRows)[number]) => {
          const matterCanWrite = canWriteListedMatter(
            draft.matter,
            user.id,
            finalOrgCanWrite
          )
          const matterCanDelete = canDeleteListedMatter(
            draft.matter,
            user.id,
            finalOrgCanDelete
          )
          const flags = presence.get(draft.id)
          return {
            id: draft.id,
            draftType: draft.draftType,
            // Never ship saved instructions/titles/bodies in list props —
            // titles embed instruction excerpts; restore under lock.
            hasContent: flags?.hasBody ?? false,
            chunkCount: flags?.chunkCount ?? 0,
            createdAt: draft.createdAt,
            matterId: draft.matterId,
            matterTitle: draft.matter.title,
            canDelete: canDeleteWorkProduct({
              actorUserId: user.id,
              createdByUserId: draft.userId,
              matterCanWrite,
              matterCanDelete,
            }),
          }
        }

        const mapped = draftRows.map(mapDraft)
        if (
          focusedDraft &&
          !mapped.some((draft) => draft.id === focusedDraft.id)
        ) {
          mapped.unshift(mapDraft(focusedDraft))
        }
        recentDrafts = mapped

        // Deep-link body publish: membership alone is insufficient after
        // restore returns — re-check draft liveness + refresh matter title
        // under lock (parity with restoreDraft / workstation).
        // Error payloads have no bodies and may ship after membership alone.
        if (pendingRestore && focusedDraft && pendingRestore.error) {
          initialResults = pendingRestore
        } else if (
          pendingRestore &&
          focusedDraft &&
          pendingRestore.matterId === focusedDraft.matterId
        ) {
          try {
            const publishAllowed = await prisma.$transaction(async (tx) => {
              const permission = await requireMatterPermissionLocked(
                tx,
                user.id,
                focusedDraft.matterId,
                "read"
              )
              if (!permission.ok) {
                return decideDeepLinkRestorePagePublish({
                  membershipOk: true,
                  focusedMatterId: focusedDraft.matterId,
                  pendingMatterId: pendingRestore.matterId,
                  pendingHasError: false,
                  workProductPresent: false,
                  lockedTitle: null,
                })
              }
              const stillPresent = await tx.draftDocument.findFirst({
                where: {
                  id: focusedDraft.id,
                  matterId: focusedDraft.matterId,
                },
                select: {
                  id: true,
                  matter: { select: { title: true } },
                },
              })
              return decideDeepLinkRestorePagePublish({
                membershipOk: true,
                focusedMatterId: focusedDraft.matterId,
                pendingMatterId: pendingRestore.matterId,
                pendingHasError: false,
                workProductPresent: Boolean(stillPresent),
                lockedTitle: stillPresent?.matter.title,
              })
            })
            initialResults =
              publishAllowed.ok && publishAllowed.mode === "body"
                ? {
                    ...pendingRestore,
                    matterTitle: publishAllowed.title,
                  }
                : null
          } catch {
            initialResults = null
          }
        } else {
          initialResults = null
        }
      }
    }
  } catch {
    loadFailed = true
  }

  if (loadFailed) {
    return <WorkspaceLoadError title="Drafting workspace unavailable" />
  }

  return (
    <DraftingClient
      matters={matters}
      recentDrafts={recentDrafts}
      canWrite={canWrite}
      initialMatterId={initialMatterId}
      initialResults={initialResults}
    />
  )
}
