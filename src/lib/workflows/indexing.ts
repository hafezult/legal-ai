// Document indexing pipeline: upload → parse → chunk → embed → index → retrieval-ready
// Reindex keeps the prior published generation searchable until the new run publishes.

import { randomUUID } from "node:crypto"

import { prisma } from "@/lib/prisma"
import { extractText } from "@/lib/parsing"
import { chunkDocument } from "@/lib/retrieval/chunking"
import {
  DEFAULT_CONFIG,
  generateBatchEmbeddings,
  isEmbeddingConfigured,
} from "@/lib/ai/embeddings"
import { PARSED_TEXT_MAX_CHARS } from "@/lib/documents/parsed-text"
import { STALE_INDEXING_MS } from "@/lib/documents/status"
import {
  IndexingInProgressError,
  IndexingRunSupersededError,
  isIndexingInProgressError,
  isIndexingRunSupersededError,
} from "@/lib/workflows/indexing-errors"
import {
  restorePublishedStatusFields,
  shouldPreservePublishedIndex,
  shouldStageChunkCount,
} from "@/lib/workflows/indexing-publish"

export type IndexingPipelineResult = {
  /** Soft outcome (e.g. embeddings skipped) that still left the doc usable. */
  warning?: string
}

export type PipelineStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexed"
  | "retrieval-ready"
  | "failed"

export {
  IndexingInProgressError,
  IndexingRunSupersededError,
  isIndexingInProgressError,
  isIndexingRunSupersededError,
}

const IN_PROGRESS_STATUSES = ["parsing", "chunking", "embedding"] as const

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

/** Drop only this run's staged chunks (never the published generation). */
async function discardRunChunks(documentId: string, runId: string) {
  await prisma.$executeRaw`
    DELETE FROM "DocumentChunk" AS c
    USING "Document" AS d
    WHERE c."documentId" = d.id
      AND d.id = ${documentId}
      AND d."indexingRunId" = ${runId}
      AND c."indexingRunId" = ${runId}
  `
}

/**
 * After a failed/no-op reindex that preserved a published generation, restore
 * retrieval so search keeps serving publishedRunId chunks.
 * Restores chunkCount from the live published generation and parseStatus so
 * the workstation does not show a stuck "parsing" state.
 *
 * When `indexingStatus` is `"failed"`, retrieval stays ready (search ignores
 * indexing status) but Workflows/Documents still surface Retry.
 */
async function restorePublishedReady(
  documentId: string,
  runId: string,
  options: { indexingStatus?: "retrieval-ready" | "failed" } = {}
) {
  await discardRunChunks(documentId, runId)

  const current = await prisma.document.findFirst({
    where: {
      id: documentId,
      indexingRunId: runId,
      publishedRunId: { not: null },
    },
    select: { publishedRunId: true },
  })
  if (!current?.publishedRunId) return

  const chunkCount = await prisma.documentChunk.count({
    where: {
      documentId,
      indexingRunId: current.publishedRunId,
    },
  })

  await prisma.document.updateMany({
    where: {
      id: documentId,
      indexingRunId: runId,
      publishedRunId: current.publishedRunId,
    },
    data: {
      ...restorePublishedStatusFields({
        indexingStatus: options.indexingStatus ?? "retrieval-ready",
      }),
      chunkCount,
    },
  })
}

/**
 * Atomically swap publishedRunId to this run and delete superseded chunks.
 */
async function publishRun(
  documentId: string,
  runId: string,
  extra: Record<string, unknown> = {}
) {
  await prisma.$transaction(async (tx) => {
    const published = await tx.document.updateMany({
      where: { id: documentId, indexingRunId: runId },
      data: {
        indexingStatus: "retrieval-ready",
        retrievalStatus: "ready",
        publishedRunId: runId,
        ...extra,
      },
    })
    if (published.count !== 1) {
      throw new IndexingRunSupersededError(documentId, runId)
    }
    await tx.$executeRaw`
      DELETE FROM "DocumentChunk" AS c
      USING "Document" AS d
      WHERE c."documentId" = d.id
        AND d.id = ${documentId}
        AND d."indexingRunId" = ${runId}
        AND d."publishedRunId" = ${runId}
        AND (c."indexingRunId" IS DISTINCT FROM ${runId})
    `
  })
}

