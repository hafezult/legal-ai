"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

// ── Serialised types (passed from RSC) ────────────────────────────────────

export type WorkstationDoc = {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  pageCount: number | null
  chunkCount: number
  extractionConf: number | null
  uploadStatus: string
  indexingStatus: string
  retrievalStatus: string
  parseStatus: string
  parsedText: string | null
  uploadedAt: string
  updatedAt: string
  matterId: string
  matterTitle: string
  matterClient: string | null
}

export type WorkstationChunk = {
  id: string
  chunkIndex: number
  content: string
  tokenCount: number
  pageRef: number | null
  headingPath: string | null
  hasEmbedding: boolean
  createdAt: string
}

export type WorkstationSession = {
  id: string
  query: string
  chunkIds: string[]
  createdAt: string
}

export type WorkstationAuthority = {
  citation: string
  type: string
  normalized: string
}

export type WorkstationData = {
  doc: WorkstationDoc
  chunks: WorkstationChunk[]
  sessions: WorkstationSession[]
  authorities: WorkstationAuthority[]
  embeddedCount: number
  signedUrl: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(n: number | null): string {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }).format(new Date(iso))
}

function mimeLabel(m: string | null): string {
  if (!m) return "—"
  if (m === "application/pdf") return "PDF"
  if (m.includes("wordprocessingml")) return "DOCX"
  if (m === "text/plain") return "TXT"
  return m.split("/")[1]?.toUpperCase() ?? "—"
}

function authorityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    case_neutral: "Neutral citations",
    case_report:  "Law reports",
    statute:      "Legislation",
    cpr:          "CPR",
    practice_dir: "Practice directions",
    statutory_inst: "Statutory instruments",
  }
  return labels[type] ?? type
}

const AUTHORITY_ORDER = [
  "case_neutral", "case_report", "statute", "cpr", "practice_dir", "statutory_inst",
]

const STORAGE_SPLIT = "aether-ws-split"
const STORAGE_TAB   = "aether-ws-tab"
const DEFAULT_SPLIT = 55

type Tab = "overview" | "chunks" | "authorities" | "parsed" | "retrieval" | "timeline"

// ── Source document viewer (left panel) ───────────────────────────────────

