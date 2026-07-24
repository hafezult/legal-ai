import { auth } from "@clerk/nextjs/server"

import {
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { ResearchClient } from "./_research-client"
import { restoreResearchSession, type ResearchOutput } from "./actions"

export const dynamic = "force-dynamic"

type ResearchPageProps = {
  searchParams?: Promise<{
    matter?: string
    session?: string
  }>
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  const params = (await searchParams) ?? {}
  const initialMatterId = params.matter?.trim() || undefined
  const initialSessionId = params.session?.trim() || undefined

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
  let initialResults: ResearchOutput | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      canWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)

      const [matterRows, sessionRows, focusedSession] = await Promise.all([
        prisma.matter.findMany({
          where: { AND: [matterWhere, { status: { not: "archived" } }] },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
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
            query: true,
            response: true,
            chunkIds: true,
            createdAt: true,
            matterId: true,
            matter: { select: { title: true } },
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
                query: true,
                response: true,
                chunkIds: true,
                createdAt: true,
                matterId: true,
                matter: { select: { title: true } },
              },
            })
          : Promise.resolve(null),
      ])

      matters = matterRows
      const mapped = sessionRows.map((session) => ({
        id: session.id,
        query: session.query,
        response: session.response,
        chunkIds: session.chunkIds,
        createdAt: session.createdAt,
        matterId: session.matterId,
        matterTitle: session.matter.title,
      }))
      if (focusedSession && !mapped.some((session) => session.id === focusedSession.id)) {
        mapped.unshift({
          id: focusedSession.id,
          query: focusedSession.query,
          response: focusedSession.response,
          chunkIds: focusedSession.chunkIds,
          createdAt: focusedSession.createdAt,
          matterId: focusedSession.matterId,
          matterTitle: focusedSession.matter.title,
        })
      }
      recentSessions = mapped

      if (initialSessionId) {
        initialResults = await restoreResearchSession(initialSessionId)
      }
    }
  } catch {
    /* DB unavailable */
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
