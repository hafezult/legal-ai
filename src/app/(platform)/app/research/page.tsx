import { auth } from "@clerk/nextjs/server"

import {
  getActiveOrganization,
  matterAccessWhere,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { ResearchClient } from "./_research-client"

export const dynamic = "force-dynamic"

export default async function ResearchPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let matters: { id: string; title: string; _count: { documents: number } }[] = []
  let recentSessions: {
    id: string
    query: string
    response: string | null
    chunkIds: string[]
    createdAt: Date
    matterId: string
    matterTitle: string
  }[] = []
  let canWrite = false

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      canWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true

      const [matterRows, sessionRows] = await Promise.all([
        prisma.matter.findMany({
          where: { AND: [matterAccessWhere(user.id), { status: { not: "archived" } }] },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            _count: { select: { documents: true } },
          },
        }),
        prisma.researchSession.findMany({
          where: { OR: [{ userId: user.id }, { matter: matterAccessWhere(user.id) }] },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            query: true,
            response: true,
            chunkIds: true,
            createdAt: true,
            matterId: true,
            matter: { select: { title: true } },
          },
        }),
      ])

      matters = matterRows
      recentSessions = sessionRows.map((session) => ({
        id: session.id,
        query: session.query,
        response: session.response,
        chunkIds: session.chunkIds,
        createdAt: session.createdAt,
        matterId: session.matterId,
        matterTitle: session.matter.title,
      }))
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <ResearchClient
      matters={matters}
      recentSessions={recentSessions}
      canWrite={canWrite}
    />
  )
}