function DocViewer({
  doc,
  signedUrl,
}: {
  doc: WorkstationDoc
  signedUrl: string | null
}) {
  const isPdf = doc.mimeType === "application/pdf"

  return (
    <div className="flex h-full flex-col">
      {/* Viewer toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-black/40 px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-white/55">{doc.fileName}</p>
          <p className="text-[10px] text-white/30">
            {mimeLabel(doc.mimeType)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
            {doc.fileSize ? ` · ${fmtBytes(doc.fileSize)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-white/30 transition-colors hover:text-white/60"
            >
              Open ↗
            </a>
          )}
        </div>
      </div>

      {/* Document surface */}
      <div className="relative flex-1 overflow-hidden bg-zinc-900/60">
        {!signedUrl ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-white/38">Source document unavailable</p>
              <p className="mt-1 text-xs text-white/22">
                Storage credentials may need renewal.
              </p>
            </div>
          </div>
        ) : isPdf ? (
          <iframe
            src={signedUrl}
            className="h-full w-full border-0"
            title={doc.fileName}
          />
        ) : (
          /* TXT / DOCX — render parsed text */
          <div className="h-full overflow-y-auto p-6">
            {doc.mimeType?.includes("wordprocessingml") && (
              <p className="mb-4 rounded border border-amber-400/[0.15] bg-amber-400/[0.04] px-3 py-2 text-[11px] text-amber-400/60">
                DOCX rendering — displaying parsed text representation.
                Original formatting not preserved.
              </p>
            )}
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[1.75] text-white/62">
              {doc.parsedText ?? "No parsed text available."}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────

function TabOverview({
  doc,
  embeddedCount,
  sessionCount,
  authorityCount,
}: {
  doc: WorkstationDoc
  embeddedCount: number
  sessionCount: number
  authorityCount: number
}) {
  const pipeline = [
    {
      label: "Upload",
      note: "Document received",
      done: true,
      detail: fmtDate(doc.uploadedAt),
    },
    {
      label: "Parsing",
      note: doc.parseStatus === "parsed" ? "Complete" : doc.parseStatus,
      done: doc.parseStatus === "parsed",
      detail: doc.extractionConf != null
        ? `${Math.round(doc.extractionConf * 100)}% confidence · ${doc.pageCount ?? "—"} pages`
        : "",
    },
    {
      label: "Chunking",
      note: doc.chunkCount > 0 ? `${doc.chunkCount} chunks` : "Pending",
      done: doc.chunkCount > 0,
      detail: doc.chunkCount > 0 ? `${doc.chunkCount} semantic units created` : "",
    },
    {
      label: "Embedding",
      note: embeddedCount > 0 ? `${embeddedCount} / ${doc.chunkCount}` : doc.indexingStatus,
      done: doc.indexingStatus === "retrieval-ready",
      detail: embeddedCount > 0 ? "Vector representations stored" : "",
    },
    {
      label: "Retrieval ready",
      note: doc.retrievalStatus === "ready" ? "Active" : "Pending",
      done: doc.retrievalStatus === "ready",
      detail: doc.retrievalStatus === "ready" ? "Available for research queries" : "",
    },
  ]

  const metrics = [
    { label: "Chunks",       value: String(doc.chunkCount) },
    { label: "Embedded",     value: `${embeddedCount} / ${doc.chunkCount}` },
    { label: "Authorities",  value: String(authorityCount) },
    { label: "Research uses",value: String(sessionCount) },
    { label: "Pages",        value: doc.pageCount ? String(doc.pageCount) : "—" },
    { label: "File size",    value: fmtBytes(doc.fileSize) },
    { label: "Confidence",   value: doc.extractionConf != null ? `${Math.round(doc.extractionConf * 100)}%` : "—" },
    { label: "Parser",       value: mimeLabel(doc.mimeType) === "PDF" ? "pdf-parse" : mimeLabel(doc.mimeType) === "DOCX" ? "mammoth" : "buffer" },
  ]

  return (
    <div className="space-y-6 p-5">
      {/* Metadata */}
      <section>
        <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
          Document metadata
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            { label: "File",        value: doc.fileName },
            { label: "Format",      value: mimeLabel(doc.mimeType) },
            { label: "Ingested",    value: fmtDate(doc.uploadedAt) },
            { label: "Last updated",value: fmtDate(doc.updatedAt) },
            { label: "Matter",      value: doc.matterTitle },
            { label: "Client",      value: doc.matterClient ?? "—" },
          ].map((f) => (
            <div key={f.label}>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/28">{f.label}</p>
              <p className="mt-0.5 truncate text-xs text-white/65">{f.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section>
        <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
          Ingestion pipeline
        </p>
        <div className="space-y-0">
          {pipeline.map((step, i) => (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`mt-[3px] h-2 w-2 shrink-0 rounded-full border ${
                    step.done ? "border-white/38 bg-white/38" : "border-white/[0.1] bg-transparent"
                  }`}
                />
                {i < pipeline.length - 1 && (
                  <div className="my-1 w-px flex-1 bg-white/[0.06]" style={{ minHeight: 20 }} />
                )}
              </div>
              <div className="pb-3 last:pb-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[12px] ${step.done ? "text-white/65" : "text-white/28"}`}>
                    {step.label}
                  </span>
                  <span className={`text-[10px] ${step.done ? "text-white/35" : "text-white/18"}`}>
                    {step.note}
                  </span>
                </div>
                {step.detail && (
                  <p className="text-[10px] text-white/22">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick metrics */}
      <section>
        <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
          Intelligence metrics
        </p>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5"
            >
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/28">{m.label}</p>
              <p className="mt-0.5 font-light tabular-nums text-lg text-white/75">{m.value}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Tab: Chunks ────────────────────────────────────────────────────────────

function TabChunks({ chunks }: { chunks: WorkstationChunk[] }) {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return chunks
    const q = search.toLowerCase()
    return chunks.filter(
      (c) =>
        c.content.toLowerCase().includes(q) ||
        c.headingPath?.toLowerCase().includes(q)
    )
  }, [chunks, search])

  const embeddedCount = chunks.filter((c) => c.hasEmbedding).length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
            Chunk explorer
          </p>
          <span className="text-[10px] text-white/28">
            {embeddedCount}/{chunks.length} embedded
          </span>
        </div>
        <input
          type="text"
          placeholder="Search chunks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/72 placeholder:text-white/22 focus:border-white/[0.14] focus:outline-none"
        />
      </div>

      {/* Chunk list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-white/30">No chunks match your search.</p>
          </div>
        ) : (
          filtered.map((chunk) => {
            const isOpen = expanded.has(chunk.id)
            return (
              <div
                key={chunk.id}
                className="border-b border-white/[0.04] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(chunk.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  {/* Expand indicator */}
                  <span className="mt-0.5 shrink-0 text-[10px] text-white/25">
                    {isOpen ? "▼" : "▶"}
                  </span>

                  {/* Chunk summary */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[10px] text-white/40">
                        #{String(chunk.chunkIndex).padStart(3, "0")}
                      </span>
                      {chunk.headingPath && (
                        <span className="truncate text-[10px] italic text-white/35">
                          {chunk.headingPath}
                        </span>
                      )}
                      <span className="text-[10px] text-white/22">
                        {chunk.tokenCount} tokens
                      </span>
                      {chunk.pageRef && (
                        <span className="text-[10px] text-white/22">
                          p.{chunk.pageRef}
                        </span>
                      )}
                      {/* Embedding badge */}
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] ${
                          chunk.hasEmbedding
                            ? "border border-white/[0.12] text-white/48"
                            : "border border-white/[0.05] text-white/20"
                        }`}
                      >
                        {chunk.hasEmbedding ? "Embedded" : "No vector"}
                      </span>
                    </div>

                    {/* Content preview (collapsed) */}
                    {!isOpen && (
                      <p className="mt-1 truncate text-[11px] leading-relaxed text-white/42">
                        {chunk.content.slice(0, 120)}
                      </p>
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-white/[0.04] bg-white/[0.015] px-4 py-4">
                    <p className="mb-2 text-[9px] uppercase tracking-[0.14em] text-white/28">
                      Source excerpt
                    </p>
                    <p className="border-l border-white/[0.08] pl-3 text-[11px] leading-[1.75] text-white/62">
                      {chunk.content}
                    </p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Tab: Authorities ───────────────────────────────────────────────────────

function TabAuthorities({ authorities }: { authorities: WorkstationAuthority[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, WorkstationAuthority[]>()
    for (const a of authorities) {
      const list = map.get(a.type) ?? []
      list.push(a)
      map.set(a.type, list)
    }
    return map
  }, [authorities])

  if (authorities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-white/38">No authorities detected</p>
          <p className="mt-1 text-xs text-white/22">
            UK legal citations surface here after parsing. Ensure the document
            contains case references, statutory provisions, or CPR citations.
          </p>
        </div>
      </div>
    )
  }

  const confidenceForType: Record<string, string> = {
    case_neutral:   "High",
    case_report:    "High",
    cpr:            "High",
    practice_dir:   "Moderate",
    statute:        "Moderate",
    statutory_inst: "Moderate",
  }

  return (
    <div className="overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Detected authorities
        </p>
        <span className="text-[10px] text-white/28">{authorities.length} total</span>
      </div>

      <div className="space-y-5">
        {AUTHORITY_ORDER.filter((t) => grouped.has(t)).map((type) => {
          const items = grouped.get(type) ?? []
          return (
            <section key={type}>
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                  {authorityTypeLabel(type)}
                </p>
                <span className="rounded-full border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/25">
                  {items.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((a) => (
                  <div
                    key={a.normalized}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5"
                  >
                    <p className="text-[11px] text-white/70">{a.normalized}</p>
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-white/25">
                      {confidenceForType[type] ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Parsed text ───────────────────────────────────────────────────────

function TabParsed({ doc }: { doc: WorkstationDoc }) {
  if (!doc.parsedText) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-white/38">Parsed text not available</p>
          <p className="mt-1 text-xs text-white/22">
            Parsing has not completed or the document failed to parse.
            Check the indexing status in the Overview tab.
          </p>
        </div>
      </div>
    )
  }

  const lines = doc.parsedText.split("\n")

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-5 py-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
          Parsed representation
        </p>
        <p className="mt-0.5 text-[10px] text-white/22">
          {doc.parsedText.length.toLocaleString()} characters ·{" "}
          {lines.length.toLocaleString()} lines ·{" "}
          Parser: {mimeLabel(doc.mimeType) === "PDF" ? "pdf-parse" : mimeLabel(doc.mimeType) === "DOCX" ? "mammoth" : "buffer"} ·{" "}
          {doc.extractionConf != null ? `${Math.round(doc.extractionConf * 100)}% confidence` : ""}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-0.5">
          {lines.map((line, i) => {
            const isHeading =
              line.trim().length > 0 &&
              line.trim().length < 80 &&
              (/^[A-Z][A-Z\s,.:&()\-]+$/.test(line.trim()) ||
                /^\d+\.\s+[A-Z]/.test(line.trim()) ||
                /^[IVX]+\.\s+[A-Z]/.test(line.trim()))
            return (
              <div key={i} className="flex gap-3">
                <span className="shrink-0 select-none pt-0.5 font-mono text-[9px] text-white/15 tabular-nums">
                  {String(i + 1).padStart(4, " ")}
                </span>
                <p
                  className={`text-[11px] leading-[1.7] ${
                    isHeading
                      ? "font-medium text-white/78"
                      : line.trim() === ""
                      ? "text-white/0 select-none"
                      : "text-white/52"
                  }`}
                >
                  {line || " "}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tab: Retrieval trace ───────────────────────────────────────────────────

function TabRetrieval({
  sessions,
  chunks,
}: {
  sessions: WorkstationSession[]
  chunks: WorkstationChunk[]
}) {
  const docChunkSet = useMemo(() => new Set(chunks.map((c) => c.id)), [chunks])
  const chunkByIndex = useMemo(
    () => new Map(chunks.map((c) => [c.id, c])),
    [chunks]
  )

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-white/38">No retrieval sessions recorded</p>
          <p className="mt-1 text-xs text-white/22">
            This document has not yet been referenced in a research session.
            Run a research query in the Research workspace to generate retrieval traces.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          Retrieval traceability
        </p>
        <span className="text-[10px] text-white/28">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-4">
        {sessions.map((session) => {
          const usedFromDoc = session.chunkIds
            .filter((id) => docChunkSet.has(id))
            .map((id) => chunkByIndex.get(id))
            .filter((c): c is WorkstationChunk => !!c)
            .sort((a, b) => a.chunkIndex - b.chunkIndex)

          return (
            <div
              key={session.id}
              className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] text-white/25">
                    Session {session.id.slice(-10)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/30">{fmtDate(session.createdAt)}</p>
                </div>
                <Link
                  href="/app/research"
                  className="text-[10px] text-white/25 transition-colors hover:text-white/50"
                >
                  Research ↗
                </Link>
              </div>

              <div className="mb-3 rounded border-l border-white/[0.1] pl-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/28">Query</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/60">
                  {session.query}
                </p>
              </div>

              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/28">
                  Chunks used from this document ({usedFromDoc.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {usedFromDoc.map((c) => (
                    <span
                      key={c.id}
                      className="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-1 font-mono text-[9px] text-white/42"
                      title={c.headingPath ?? `Chunk #${c.chunkIndex}`}
                    >
                      #{String(c.chunkIndex).padStart(3, "0")}
                      {c.pageRef ? ` p.${c.pageRef}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Timeline ──────────────────────────────────────────────────────────

function TabTimeline({ doc, chunkCount }: { doc: WorkstationDoc; chunkCount: number }) {
  const events = [
    {
      label: "Document ingested",
      detail: `${doc.fileName} received into Aether`,
      time: doc.uploadedAt,
      done: true,
    },
    {
      label: "Parse initiated",
      detail: `${mimeLabel(doc.mimeType)} parser engaged`,
      time: doc.parseStatus !== "pending" ? doc.updatedAt : null,
      done: doc.parseStatus !== "pending",
    },
    {
      label: "Parsing completed",
      detail: doc.extractionConf != null
        ? `${Math.round(doc.extractionConf * 100)}% extraction confidence · ${doc.pageCount ?? "—"} pages`
        : "Parse result awaiting",
      time: doc.parseStatus === "parsed" ? doc.updatedAt : null,
      done: doc.parseStatus === "parsed",
    },
    {
      label: "Chunking completed",
      detail: chunkCount > 0 ? `${chunkCount} semantic chunks created` : "Pending",
      time: chunkCount > 0 ? doc.updatedAt : null,
      done: chunkCount > 0,
    },
    {
      label: "Embeddings generated",
      detail: "Vector representations stored in pgvector",
      time: doc.indexingStatus === "retrieval-ready" ? doc.updatedAt : null,
      done: doc.indexingStatus === "retrieval-ready",
    },
    {
      label: "Retrieval ready",
      detail: "Available for semantic research queries",
      time: doc.retrievalStatus === "ready" ? doc.updatedAt : null,
      done: doc.retrievalStatus === "ready",
    },
  ]

  return (
    <div className="overflow-y-auto p-5">
      <p className="mb-5 text-[10px] uppercase tracking-[0.18em] text-white/35">
        Operational timeline
      </p>
      <div>
        {events.map((ev, i) => (
          <div key={ev.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`mt-[3px] h-2 w-2 shrink-0 rounded-full border ${
                  ev.done ? "border-white/38 bg-white/38" : "border-white/[0.1] bg-transparent"
                }`}
              />
              {i < events.length - 1 && (
                <div className="my-1 w-px flex-1 bg-white/[0.06]" style={{ minHeight: 28 }} />
              )}
            </div>
            <div className="pb-5 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={`text-[12px] ${ev.done ? "text-white/68" : "text-white/28"}`}
                >
                  {ev.label}
                </span>
                {ev.time && (
                  <span className="text-[10px] text-white/28">{fmtDate(ev.time)}</span>
                )}
              </div>
              <p className={`text-[10px] leading-relaxed ${ev.done ? "text-white/35" : "text-white/18"}`}>
                {ev.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main workstation ───────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "chunks",      label: "Chunks" },
  { id: "authorities", label: "Authorities" },
  { id: "parsed",      label: "Parsed" },
  { id: "retrieval",   label: "Retrieval" },
  { id: "timeline",    label: "Timeline" },
]

export function DocumentWorkstation({ data }: { data: WorkstationData }) {
  const { doc, chunks, sessions, authorities, embeddedCount, signedUrl } = data

  // Split pane
  const [splitPos, setSplitPos] = useState(DEFAULT_SPLIT)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  // Mobile view toggle
  const [mobilePanel, setMobilePanel] = useState<"document" | "intelligence">("document")

  // Restore persisted preferences
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_SPLIT)
      if (s) setSplitPos(Math.max(20, Math.min(80, Number(s))))
      const t = localStorage.getItem(STORAGE_TAB) as Tab | null
      if (t && TABS.some((tab) => tab.id === t)) setActiveTab(t)
    } catch {
      /* ignore */
    }
  }, [])

  // Persist split position
  useEffect(() => {
    try { localStorage.setItem(STORAGE_SPLIT, String(splitPos)) } catch { /* ignore */ }
  }, [splitPos])

  // Persist active tab
  useEffect(() => {
    try { localStorage.setItem(STORAGE_TAB, activeTab) } catch { /* ignore */ }
  }, [activeTab])

  // Drag-to-resize
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPos(Math.max(20, Math.min(80, pct)))
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  // Dynamic tab label for Chunks
  const tabLabel = useCallback((tab: { id: Tab; label: string }) => {
    if (tab.id === "chunks") return `Chunks (${doc.chunkCount})`
    if (tab.id === "authorities") return `Auth. (${authorities.length})`
    return tab.label
  }, [doc.chunkCount, authorities.length])

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case "overview":
        return (
          <TabOverview
            doc={doc}
            embeddedCount={embeddedCount}
            sessionCount={sessions.length}
            authorityCount={authorities.length}
          />
        )
      case "chunks":
        return <TabChunks chunks={chunks} />
      case "authorities":
        return <TabAuthorities authorities={authorities} />
      case "parsed":
        return <TabParsed doc={doc} />
      case "retrieval":
        return <TabRetrieval sessions={sessions} chunks={chunks} />
      case "timeline":
        return <TabTimeline doc={doc} chunkCount={chunks.length} />
    }
  }, [activeTab, doc, chunks, sessions, authorities, embeddedCount])

  return (
    <div
      className="-mx-4 -my-6 flex flex-col overflow-hidden sm:-mx-6 sm:-my-8"
      style={{ height: "calc(100vh - 3.25rem)" }}
    >
      {/* Mobile panel toggle */}
      <div className="flex shrink-0 border-b border-white/[0.06] bg-black/40 lg:hidden">
        {(["document", "intelligence"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setMobilePanel(p)}
            className={`flex-1 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors ${
              mobilePanel === p
                ? "text-white/75"
                : "text-white/30 hover:text-white/55"
            }`}
          >
            {p === "document" ? "Source" : "Intelligence"}
          </button>
        ))}
      </div>

      {/* Main split layout */}
      <div ref={containerRef} className="flex min-h-0 flex-1">

        {/* ── Left: Source document ─────────────────────────────────── */}
        <div
          className={`flex flex-col overflow-hidden border-r border-white/[0.06] ${
            mobilePanel === "document" ? "flex" : "hidden"
          } lg:flex`}
          style={{ width: `${splitPos}%` }}
        >
          <DocViewer doc={doc} signedUrl={signedUrl} />
        </div>

        {/* ── Drag handle ───────────────────────────────────────────── */}
        <div
          onMouseDown={startDrag}
          className="hidden w-1 shrink-0 cursor-col-resize bg-white/[0.03] transition-colors hover:bg-white/[0.09] lg:block"
          title="Drag to resize"
        />

        {/* ── Right: Intelligence panel ─────────────────────────────── */}
        <div
          className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 ${
            mobilePanel === "intelligence" ? "flex" : "hidden"
          } lg:flex`}
        >
          {/* Back link + Tab bar */}
          <div className="shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-0">
              <Link
                href={`/app/matters/${doc.matterId}`}
                className="text-[10px] text-white/25 transition-colors hover:text-white/52"
              >
                ← {doc.matterTitle}
              </Link>
            </div>
            <div className="flex gap-0 overflow-x-auto px-3 pt-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 border-b-2 px-3 pb-2.5 pt-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    activeTab === tab.id
                      ? "border-white/40 text-white/75"
                      : "border-transparent text-white/28 hover:text-white/52"
                  }`}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {tabContent}
          </div>
        </div>

      </div>
    </div>
  )
}
