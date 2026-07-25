import { auth } from "@clerk/nextjs/server"

import {
  canWriteListedMatter,
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { DraftingClient } from "./_drafting-client"
import { restoreDraft, type DraftOutput } from "./actions"

export const dynamic = "force-dynamic"

type DraftingPageProps = {
  searchParams?: Promise<{
    matter?: string
    draft?: string
  }>
}

export default async function DraftingPage({ searchParams }: DraftingPageProps) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  const params = (await searchParams) ?? {}
  const initialMatterId = params.matter?.trim() || undefined
  const initialDraftId = params.draft?.trim() || undefined

  let matters: {
    id: string
    title: string
    canWrite: boolean
    _count: { documents: number }
  }[] = []
  let recentDrafts: {
    id: string
    title: string
    draftType: string
    instruction: string
    content: string | null
    chunkIds: string[]
    createdAt: Date
    matterId: string
    matterTitle: string
  }[] = []
  let canWrite = false
  let initialResults: DraftOutput | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      const orgCanWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true
      canWrite = orgCanWrite
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)

      const [matterRows, draftRows, focusedDraft, focusedMatter] =
        await Promise.all([
          prisma.matter.findMany({
            where: { AND: [matterWhere, { status: { not: "archived" } }] },
            orderBy: { updatedAt: "desc" },
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
              title: true,
              draftType: true,
              instruction: true,
              content: true,
              chunkIds: true,
              createdAt: true,
              matterId: true,
              matter: { select: { title: true } },
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
                  title: true,
                  draftType: true,
                  instruction: true,
                  content: true,
                  chunkIds: true,
                  createdAt: true,
                  matterId: true,
                  matter: { select: { title: true } },
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

      const mappedMatters = matterRows.map((matter) => ({
        id: matter.id,
        title: matter.title,
        canWrite: canWriteListedMatter(matter, user.id, orgCanWrite),
        _count: matter._count,
      }))
      if (
        focusedMatter &&
        !mappedMatters.some((matter) => matter.id === focusedMatter.id)
      ) {
        mappedMatters.unshift({
          id: focusedMatter.id,
          title: focusedMatter.title,
          canWrite: canWriteListedMatter(focusedMatter, user.id, orgCanWrite),
          _count: focusedMatter._count,
        })
      }
      matters = mappedMatters
      canWrite =
        orgCanWrite || mappedMatters.some((matter) => matter.canWrite)

      const mapped = draftRows.map((draft) => ({
        id: draft.id,
        title: draft.title,
        draftType: draft.draftType,
        instruction: draft.instruction,
        content: draft.content,
        chunkIds: draft.chunkIds,
        createdAt: draft.createdAt,
        matterId: draft.matterId,
        matterTitle: draft.matter.title,
      }))
      if (focusedDraft && !mapped.some((draft) => draft.id === focusedDraft.id)) {
        mapped.unshift({
          id: focusedDraft.id,
          title: focusedDraft.title,
          draftType: focusedDraft.draftType,
          instruction: focusedDraft.instruction,
          content: focusedDraft.content,
          chunkIds: focusedDraft.chunkIds,
          createdAt: focusedDraft.createdAt,
          matterId: focusedDraft.matterId,
          matterTitle: focusedDraft.matter.title,
        })
      }
      recentDrafts = mapped

      if (initialDraftId) {
        initialResults = await restoreDraft(initialDraftId)
      }
    }
  } catch {
    /* DB unavailable */
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
