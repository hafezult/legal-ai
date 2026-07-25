// Document indexing pipeline: upload → parse → chunk → embed → index → retrieval-ready

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/prisma"
import { extractText } from "@/lib/parsing"
import { chunkDocument } from "@/lib/retrieval/chunking"
import {
  DEFAULT_CONFIG,
  generateBatchEmbeddings,
  isEmbeddingConfigured,
} from "@/lib/ai/embeddings"
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

/** Thrown when a newer claim superseded this run mid-pipeline. */
export class IndexingRunSupersededError extends Error {
  readonly documentId: string
  readonly runId: string

  constructor(documentId: string, runId: string) {
    super(
      `Document ${documentId}: indexing run ${runId} was superseded by a newer claim.`
    )
    this.name = "IndexingRunSupersededError"
    this.documentId = documentId
    this.runId = runId
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

export function isIndexingRunSupersededError(
  error: unknown
): error is IndexingRunSupersededError {
  return (
    error instanceof IndexingRunSupersededError ||
    (error instanceof Error && error.name === "IndexingRunSupersededError")
  )
}

async function setStatus(
  documentId: string,
  runId: string,
  indexingStatus: PipelineStatus,
  extra: Record<string, unknown> = {}
) {
  const updated = await prisma.document.updateMany({
    where: { id: documentId, indexingRunId: runId },
    data: { indexingStatus, ...extra },
  })
  if (updated.count !== 1) {
    throw new IndexingRunSupersededError(documentId, runId)
  }
}

async function assertRunActive(documentId: string, runId: string) {
  const current = await prisma.document.findFirst({
    where: { id: documentId, indexingRunId: runId },
    select: { id: true },
  })
  if (!current) {
    throw new IndexingRunSupersededError(documentId, runId)
  }
}

/**
 * Atomically claim a document for indexing so parallel upload/reindex/HTTP
 * triggers cannot interleave chunk deletes and embedding writes.
 * Stale in-progress claims (older than STALE_INDEXING_MS) may be reclaimed.
 * Each successful claim receives a unique indexingRunId lease; later status
 * and publish steps are conditional on that run id so a long embed cannot be
 * overwritten by a stale reclaim that started afterward.
 */
async function claimDocumentForIndexing(
  documentId: string
): Promise<string | null> {
  const staleBefore = new Date(Date.now() - STALE_INDEXING_MS)
  const runId = randomUUID()
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
      indexingRunId: runId,
    },
  })
  return claimed.count === 1 ? runId : null
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

  const runId = await claimDocumentForIndexing(documentId)
  if (!runId) {
    throw new IndexingInProgressError(documentId)
  }

  // ── 1. Parse ────────────────────────────────────────────────────────────
  let parsed
  try {
    parsed = await extractText(doc.storagePath, doc.mimeType, doc.fileName)
  } catch (err) {
    await setStatus(documentId, runId, "failed", { parseStatus: "failed" })
    throw err
  }

  await setStatus(documentId, runId, "chunking", {
    parseStatus: "parsed",
    parsedText: parsed.text.slice(0, 50_000), // cap at 50 k chars
    pageCount: parsed.pageCount,
    extractionConf: parsed.confidence,
  })

  // ── 2. Chunk ────────────────────────────────────────────────────────────
  const chunks = chunkDocument(parsed.text, parsed.headings, parsed.pageCount)

  // Clear any previous chunks only while this run still owns the lease.
  await assertRunActive(documentId, runId)
  await prisma.documentChunk.deleteMany({ where: { documentId } })

  if (chunks.length === 0) {
    await setStatus(documentId, runId, "failed", {
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

  await setStatus(documentId, runId, "embedding", { chunkCount: chunks.length })

  // ── 3. Embed ────────────────────────────────────────────────────────────
  if (!isEmbeddingConfigured()) {
    // No API key — mark as indexed without semantic retrieval
    await setStatus(documentId, runId, "indexed", { retrievalStatus: "pending" })
    return
  }

  let embeddings: number[][]
  try {
    embeddings = await generateBatchEmbeddings(chunks.map((c) => c.content))
  } catch (err) {
    // Chunks remain for retry, but surface the failure to upload/reindex callers.
    const message =
      err instanceof Error ? err.message.slice(0, 240) : "Embedding provider failed"
    await setStatus(documentId, runId, "indexed", { retrievalStatus: "failed" })
    console.error(`[indexing] embedding failed for ${documentId}:`, message)
    throw new Error(`Embedding failed: ${message}`)
  }

  const expectedDimensions = DEFAULT_CONFIG.dimensions
  if (embeddings.length !== chunks.length) {
    const message = `Embedding provider returned ${embeddings.length} vectors for ${chunks.length} chunks`
    await setStatus(documentId, runId, "indexed", { retrievalStatus: "failed" })
    console.error(`[indexing] embedding shape failed for ${documentId}:`, message)
    throw new Error(`Embedding failed: ${message}`)
  }
  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i]
    if (!emb || emb.length !== expectedDimensions) {
      const message = `Embedding ${i} has ${emb?.length ?? 0} dimensions; expected ${expectedDimensions}`
      await setStatus(documentId, runId, "indexed", { retrievalStatus: "failed" })
      console.error(`[indexing] embedding shape failed for ${documentId}:`, message)
      throw new Error(`Embedding failed: ${message}`)
    }
  }

  // Abort before publishing vectors if a newer claim took the lease.
  await assertRunActive(documentId, runId)

  // ── 4. Store embeddings (pgvector, raw SQL) ─────────────────────────────
  for (let i = 0; i < created.length; i++) {
    const emb = embeddings[i]
    const vec = `[${emb.join(",")}]`
    await prisma.$executeRaw`
      UPDATE "DocumentChunk"
      SET embedding = ${vec}::vector
      WHERE id = ${created[i].id}
    `
  }

  // Authorities are extracted at research time from retrieved chunk content.
  await setStatus(documentId, runId, "retrieval-ready", {
    retrievalStatus: "ready",
  })
}
