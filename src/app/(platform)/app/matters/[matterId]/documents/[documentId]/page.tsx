import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { extractAuthorities } from "@/lib/legal/authorities"
import { createSignedUrl } from "@/lib/storage/documents"
import { DocumentWorkstation } from "./_workstation"
import type { WorkstationData } from "./_workstation"

export const dynamic = "force-dynamic"

export default async function DocumentViewerPage({
  params,
}: {
  params: { matterId: string; documentId: string }
}) {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let data: WorkstationData | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return null

    const doc = await prisma.document.findFirst({
      where: {
        id: params.documentId,
        matterId: params.matterId,
        matter: { userId: user.id },
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
        matter: { select: { title: true, clientName: true } },
        _count: { select: { chunks: true } },
      },
    })

    if (!doc) return notFound()

    // Fetch all chunks ordered by index
    const rawChunks = await prisma.documentChunk.findMany({
      where: { documentId: params.documentId },
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

    // Research sessions that referenced any chunk of this document
    const chunkIds = rawChunks.map((c) => c.id)
    let rawSessions: {
      id: string
      query: string
      chunkIds: string[]
      createdAt: Date
    }[] = []

    if (chunkIds.length > 0) {
      try {
        rawSessions = await prisma.researchSession.findMany({
          where: { chunkIds: { hasSome: chunkIds } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, query: true, chunkIds: true, createdAt: true },
        })
      } catch {
        /* ignore */
      }
    }

    // Extract authorities
    const authorities = doc.parsedText
      ? extractAuthorities(doc.parsedText)
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
        chunkCount: doc._count.chunks,
        extractionConf: doc.extractionConf,
        uploadStatus: doc.uploadStatus,
        indexingStatus: doc.indexingStatus,
        retrievalStatus: doc.retrievalStatus,
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
      })),
      authorities: authorities.map((a) => ({
        citation: a.citation,
        type: a.type,
        normalized: a.normalized,
      })),
      embeddedCount: embeddedIds.size,
      signedUrl,
    }
  } catch {
    /* DB unavailable */
  }

  if (!data) notFound()

  return <DocumentWorkstation data={data} />
}
