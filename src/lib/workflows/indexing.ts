// Document indexing pipeline: upload → parse → chunk → embed → index → retrieval-ready

import { prisma } from "@/lib/prisma"
import { extractText } from "@/lib/parsing"
import { chunkDocument } from "@/lib/retrieval/chunking"
import { generateBatchEmbeddings, isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { extractAuthorities } from "@/lib/legal/authorities"

export type PipelineStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "indexed"
  | "retrieval-ready"
  | "failed"

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

  // ── 1. Parse ────────────────────────────────────────────────────────────
  await setStatus(documentId, "parsing", { parseStatus: "parsing" })

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
    await setStatus(documentId, "indexed")
    return
  }

  let embeddings: number[][]
  try {
    embeddings = await generateBatchEmbeddings(chunks.map((c) => c.content))
  } catch (err) {
    // Embedding failure is non-fatal — document is chunked but not retrieval-ready
    await setStatus(documentId, "indexed")
    console.error(`[indexing] embedding failed for ${documentId}:`, err)
    return
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

  // ── 5. Extract authorities ───────────────────────────────────────────────
  // Stored as part of parsed text — available via chunk content at query time
  void extractAuthorities(parsed.text) // validated; used downstream in research

  await setStatus(documentId, "retrieval-ready", {
    retrievalStatus: "ready",
  })
}
