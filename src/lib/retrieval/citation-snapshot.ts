/** Compact citation snapshot persisted with research/draft work product. */
export type CitationSnapshotEntry = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
}

const MAX_SNAPSHOT_CONTENT_CHARS = 4_000
const MAX_SNAPSHOT_ENTRIES = 24

export function buildCitationSnapshot(
  chunks: Array<{
    id: string
    content: string
    fileName: string
    pageRef: number | null
    headingPath: string | null
  }>
): string {
  const entries: CitationSnapshotEntry[] = chunks
    .slice(0, MAX_SNAPSHOT_ENTRIES)
    .map((chunk) => ({
      id: chunk.id,
      content: chunk.content.slice(0, MAX_SNAPSHOT_CONTENT_CHARS),
      fileName: chunk.fileName.slice(0, 260),
      pageRef: chunk.pageRef,
      headingPath: chunk.headingPath ? chunk.headingPath.slice(0, 260) : null,
    }))
  return JSON.stringify(entries)
}

export function parseCitationSnapshot(
  raw: string | null | undefined
): CitationSnapshotEntry[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const entries: CitationSnapshotEntry[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const row = item as Record<string, unknown>
      if (typeof row.id !== "string" || typeof row.content !== "string") continue
      if (typeof row.fileName !== "string") continue
      entries.push({
        id: row.id,
        content: row.content,
        fileName: row.fileName,
        pageRef: typeof row.pageRef === "number" ? row.pageRef : null,
        headingPath: typeof row.headingPath === "string" ? row.headingPath : null,
      })
    }
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

/**
 * True when a research/draft session referenced this document — either via
 * live chunk ids or an immutable citation snapshot filename match.
 * Used after reindex when published chunk ids rotate away.
 */
export function sessionReferencesDocument(
  session: {
    chunkIds: string[]
    citationSnapshot?: string | null
  },
  doc: { fileName: string; chunkIds: Iterable<string> }
): boolean {
  const live = new Set(doc.chunkIds)
  if (session.chunkIds.some((id) => live.has(id))) return true
  const snap = parseCitationSnapshot(session.citationSnapshot)
  return snap?.some((entry) => entry.fileName === doc.fileName) ?? false
}

/** Snapshot excerpts for a document when live chunk rows are gone. */
export function snapshotEntriesForDocument(
  citationSnapshot: string | null | undefined,
  fileName: string
): CitationSnapshotEntry[] {
  const snap = parseCitationSnapshot(citationSnapshot)
  if (!snap) return []
  return snap.filter((entry) => entry.fileName === fileName)
}

export type ProvenanceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
}

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
 * Prefer citation snapshots for restored provenance. Returns null when no
 * usable snapshot exists so callers can fall back to live DocumentChunk rows.
 */
export function resolveProvenanceFromSnapshot(
  chunkIds: string[],
  citationSnapshot?: string | null
): ProvenanceChunk[] | null {
  const fromSnapshot = parseCitationSnapshot(citationSnapshot)
  if (!fromSnapshot) return null

  const restored = provenanceChunksFromSnapshot(fromSnapshot)
  const ordered = orderProvenanceByChunkIds(restored, chunkIds)
  if (ordered.length > 0) return ordered
  // Snapshot present but ids mismatched — still return snapshot order.
  return restored
}
