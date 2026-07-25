import { prisma } from "@/lib/prisma"
import {
  buildCitationSnapshot,
  parseCitationSnapshot,
  type CitationSnapshotEntry,
} from "@/lib/retrieval/citation-snapshot"

export type ProvenanceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
}

export type { CitationSnapshotEntry }
export { buildCitationSnapshot, parseCitationSnapshot }

/** Preserve the original retrieval hit order when reconstituting chunks. */
export function orderProvenanceByChunkIds<T extends { id: string }>(
  rows: T[],
  chunkIds: string[]
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return chunkIds
    .map((id) => byId.get(id))
    .filter((row): row is T => Boolean(row))
}

/** Map an immutable citation snapshot into provenance chunks (distance 0). */
export function provenanceChunksFromSnapshot(
  snapshot: CitationSnapshotEntry[]
): ProvenanceChunk[] {
  return snapshot.map((row) => ({
    id: row.id,
    content: row.content,
    fileName: row.fileName,
    pageRef: row.pageRef,
    headingPath: row.headingPath,
    distance: 0,
  }))
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

  const fromSnapshot = parseCitationSnapshot(citationSnapshot)
  if (fromSnapshot) {
    const restored = provenanceChunksFromSnapshot(fromSnapshot)
    const ordered = orderProvenanceByChunkIds(restored, chunkIds)
    if (ordered.length > 0) return ordered
    // Snapshot present but ids mismatched — still return snapshot order.
    return restored
  }

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