/**
 * Atomically claim a document for indexing so parallel upload/reindex/HTTP
 * triggers cannot interleave chunk deletes and embedding writes.
 * Stale in-progress claims (older than STALE_INDEXING_MS) may be reclaimed.
 * Each successful claim receives a unique indexingRunId lease; later status
 * and publish steps are conditional on that run id so a long embed cannot be
 * overwritten by a stale reclaim that started afterward.
 *
 * When a publishedRunId already serves retrieval, the claim keeps
 * retrievalStatus=ready so the prior generation stays searchable.
 */
async function claimDocumentForIndexing(
  documentId: string
): Promise<{ runId: string; preservePublished: boolean } | null> {
  const staleBefore = new Date(Date.now() - STALE_INDEXING_MS)
  const runId = randomUUID()

  const current = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      publishedRunId: true,
      retrievalStatus: true,
      indexingStatus: true,
      updatedAt: true,
    },
  })
  if (!current) return null

  const preservePublished = shouldPreservePublishedIndex(current)

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
      indexingRunId: runId,
      ...(preservePublished ? {} : { retrievalStatus: "pending" }),
    },
  })
  return claimed.count === 1 ? { runId, preservePublished } : null
}

export async function runIndexingPipeline(
  documentId: string
): Promise<IndexingPipelineResult> {
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

  const claim = await claimDocumentForIndexing(documentId)
  if (!claim) {
    throw new IndexingInProgressError(documentId)
  }
  const { runId, preservePublished } = claim

  const failOrRestore = async (
    indexingStatus: PipelineStatus,
    extra: Record<string, unknown> = {}
  ) => {
    if (preservePublished) {
      // Keep prior publish searchable; leave a durable failed signal for Retry.
      await restorePublishedReady(documentId, runId, {
        indexingStatus: "failed",
      })
      return
    }
    await setStatus(documentId, runId, indexingStatus, extra)
  }

  // ── 1. Parse ────────────────────────────────────────────────────────────
  // Keep the lease warm during long PDF/DOCX extraction so a 10-minute stale
  // reclaim cannot steal the document mid-parse.
  const parseHeartbeat = setInterval(() => {
    void prisma.document.updateMany({
      where: { id: documentId, indexingRunId: runId },
      data: { updatedAt: new Date() },
    })
  }, 60_000)
  let parsed
  try {
    parsed = await extractText(doc.storagePath, doc.mimeType, doc.fileName)
  } catch (err) {
    await failOrRestore("failed", { parseStatus: "failed" })
    throw err
  } finally {
    clearInterval(parseHeartbeat)
  }

  await setStatus(documentId, runId, "chunking", {
    parseStatus: "parsed",
    parsedText: parsed.text.slice(0, PARSED_TEXT_MAX_CHARS),
    pageCount: parsed.pageCount,
    extractionConf: parsed.confidence,
  })

  // ── 2. Chunk ────────────────────────────────────────────────────────────
  const chunks = chunkDocument(parsed.text, parsed.headings, parsed.pageCount)

  // Remove unpublished leftovers from earlier failed runs. Never delete the
  // published generation — that stays live until publishRun swaps it.
  await prisma.$executeRaw`
    DELETE FROM "DocumentChunk" AS c
    USING "Document" AS d
    WHERE c."documentId" = d.id
      AND d.id = ${documentId}
      AND d."indexingRunId" = ${runId}
      AND (
        d."publishedRunId" IS NULL
        OR c."indexingRunId" IS DISTINCT FROM d."publishedRunId"
      )
  `
  await assertRunActive(documentId, runId)

  if (chunks.length === 0) {
    await failOrRestore("failed", {
      parseStatus: "parsed",
      chunkCount: 0,
      retrievalStatus: "failed",
    })
    throw new Error(
      `Document ${documentId}: no extractable text chunks (empty or unscannable source).`
    )
  }

  // Persist staged chunks tagged with this run. Each batch re-checks the lease
  // inside the same transaction as the inserts so a superseded run cannot leave
  // orphan DocumentChunk rows after a stale reclaim.
  const created: { id: string }[] = []
  const CREATE_BATCH = 40
  for (let offset = 0; offset < chunks.length; offset += CREATE_BATCH) {
    const slice = chunks.slice(offset, offset + CREATE_BATCH)
    const batch = await prisma.$transaction(async (tx) => {
      const active = await tx.document.findFirst({
        where: { id: documentId, indexingRunId: runId },
        select: { id: true },
      })
      if (!active) {
        throw new IndexingRunSupersededError(documentId, runId)
      }
      const rows = await Promise.all(
        slice.map((c) =>
          tx.documentChunk.create({
            data: {
              documentId,
              matterId: doc.matterId,
              indexingRunId: runId,
              content: c.content,
              chunkIndex: c.chunkIndex,
              tokenCount: c.tokenCount,
              pageRef: c.pageRef,
              headingPath: c.headingPath,
            },
            select: { id: true },
          })
        )
      )
      await tx.document.updateMany({
        where: { id: documentId, indexingRunId: runId },
        data: { updatedAt: new Date() },
      })
      return rows
    })
    created.push(...batch)
  }

  // Do not stamp chunkCount while a published generation is live — a failed
  // embed would otherwise leave the registry showing the discarded stage size.
  await setStatus(
    documentId,
    runId,
    "embedding",
    shouldStageChunkCount(preservePublished)
      ? { chunkCount: chunks.length }
      : {}
  )

  // ── 3. Embed ────────────────────────────────────────────────────────────
  if (!isEmbeddingConfigured()) {
    // No API key — keep staged chunks for retry; restore prior publish if any.
    if (preservePublished) {
      await restorePublishedReady(documentId, runId)
      return {
        warning:
          "Embeddings unavailable. Prior published index left unchanged. Configure OPENAI_API_KEY and retry to refresh retrieval.",
      }
    }
    await setStatus(documentId, runId, "indexed", {
      retrievalStatus: "pending",
      chunkCount: chunks.length,
    })
    return {
      warning:
        "Document parsed and chunked, but embeddings are unavailable. Configure OPENAI_API_KEY and retry indexing to enable retrieval.",
    }
  }

  let embeddings: number[][]
  try {
    embeddings = await generateBatchEmbeddings(
      chunks.map((c) => c.content),
      {},
      {
        // Keep the lease fresh during long embedding batches so a reclaim
        // cannot start while this run is still actively calling OpenAI.
        onBatchComplete: async () => {
          await assertRunActive(documentId, runId)
          await prisma.document.updateMany({
            where: { id: documentId, indexingRunId: runId },
            data: { updatedAt: new Date() },
          })
        },
        // Leave headroom under the 300s page/route maxDuration for parse +
        // vector writes; fail cleanly so the lease can restore/retry.
        deadlineMs: 240_000,
      }
    )
  } catch (err) {
    if (isIndexingRunSupersededError(err)) throw err
    const message =
      err instanceof Error ? err.message.slice(0, 240) : "Embedding provider failed"
    await failOrRestore("indexed", { retrievalStatus: "failed" })
    console.error(`[indexing] embedding failed for ${documentId}:`, message)
    throw new Error(`Embedding failed: ${message}`)
  }

  const expectedDimensions = DEFAULT_CONFIG.dimensions
  if (embeddings.length !== chunks.length) {
    const message = `Embedding provider returned ${embeddings.length} vectors for ${chunks.length} chunks`
    await failOrRestore("indexed", { retrievalStatus: "failed" })
    console.error(`[indexing] embedding shape failed for ${documentId}:`, message)
    throw new Error(`Embedding failed: ${message}`)
  }
  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i]
    if (!emb || emb.length !== expectedDimensions) {
      const message = `Embedding ${i} has ${emb?.length ?? 0} dimensions; expected ${expectedDimensions}`
      await failOrRestore("indexed", { retrievalStatus: "failed" })
      console.error(`[indexing] embedding shape failed for ${documentId}:`, message)
      throw new Error(`Embedding failed: ${message}`)
    }
  }

  // Abort before publishing vectors if a newer claim took the lease.
  await assertRunActive(documentId, runId)

  // ── 4. Store embeddings on this run's staged chunks only ────────────────
  for (let i = 0; i < created.length; i++) {
    const emb = embeddings[i]
    const vec = `[${emb.join(",")}]`
    const updated = await prisma.$executeRaw`
      UPDATE "DocumentChunk" AS c
      SET embedding = ${vec}::vector
      FROM "Document" AS d
      WHERE c.id = ${created[i].id}
        AND c."documentId" = d.id
        AND c."indexingRunId" = ${runId}
        AND d."indexingRunId" = ${runId}
    `
    if (Number(updated) !== 1) {
      throw new IndexingRunSupersededError(documentId, runId)
    }
    // Heartbeat every 25 vector writes so long publishes keep the lease warm.
    if (i > 0 && i % 25 === 0) {
      await prisma.document.updateMany({
        where: { id: documentId, indexingRunId: runId },
        data: { updatedAt: new Date() },
      })
    }
  }

  // ── 5. Atomic publish: swap publishedRunId, drop superseded chunks ──────
  // Authorities are extracted at research time from retrieved chunk content.
  await publishRun(documentId, runId, {
    chunkCount: chunks.length,
  })
  return {}
}
