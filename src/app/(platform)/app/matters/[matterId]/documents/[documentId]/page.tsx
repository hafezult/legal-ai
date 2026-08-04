import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  matterAccessWhere,
  requireMatterPermissionLocked,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { isParsedTextTruncated } from "@/lib/documents/parsed-text"
import { extractAuthorities } from "@/lib/legal/authorities"
import { prisma } from "@/lib/prisma"
import {
  sessionReferencesDocument,
  snapshotEntriesForDocument,
} from "@/lib/retrieval/citation-snapshot"
import { documentContentPath } from "@/lib/documents/content-url"
import { inspectionChunkWhere } from "@/lib/workflows/indexing-publish"
import { deleteDocument, reindexDocument } from "../../actions"
import { DocumentWorkstation } from "./_workstation"
import type { WorkstationData } from "./_workstation"

export const dynamic = "force-dynamic"
/** Reindex runs the indexing pipeline in-process on this segment. */
export const maxDuration = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matterId: string; documentId: string }>
}): Promise<Metadata> {
  const session = await resolvePlatformClerkId()
  if (session.status !== "ok") return { title: "Document workstation" }
  const { clerkId } = session

  const { matterId, documentId } = await params
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { title: "Document workstation" }

    // Resolve the filename under the same matter lock as the page body so a
    // concurrent removal cannot disclose document names via <title> alone.
    const title = await prisma.$transaction(async (tx) => {
      const stillAllowed = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "read"
      )
      if (!stillAllowed.ok) return null

      const doc = await tx.document.findFirst({
        where: {
          id: documentId,
          matterId,
          matter: matterAccessWhere(user.id),
        },
        select: { fileName: true },
      })
      return doc?.fileName ?? null
    })
    if (!title) return { title: "Document workstation" }
    return { title: `${title} · workstation` }
  } catch {
    return { title: "Document workstation" }
  }
}

