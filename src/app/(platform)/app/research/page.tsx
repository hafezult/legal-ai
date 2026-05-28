import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"
import { ResearchClient } from "./_research-client"

export const dynamic = "force-dynamic"

export default async function ResearchPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matters: { id: string; title: string; _count: { documents: number } }[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matters = await prisma.matter.findMany({
        where: { userId: user.id, status: { not: "archived" } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          _count: { select: { documents: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return <ResearchClient matters={matters} />
}
