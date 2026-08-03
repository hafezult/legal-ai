/** Compact citation snapshot persisted with research/draft work product. */
export type CitationSnapshotEntry = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  /** Stable document id when available (preferred over fileName for linkage). */
  documentId?: string
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
    documentId?: string
  }>
): string {
  const entries: CitationSnapshotEntry[] = chunks
    .slice(0, MAX_SNAPSHOT_ENTRIES)
    .map((chunk) => {
      const entry: CitationSnapshotEntry = {
        id: chunk.id,
        content: chunk.content.slice(0, MAX_SNAPSHOT_CONTENT_CHARS),
        fileName: chunk.fileName.slice(0, 260),
        pageRef: chunk.pageRef,
        headingPath: chunk.headingPath ? chunk.headingPath.slice(0, 260) : null,
      }
      if (chunk.documentId) {
        entry.documentId = chunk.documentId.slice(0, 64)
      }
      return entry
    })
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
      const entry: CitationSnapshotEntry = {
        id: row.id,
        content: row.content,
        fileName: row.fileName,
        pageRef: typeof row.pageRef === "number" ? row.pageRef : null,
        headingPath: typeof row.headingPath === "string" ? row.headingPath : null,
      }
      if (typeof row.documentId === "string" && row.documentId.length > 0) {
        entry.documentId = row.documentId
      }
      entries.push(entry)
    }
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

function snapshotEntryMatchesDocument(
  entry: CitationSnapshotEntry,
  doc: { id?: string; fileName: string }
): boolean {
  if (entry.documentId && doc.id) return entry.documentId === doc.id
  return entry.fileName === doc.fileName
}

/**
 * True when a research/draft session referenced this document — either via
 * live chunk ids or an immutable citation snapshot. Prefers documentId when
 * present so same-named files in one matter do not cross-link; falls back to
 * fileName for legacy snapshots without documentId.
 */
export function sessionReferencesDocument(
  session: {
    chunkIds: string[]
    citationSnapshot?: string | null
  },
  doc: { id?: string; fileName: string; chunkIds: Iterable<string> }
): boolean {
  const live = new Set(doc.chunkIds)
  if (session.chunkIds.some((id) => live.has(id))) return true
  const snap = parseCitationSnapshot(session.citationSnapshot)
  return snap?.some((entry) => snapshotEntryMatchesDocument(entry, doc)) ?? false
}

/** Snapshot excerpts for a document when live chunk rows are gone. */
export function snapshotEntriesForDocument(
  citationSnapshot: string | null | undefined,
  doc: { id?: string; fileName: string } | string
): CitationSnapshotEntry[] {
  const snap = parseCitationSnapshot(citationSnapshot)
  if (!snap) return []
  const target = typeof doc === "string" ? { fileName: doc } : doc
  return snap.filter((entry) => snapshotEntryMatchesDocument(entry, target))
}

export type ProvenanceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
  documentId?: string
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
  return snapshot.map((row) => {
    const chunk: ProvenanceChunk = {
      id: row.id,
      content: row.content,
      fileName: row.fileName,
      pageRef: row.pageRef,
      headingPath: row.headingPath,
      distance: 0,
    }
    if (row.documentId) chunk.documentId = row.documentId
    return chunk
  })
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
