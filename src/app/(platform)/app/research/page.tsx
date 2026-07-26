import { auth } from "@clerk/nextjs/server"

import {
  canDeleteListedMatter,
  canDeleteWorkProduct,
  canWriteListedMatter,
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

  let matters: {
    id: string
    title: string
    canWrite: boolean
    canDelete: boolean
    _count: { documents: number }
  }[] = []
  let recentSessions: {
    id: string
    query: string
    response: string | null
    chunkIds: string[]
    createdAt: Date
    matterId: string
    matterTitle: string
    canDelete: boolean
  }[] = []
  let canWrite = false
  let initialResults: ResearchOutput | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
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
              query: true,
              response: true,
              chunkIds: true,
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
                  query: true,
                  response: true,
                  chunkIds: true,
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

      const mappedMatters = matterRows.map((matter) => ({
        id: matter.id,
        title: matter.title,
        canWrite: canWriteListedMatter(matter, user.id, orgCanWrite),
        canDelete: canDeleteListedMatter(matter, user.id, orgCanDelete),
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
          canDelete: canDeleteListedMatter(focusedMatter, user.id, orgCanDelete),
          _count: focusedMatter._count,
        })
      }
      matters = mappedMatters
      canWrite =
        orgCanWrite || mappedMatters.some((matter) => matter.canWrite)

      const mapSession = (session: (typeof sessionRows)[number]) => {
        const matterCanWrite = canWriteListedMatter(
          session.matter,
          user.id,
          orgCanWrite
        )
        const matterCanDelete = canDeleteListedMatter(
          session.matter,
          user.id,
          orgCanDelete
        )
        return {
          id: session.id,
          query: session.query,
          response: session.response,
          chunkIds: session.chunkIds,
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
      if (focusedSession && !mapped.some((session) => session.id === focusedSession.id)) {
        mapped.unshift(mapSession(focusedSession))
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
