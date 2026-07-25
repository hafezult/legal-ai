import { prisma } from "@/lib/prisma"

export type ProvenanceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
}

/**
 * Load stored retrieval chunks for a matter, preserving the original chunkIds order.
 * Distance is set to 0 for restored provenance (live relevance is not re-scored).
 */
export async function loadProvenanceChunks(
  matterId: string,
  chunkIds: string[]
): Promise<ProvenanceChunk[]> {
  if (!matterId || chunkIds.length === 0) return []

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

  const byId = new Map(rows.map((row) => [row.id, row]))

  return chunkIds
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => ({
      id: row.id,
      content: row.content,
      fileName: row.document.fileName,
      pageRef: row.pageRef,
      headingPath: row.headingPath,
      distance: 0,
    }))
}
