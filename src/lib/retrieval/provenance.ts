import { prisma } from "@/lib/prisma"
import {
  buildCitationSnapshot,
  parseCitationSnapshot,
  orderProvenanceByChunkIds,
  provenanceChunksFromSnapshot,
  resolveProvenanceFromSnapshot,
  type CitationSnapshotEntry,
  type ProvenanceChunk,
} from "@/lib/retrieval/citation-snapshot"

export type { ProvenanceChunk, CitationSnapshotEntry }
export {
  buildCitationSnapshot,
  parseCitationSnapshot,
  orderProvenanceByChunkIds,
  provenanceChunksFromSnapshot,
  resolveProvenanceFromSnapshot,
}

/**
 * Load stored retrieval chunks for a matter, preserving the original chunkIds order.
 * Distance is set to 0 for restored provenance (live relevance is not re-scored).
 *
 * Prefer an immutable citationSnapshot when present so reindex/delete of live
 * DocumentChunk rows cannot erase legal provenance for saved work product.
 */
export async function loadProvenanceChunks(
  matterId: string,
  chunkIds: string[],
  citationSnapshot?: string | null
): Promise<ProvenanceChunk[]> {
  if (!matterId || chunkIds.length === 0) return []

  const fromSnapshot = resolveProvenanceFromSnapshot(chunkIds, citationSnapshot)
  if (fromSnapshot) return fromSnapshot

  const uniqueIds = Array.from(new Set(chunkIds.filter(Boolean)))
  if (uniqueIds.length === 0) return []

  const rows = await prisma.documentChunk.findMany({
    where: {
      matterId,
      id: { in: uniqueIds },
    },
    select: {
      id: true,
      content: true,
      pageRef: true,
      headingPath: true,
      document: { select: { fileName: true } },
    },
  })

  return orderProvenanceByChunkIds(
    rows.map((row) => ({
      id: row.id,
      content: row.content,
      fileName: row.document.fileName,
      pageRef: row.pageRef,
      headingPath: row.headingPath,
      distance: 0,
    })),
    chunkIds
  )
}
