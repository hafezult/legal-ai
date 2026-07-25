import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { matterAccessWhere, getMatterAccess, roleHasPermission } from "@/lib/auth/rbac"
import { isParsedTextTruncated } from "@/lib/documents/parsed-text"
import { extractAuthorities } from "@/lib/legal/authorities"
import { prisma } from "@/lib/prisma"
import {
  sessionReferencesDocument,
  snapshotEntriesForDocument,
} from "@/lib/retrieval/citation-snapshot"
import { createSignedUrl } from "@/lib/storage/documents"
import { inspectionChunkWhere } from "@/lib/workflows/indexing-publish"
import { deleteDocument, reindexDocument } from "../../actions"
import { DocumentWorkstation } from "./_workstation"
import type { WorkstationData } from "./_workstation"

export const dynamic = "force-dynamic"
/** Reindex runs the indexing pipeline in-process on this segment. */
export const maxDuration = 300

export default async function DocumentViewerPage({
  params,
}: {
  params: Promise<{ matterId: string; documentId: string }>
}) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  const { matterId, documentId } = await params

  let data: WorkstationData | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return null

    const doc = await prisma.document.findFirst({
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

    if (!doc) return notFound()

    // Prefer published generation so mid-reindex staging rows stay hidden.
    const chunkWhere = inspectionChunkWhere({
      id: documentId,
      publishedRunId: doc.publishedRunId,
      indexingRunId: doc.indexingRunId,
    })
    const rawChunks = await prisma.documentChunk.findMany({
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

    // Determine which chunks have embeddings (requires raw SQL — vector type)
    let embeddedIds: Set<string> = new Set()
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
        /* pgvector unavailable */
      }
    }

    // Research sessions that referenced this document (live chunk ids or
    // immutable citation snapshots — survives publish-swap after reindex).
    const chunkIds = rawChunks.map((c) => c.id)
    let rawSessions: {
      id: string
      query: string
      chunkIds: string[]
      citationSnapshot: string | null
      createdAt: Date
    }[] = []

    try {
      const candidates = await prisma.researchSession.findMany({
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
      rawSessions = candidates
        .filter((session) =>
          sessionReferencesDocument(session, {
            fileName: doc.fileName,
            chunkIds,
          })
        )
        .slice(0, 20)
    } catch {
      /* ignore */
    }

    // Prefer full chunk text for authorities; parsedText alone is capped.
    const authoritySource =
      rawChunks.length > 0
        ? rawChunks.map((c) => c.content).join("\n\n")
        : (doc.parsedText ?? "")
    const authorities = authoritySource
      ? extractAuthorities(authoritySource)
      : []

    // Signed URL (2 hours)
    let signedUrl: string | null = null
    if (doc.storagePath) {
      try {
        const { data: urlData } = await createSignedUrl(doc.storagePath, 7200)
        signedUrl = urlData?.signedUrl ?? null
      } catch {
        /* storage unavailable */
      }
    }

    // Serialise (no Date objects allowed across RSC boundary)
    data = {
      doc: {
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        chunkCount: rawChunks.length,
        extractionConf: doc.extractionConf,
        uploadStatus: doc.uploadStatus,
        indexingStatus: doc.indexingStatus,
        retrievalStatus: doc.retrievalStatus,
        publishedRunId: doc.publishedRunId,
        parseStatus: doc.parseStatus,
        parsedText: doc.parsedText,
        uploadedAt: doc.uploadedAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        matterId: doc.matterId,
        matterTitle: doc.matter.title,
        matterClient: doc.matter.clientName,
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
        snapshotExcerpts: snapshotEntriesForDocument(
          s.citationSnapshot,
          doc.fileName
        ).map((entry) => ({
          id: entry.id,
          content: entry.content,
          pageRef: entry.pageRef,
          headingPath: entry.headingPath,
        })),
      })),
      authorities: authorities.map((a) => ({
        citation: a.citation,
        type: a.type,
        normalized: a.normalized,
      })),
      embeddedCount: embeddedIds.size,
      signedUrl,
      parsedTextTruncated: isParsedTextTruncated(doc.parsedText),
    }
  } catch {
    /* DB unavailable */
  }

  if (!data) notFound()

  let canWrite = false
  let canDelete = false
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (user) {
      const access = await getMatterAccess(user.id, matterId)
      if (access?.role) {
        canWrite = roleHasPermission(access.role, "write")
        canDelete = roleHasPermission(access.role, "delete")
      }
    }
  } catch {
    /* permission probe failed — keep actions hidden */
  }

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