export default async function DocumentViewerPage({
  params,
}: {
  params: Promise<{ matterId: string; documentId: string }>
}) {
  const session = await resolvePlatformClerkId()
  if (session.status === "unauthenticated") return null
  if (session.status === "unavailable") {
    return (
      <WorkspaceLoadError
        title="Identity service unavailable"
        description={session.error}
        homeHref="/app/matters"
      />
    )
  }
  const { clerkId } = session
  const { matterId, documentId } = await params

  let data: WorkstationData | null = null
  let loadFailed = false
  let missing = false
  let permissionLoadFailed = false
  let canWrite = false
  let canDelete = false

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) {
      // Authenticated Clerk session without a provisioned app user is a
      // sync/data-plane failure — not a blank workstation.
      loadFailed = true
    } else {
      // Load sensitive document/chunk/session bodies under the same matter lock
      // used by deleteDocument so a concurrent delete cannot leave this page
      // returning stale parsed text after permission reauth alone.
      try {
        const locked = await prisma.$transaction(async (tx) => {
          const stillAllowed = await requireMatterPermissionLocked(
            tx,
            user.id,
            matterId,
            "read"
          )
          if (!stillAllowed.ok) {
            return { status: "denied" as const }
          }

          const doc = await tx.document.findFirst({
            where: {
              id: documentId,
              matterId,
              matter: matterAccessWhere(user.id),
            },
            select: {
              id: true,
              fileName: true,
              storagePath: true,
              mimeType: true,
              fileSize: true,
              pageCount: true,
              chunkCount: true,
              extractionConf: true,
              uploadStatus: true,
              indexingStatus: true,
              retrievalStatus: true,
              parseStatus: true,
              parsedText: true,
              uploadedAt: true,
              createdAt: true,
              updatedAt: true,
              matterId: true,
              publishedRunId: true,
              indexingRunId: true,
              matter: { select: { title: true, clientName: true } },
            },
          })
          if (!doc) {
            return { status: "missing" as const }
          }

          // Prefer published generation so mid-reindex staging rows stay hidden.
          const chunkWhere = inspectionChunkWhere({
            id: documentId,
            publishedRunId: doc.publishedRunId,
            indexingRunId: doc.indexingRunId,
          })
          const chunks = await tx.documentChunk.findMany({
            where: chunkWhere,
            orderBy: { chunkIndex: "asc" },
            select: {
              id: true,
              chunkIndex: true,
              content: true,
              tokenCount: true,
              pageRef: true,
              headingPath: true,
              createdAt: true,
            },
          })

          // Research sessions that referenced this document (live chunk ids or
          // immutable citation snapshots — survives publish-swap after reindex).
          const chunkIds = chunks.map((c) => c.id)
          let sessions: {
            id: string
            query: string
            chunkIds: string[]
            citationSnapshot: string | null
            createdAt: Date
          }[] = []
          let sessionsFailed = false
          try {
            const candidates = await tx.researchSession.findMany({
              where: { matterId },
              orderBy: { createdAt: "desc" },
              take: 80,
              select: {
                id: true,
                query: true,
                chunkIds: true,
                citationSnapshot: true,
                createdAt: true,
              },
            })
            sessions = candidates
              .filter((session) =>
                sessionReferencesDocument(session, {
                  id: doc.id,
                  fileName: doc.fileName,
                  chunkIds,
                })
              )
              .slice(0, 20)
          } catch {
            sessionsFailed = true
          }

          return {
            status: "ok" as const,
            role: stillAllowed.access.role,
            doc,
            chunks,
            sessions,
            sessionsFailed,
          }
        })

        if (locked.status === "denied" || locked.status === "missing") {
          missing = true
        } else if (!locked.role) {
          missing = true
        } else {
          const lockedDoc = locked.doc
          const rawChunks = locked.chunks
          const rawSessions = locked.sessions
          const sessionsLoadFailed = locked.sessionsFailed

          // Embedding presence probe after the locked body read — chunk ids are
          // already a consistent snapshot under the matter lock.
          let embeddedIds: Set<string> = new Set()
          let embeddingsLoadFailed = false
          if (rawChunks.length > 0) {
            const ids = rawChunks.map((c) => c.id)
            try {
              const rows = await prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM "DocumentChunk"
                WHERE id = ANY(${ids}::text[])
                  AND embedding IS NOT NULL
              `
              embeddedIds = new Set(rows.map((r) => r.id))
            } catch {
              embeddingsLoadFailed = true
            }
          }

          // Prefer full chunk text for authorities; parsedText alone is capped.
          const authoritySource =
            rawChunks.length > 0
              ? rawChunks.map((c) => c.content).join("\n\n")
              : (lockedDoc.parsedText ?? "")
          const authorities = authoritySource
            ? extractAuthorities(authoritySource)
            : []

          // Authenticated same-origin content path (not a storage signed URL).
          // Byte fetches re-check matter permission per request on the API route.
          const contentUrl = lockedDoc.storagePath
            ? documentContentPath(matterId, documentId)
            : null

          // Final locked reauth after post-lock embedding probes so a concurrent
          // removal cannot receive bodies or a content URL after revoke.
          let publishAllowed
          try {
            publishAllowed = await prisma.$transaction(async (tx) =>
              requireMatterPermissionLocked(tx, user.id, matterId, "read")
            )
          } catch {
            permissionLoadFailed = true
            publishAllowed = null
          }

          if (permissionLoadFailed) {
            // handled below
          } else if (!publishAllowed || !publishAllowed.ok || !publishAllowed.access.role) {
            missing = true
          } else {
            const publishRole = publishAllowed.access.role
            canWrite = roleHasPermission(publishRole, "write")
            canDelete = roleHasPermission(publishRole, "delete")

            // Serialise (no Date objects allowed across RSC boundary)
            data = {
              doc: {
                id: lockedDoc.id,
                fileName: lockedDoc.fileName,
                mimeType: lockedDoc.mimeType,
                fileSize: lockedDoc.fileSize,
                pageCount: lockedDoc.pageCount,
                chunkCount: rawChunks.length,
                extractionConf: lockedDoc.extractionConf,
                uploadStatus: lockedDoc.uploadStatus,
                indexingStatus: lockedDoc.indexingStatus,
                retrievalStatus: lockedDoc.retrievalStatus,
                publishedRunId: lockedDoc.publishedRunId,
                parseStatus: lockedDoc.parseStatus,
                parsedText: lockedDoc.parsedText,
                uploadedAt: lockedDoc.uploadedAt.toISOString(),
                updatedAt: lockedDoc.updatedAt.toISOString(),
                matterId: lockedDoc.matterId,
                matterTitle: lockedDoc.matter.title,
                matterClient: lockedDoc.matter.clientName,
              },
              chunks: rawChunks.map((c) => ({
                id: c.id,
                chunkIndex: c.chunkIndex,
                content: c.content,
                tokenCount: c.tokenCount,
                pageRef: c.pageRef,
                headingPath: c.headingPath,
                hasEmbedding: embeddedIds.has(c.id),
                createdAt: c.createdAt.toISOString(),
              })),
              sessions: rawSessions.map((s) => ({
                id: s.id,
                query: s.query,
                chunkIds: s.chunkIds,
                createdAt: s.createdAt.toISOString(),
                snapshotExcerpts: snapshotEntriesForDocument(s.citationSnapshot, {
                  id: lockedDoc.id,
                  fileName: lockedDoc.fileName,
                }).map((entry) => ({
                  id: entry.id,
                  content: entry.content,
                  pageRef: entry.pageRef,
                  headingPath: entry.headingPath,
                })),
              })),
              sessionsLoadFailed,
              embeddingsLoadFailed,
              authorities: authorities.map((a) => ({
                citation: a.citation,
                type: a.type,
                normalized: a.normalized,
              })),
              embeddedCount: embeddedIds.size,
              contentUrl,
              parsedTextTruncated: isParsedTextTruncated(lockedDoc.parsedText),
            }
          }
        }
      } catch {
        permissionLoadFailed = true
      }
    }
  } catch {
    loadFailed = true
  }

  if (loadFailed) {
    return (
      <WorkspaceLoadError
        title="Document workstation unavailable"
        description="Aether could not load this source from the data plane. Retry shortly, or verify Settings readiness if the outage continues."
        homeHref={`/app/matters/${matterId}`}
      />
    )
  }

  if (permissionLoadFailed) {
    return (
      <WorkspaceLoadError
        title="Document permissions unavailable"
        description="Aether could not verify read access for this source. Retry shortly, or verify Settings readiness if the outage continues."
        homeHref={`/app/matters/${matterId}`}
      />
    )
  }

  if (missing || !data) notFound()

  const boundReindex = reindexDocument.bind(null, matterId, documentId)
  const boundDelete = deleteDocument.bind(null, matterId, documentId)

  return (
    <DocumentWorkstation
      data={data}
      reindexAction={boundReindex}
      deleteAction={boundDelete}
      canWrite={canWrite}
      canDelete={canDelete}
    />
  )
}
