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
