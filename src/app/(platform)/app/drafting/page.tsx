import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"
import { DraftingClient } from "./_drafting-client"

export const dynamic = "force-dynamic"

export default async function DraftingPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let matters: { id: string; title: string; _count: { documents: number } }[] = []
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

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const [matterRows, draftRows] = await Promise.all([
        prisma.matter.findMany({
          where: { userId: user.id, status: { not: "archived" } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            _count: { select: { documents: true } },
          },
        }),
        prisma.draftDocument.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 8,
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
      ])

      matters = matterRows
      recentDrafts = draftRows.map((draft) => ({
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
    }
  } catch {
    /* DB unavailable */
  }

  return <DraftingClient matters={matters} recentDrafts={recentDrafts} />
}
