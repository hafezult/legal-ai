// Document indexing pipeline: upload → parse → chunk → embed → index → retrieval-ready

import { prisma } from "@/lib/prisma"
import { extractText } from "@/lib/parsing"
import { chunkDocument } from "@/lib/retrieval/chunking"
import { generateBatchEmbeddings, isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { STALE_INDEXING_MS } from "@/lib/documents/status"

export type PipelineStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexed"
  | "retrieval-ready"
  | "failed"

const IN_PROGRESS_STATUSES = ["parsing", "chunking", "embedding"] as const

/** Thrown when another non-stale pipeline claim already holds the document. */
export class IndexingInProgressError extends Error {
  readonly documentId: string

  constructor(documentId: string) {
    super(
      `Document ${documentId}: indexing already in progress. Retry after it finishes or stalls.`
    )
    this.name = "IndexingInProgressError"
    this.documentId = documentId
  }
}

export function isIndexingInProgressError(
  error: unknown
): error is IndexingInProgressError {
  return (
    error instanceof IndexingInProgressError ||
    (error instanceof Error && error.name === "IndexingInProgressError")
  )
}

async function setStatus(
  documentId: string,
  indexingStatus: PipelineStatus,
  extra: Record<string, unknown> = {}
) {
  await prisma.document.update({
    where: { id: documentId },
    data: { indexingStatus, ...extra },
  })
}

/**
 * Atomically claim a document for indexing so parallel upload/reindex/HTTP
 * triggers cannot interleave chunk deletes and embedding writes.
 * Stale in-progress claims (older than STALE_INDEXING_MS) may be reclaimed.
 * Claim also resets retrieval/parse so callers must not pre-flip status to
 * `pending` (that would defeat the in-progress guard).
 */
async function claimDocumentForIndexing(documentId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_INDEXING_MS)
  const claimed = await prisma.document.updateMany({
    where: {
      id: documentId,
      OR: [
        { indexingStatus: { notIn: [...IN_PROGRESS_STATUSES] } },
        { updatedAt: { lt: staleBefore } },
      ],
    },
    data: {
      indexingStatus: "parsing",
      parseStatus: "parsing",
      retrievalStatus: "pending",
    },
  })
  return claimed.count === 1
}

export async function runIndexingPipeline(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      matterId: true,
      fileName: true,
      storagePath: true,
      mimeType: true,
    },
  })

  if (!doc?.storagePath || !doc.mimeType) {
    throw new Error(`Document ${documentId}: missing storage path or MIME type.`)
  }

  const claimed = await claimDocumentForIndexing(documentId)
  if (!claimed) {
    throw new IndexingInProgressError(documentId)
  }

  // ── 1. Parse ────────────────────────────────────────────────────────────
  let parsed
  try {
    parsed = await extractText(doc.storagePath, doc.mimeType, doc.fileName)
  } catch (err) {
    await setStatus(documentId, "failed", { parseStatus: "failed" })
    throw err
  }

  await setStatus(documentId, "chunking", {
    parseStatus: "parsed",
    parsedText: parsed.text.slice(0, 50_000), // cap at 50 k chars
    pageCount: parsed.pageCount,
    extractionConf: parsed.confidence,
  })

  // ── 2. Chunk ────────────────────────────────────────────────────────────
  const chunks = chunkDocument(parsed.text, parsed.headings, parsed.pageCount)

  // Clear any previous chunks (idempotent re-indexing)
  await prisma.documentChunk.deleteMany({ where: { documentId } })

  if (chunks.length === 0) {
    await setStatus(documentId, "failed", {
      parseStatus: "parsed",
      chunkCount: 0,
      retrievalStatus: "failed",
    })
    throw new Error(
      `Document ${documentId}: no extractable text chunks (empty or unscannable source).`
    )
  }

  // Persist chunks without embeddings
  const created = await prisma.$transaction(
    chunks.map((c) =>
      prisma.documentChunk.create({
        data: {
          documentId,
          matterId: doc.matterId,
          content: c.content,
          chunkIndex: c.chunkIndex,
          tokenCount: c.tokenCount,
          pageRef: c.pageRef,
          headingPath: c.headingPath,
        },
      })
    )
  )

  await setStatus(documentId, "embedding", { chunkCount: chunks.length })

  // ── 3. Embed ────────────────────────────────────────────────────────────
  if (!isEmbeddingConfigured()) {
    // No API key — mark as indexed without semantic retrieval
    await setStatus(documentId, "indexed", { retrievalStatus: "pending" })
    return
  }

  let embeddings: number[][]
  try {
    embeddings = await generateBatchEmbeddings(chunks.map((c) => c.content))
  } catch (err) {
    // Chunks remain for retry, but surface the failure to upload/reindex callers.
    const message =
      err instanceof Error ? err.message.slice(0, 240) : "Embedding provider failed"
    await setStatus(documentId, "indexed", { retrievalStatus: "failed" })
    console.error(`[indexing] embedding failed for ${documentId}:`, message)
    throw new Error(`Embedding failed: ${message}`)
  }

  // ── 4. Store embeddings (pgvector, raw SQL) ─────────────────────────────
  for (let i = 0; i < created.length; i++) {
    const emb = embeddings[i]
    if (!emb) continue
    const vec = `[${emb.join(",")}]`
    await prisma.$executeRaw`
      UPDATE "DocumentChunk"
      SET embedding = ${vec}::vector
      WHERE id = ${created[i].id}
    `
  }

  // Authorities are extracted at research time from retrieved chunk content.
  await setStatus(documentId, "retrieval-ready", {
    retrievalStatus: "ready",
  })
}
