"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"

import { downloadMarkdown } from "@/lib/download"
import { MAX_RESEARCH_QUERY_CHARS } from "@/lib/research/limits"
import {
  deleteResearchSession,
  restoreResearchSession,
  runResearch,
  type ResearchOutput,
} from "./actions"

// ── Helpers ───────────────────────────────────────────────────────────────

function relevanceLabel(distance: number): string {
  if (distance < 0.25) return "High"
  if (distance < 0.45) return "Moderate"
  return "Low"
}

function relevanceClass(distance: number): string {
  if (distance < 0.25) return "text-white/68"
  if (distance < 0.45) return "text-white/48"
  return "text-white/30"
}

const EXAMPLE_QUERIES = [
  "Summarise the disclosure obligations arising from the uploaded witness statements.",
  "Identify references to breach of fiduciary duty in the matter documents.",
  "Extract all clauses relating to termination and notice periods.",
  "What authorities are cited regarding causation or remoteness of damage?",
  "Identify any CPR provisions referenced and their procedural implications.",
]

// ── Sub-components ────────────────────────────────────────────────────────

function AuthorityRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-white/60"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

type Matter = {
  id: string
  title: string
  canWrite?: boolean
  canDelete?: boolean
  _count: { documents: number }
}

type RecentSession = {
  id: string
  query: string
  response: string | null
  chunkIds: string[]
  createdAt: Date | string
  matterId: string
  matterTitle: string
  canDelete?: boolean
}

function fmtShortDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function excerpt(text: string, length = 140) {
  const compact = text.replace(/\s+/g, " ").trim()
  return compact.length > length ? `${compact.slice(0, length)}…` : compact
}

function emptyAuthorities(): ResearchOutput["authorities"] {
  return {
    cases: [],
    statutes: [],
    cpr: [],
    practiceDirs: [],
    statutory: [],
  }
}

function researchMarkdown(output: ResearchOutput) {
  const lines = [
    `# Research — ${output.matterTitle}`,
    "",
    `## Query`,
    "",
    output.query,
    "",
    `## Grounded analysis`,
    "",
    output.answer || "_No analysis saved._",
    "",
    `## Provenance`,
    "",
    `- Session: \`${output.sessionId}\``,
    `- Retrieved chunks: ${output.retrievalCount}`,
  ]
  const authorityEntries: [string, string[]][] = [
    ["Cases", output.authorities.cases],
    ["Statutes", output.authorities.statutes],
    ["CPR", output.authorities.cpr],
    ["Practice directions", output.authorities.practiceDirs],
    ["Statutory instruments", output.authorities.statutory],
  ]
  const presentAuthorities = authorityEntries.filter(([, items]) => items.length > 0)
  if (presentAuthorities.length > 0) {
    lines.push("", "## Authorities", "")
    for (const [label, items] of presentAuthorities) {
      lines.push(`### ${label}`, "")
      for (const item of items) {
        lines.push(`- ${item}`)
      }
      lines.push("")
    }
  }
  if (output.chunks.length > 0) {
    lines.push("", "## Source excerpts", "")
    output.chunks.forEach((chunk, index) => {
      const loc = [
        chunk.headingPath ? `Section: ${chunk.headingPath}` : null,
        chunk.pageRef ? `Page ${chunk.pageRef}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(
        `### Excerpt ${index + 1} — ${chunk.fileName}${loc ? ` (${loc})` : ""}`,
        "",
        chunk.content,
        ""
      )
    })
  }
  return lines.join("\n")
}

export function ResearchClient({
  matters,
  recentSessions,
  canWrite = true,
  initialMatterId,
  initialResults = null,
}: {
  matters: Matter[]
  recentSessions: RecentSession[]
  canWrite?: boolean
  initialMatterId?: string
  initialResults?: ResearchOutput | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isRestoring, startRestoreTransition] = useTransition()
  const initialMatter =
    initialResults?.matterId ??
    (initialMatterId && matters.some((matter) => matter.id === initialMatterId)
      ? initialMatterId
      : undefined) ??
    matters[0]?.id ??
    ""
  const [selectedMatter, setSelectedMatter] = useState(initialMatter)
  const [query, setQuery] = useState(initialResults?.query ?? "")
  const [results, setResults] = useState<ResearchOutput | null>(
    initialResults && !initialResults.error ? initialResults : null
  )
  const [localError, setLocalError] = useState<string | null>(
    initialResults?.error ?? null
  )
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const selectedMatterCanWrite =
    matters.find((matter) => matter.id === selectedMatter)?.canWrite ?? canWrite

  const matterSessions = recentSessions.filter(
    (session) => !selectedMatter || session.matterId === selectedMatter
  )

  const exportResults = useCallback((output: ResearchOutput) => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadMarkdown(
      `research-${output.matterTitle.slice(0, 40)}-${stamp}.md`,
      researchMarkdown(output)
    )
  }, [])

  const restoreSession = useCallback(
    (session: RecentSession) => {
      setSelectedMatter(session.matterId)
      setQuery(session.query)
      setLocalError(null)
      setResults({
        query: session.query,
        matterId: session.matterId,
        matterTitle: session.matterTitle,
        answer: session.response ?? "",
        chunks: [],
        authorities: emptyAuthorities(),
        sessionId: session.id,
        retrievalCount: session.chunkIds.length,
        indexedChunks: session.chunkIds.length,
        embeddingConfigured: true,
      })

      startRestoreTransition(async () => {
        const output = await restoreResearchSession(session.id)
        if (output.error) {
          setLocalError(output.error)
          return
        }
        setResults(output)
      })
    },
    []
  )

  const exportSession = useCallback(
    (session: RecentSession) => {
      setLocalError(null)
      startRestoreTransition(async () => {
        const output = await restoreResearchSession(session.id)
        if (output.error) {
          setLocalError(output.error)
          return
        }
        exportResults(output)
      })
    },
    [exportResults]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedMatterCanWrite || !query.trim() || !selectedMatter || isPending) return
      setLocalError(null)
      setResults(null)

      startTransition(async () => {
        const output = await runResearch(selectedMatter, query)
        const hasPartial =
          Boolean(output.answer) || output.chunks.length > 0
        setResults(output.error && !hasPartial ? null : output)
        setLocalError(output.error ?? null)
        router.refresh()
      })
    },
    [selectedMatterCanWrite, query, selectedMatter, isPending, router]
  )

  const handleDeleteSession = useCallback(
    (sessionId: string, sessionMatterId: string) => {
      const sessionCanWrite =
        matters.find((matter) => matter.id === sessionMatterId)?.canWrite ?? canWrite
      if (!sessionCanWrite || isDeleting) return
      const confirmed = window.confirm(
        "Delete this research session? The saved query and grounded response will be removed."
      )
      if (!confirmed) return
      setLocalError(null)
      setDeletingSessionId(sessionId)

      startDeleteTransition(async () => {
        const result = await deleteResearchSession(sessionId)
        if (result.error) {
          setLocalError(result.error)
          setDeletingSessionId(null)
          return
        }

        if (results?.sessionId === sessionId) {
          setResults(null)
        }

        setDeletingSessionId(null)
        router.refresh()
      })
    },
    [matters, canWrite, isDeleting, results?.sessionId, router]
  )

  const hasAuthorities = results
    ? Object.values(results.authorities).some((a) => a.length > 0)
    : false

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Legal intelligence
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Research
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/45">
            Semantic retrieval scoped to matter sources. Every response is grounded
            in uploaded documents — no unattributed citations.
          </p>
        </div>

        {/* Matter selector */}
        {matters.length > 0 && (
          <div className="min-w-[220px]">
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-white/35">
              Active matter
            </p>
            <select
              value={selectedMatter}
              onChange={(e) => setSelectedMatter(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-zinc-950 px-4 py-2.5 text-sm text-white/80 focus:border-white/[0.16] focus:outline-none"
            >
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m._count.documents} doc{m._count.documents !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matters available</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            Create a matter and upload documents before running research queries.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {canWrite ? (
              <Link
                href="/app/matters/new"
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-5 py-2.5 text-sm text-white/62 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
              >
                Initialize matter
              </Link>
            ) : null}
            <Link
              href="/app/matters"
              className="rounded-lg border border-white/[0.07] bg-white/[0.01] px-5 py-2.5 text-sm text-white/45 transition-colors duration-200 hover:border-white/[0.14] hover:text-white/72"
            >
              Open matters
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Query form ────────────────────────────────────────────── */}
          {selectedMatterCanWrite ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="research-query"
                  className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-white/35"
                >
                  Research query
                </label>
                <textarea
                  id="research-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={4}
                  maxLength={MAX_RESEARCH_QUERY_CHARS}
                  placeholder={EXAMPLE_QUERIES[0]}
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-white/85 placeholder:text-white/22 focus:border-white/[0.16] focus:bg-white/[0.03] focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLE_QUERIES.slice(1).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuery(q)}
                      className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-white/32 transition-colors hover:border-white/[0.12] hover:text-white/55"
                    >
                      {q.slice(0, 48)}…
                    </button>
                  ))}
                </div>
              </div>

              {localError && (
                <div className="rounded-lg border border-red-400/[0.15] bg-red-400/[0.04] px-4 py-3">
                  <p className="text-sm text-red-400/68">{localError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!query.trim() || !selectedMatter || isPending}
                className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-6 py-2.5 text-sm text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white/92 disabled:pointer-events-none disabled:opacity-38"
              >
                {isPending ? "Retrieving…" : "Run research →"}
              </button>
            </form>
          ) : (
            <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                Read-only access
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/40">
                Your organization role can review and export saved research, but cannot
                run new queries or delete sessions.
              </p>
              {localError && (
                <p className="mt-3 text-sm text-red-400/68">{localError}</p>
              )}
            </div>
          )}

          {/* ── Recent sessions ───────────────────────────────────────── */}
          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Recent research sessions
              </p>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/30">
                {matterSessions.length} shown
              </span>
            </div>
            {matterSessions.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-white/32">
                No saved sessions for this matter yet. Run a query to persist a
                grounded research trace.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {matterSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-black/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => restoreSession(session)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                            {session.matterTitle}
                          </p>
                          <p className="text-[10px] text-white/22">
                            {fmtShortDate(session.createdAt)} · {session.chunkIds.length}{" "}
                            chunk{session.chunkIds.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-white/62">{excerpt(session.query)}</p>
                        <p className="mt-1.5 text-xs text-white/28">
                          {session.response
                            ? excerpt(session.response, 120)
                            : "No grounded response saved for this session."}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => exportSession(session)}
                          disabled={isRestoring}
                          className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.16] hover:text-white/68 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {isRestoring ? "…" : "Export"}
                        </button>
                        {session.canDelete ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteSession(session.id, session.matterId)
                            }
                            disabled={isDeleting && deletingSessionId === session.id}
                            className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-red-400/30 hover:text-red-300/70 disabled:pointer-events-none disabled:opacity-40"
                          >
                            {isDeleting && deletingSessionId === session.id
                              ? "Deleting…"
                              : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Results ───────────────────────────────────────────────── */}
          {isPending && (
            <div className="animate-pulse space-y-4 pt-4">
              <div className="h-2.5 w-48 rounded bg-white/[0.05]" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-5">
                  <div className="h-2.5 w-32 rounded bg-white/[0.06]" />
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full rounded bg-white/[0.04]" />
                    <div className="h-3 w-5/6 rounded bg-white/[0.03]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {results && !isPending && (
            <div className="space-y-6 border-t border-white/[0.06] pt-8">

              {/* Retrieval summary */}
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                  {results.chunks.length > 0 ? "Retrieved excerpts" : "Saved research"}
                </p>
                <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/35">
                  {results.retrievalCount} source{results.retrievalCount !== 1 ? "s" : ""} · {results.matterTitle}
                </span>
                {!results.embeddingConfigured && (
                  <span className="rounded-full border border-amber-400/[0.2] bg-amber-400/[0.04] px-2.5 py-0.5 text-[10px] text-amber-400/60">
                    Embeddings not configured
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => exportResults(results)}
                  disabled={!results.answer}
                  className="ml-auto rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/40 transition-colors hover:border-white/[0.16] hover:text-white/72 disabled:pointer-events-none disabled:opacity-40"
                >
                  Export Markdown
                </button>
              </div>

              {/* Excerpts */}
              {results.chunks.length > 0 ? (
                <div className="space-y-3">
                  {results.chunks.map((chunk, i) => (
                    <div
                      key={chunk.id}
                      className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                          Excerpt {i + 1}
                        </span>
                        <span className="text-xs text-white/50">{chunk.fileName}</span>
                        {chunk.pageRef && (
                          <span className="text-xs text-white/35">Page {chunk.pageRef}</span>
                        )}
                        {chunk.headingPath && (
                          <span className="text-xs text-white/28 italic">{chunk.headingPath}</span>
                        )}
                        <span className={`ml-auto text-xs ${relevanceClass(chunk.distance)}`}>
                          {relevanceLabel(chunk.distance)} relevance
                        </span>
                      </div>
                      <p className="border-l border-white/[0.08] pl-4 text-sm leading-relaxed text-white/68">
                        {chunk.content.length > 600
                          ? chunk.content.slice(0, 600) + "…"
                          : chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : results.answer ? (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-6">
                  <p className="text-sm text-white/40">
                    {isRestoring
                      ? "Loading source excerpts for this restored session…"
                      : "No source excerpts are available for this session. The grounded analysis below is preserved from the original run."}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-6">
                  <p className="text-sm text-white/40">
                    No relevant excerpts retrieved. The query may not match the indexed
                    sources — try rephrasing, or verify that documents are fully indexed.
                  </p>
                </div>
              )}

              {/* Authority analysis */}
              {hasAuthorities && (
                <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-5">
                  <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-white/40">
                    Authority analysis
                  </p>
                  <div className="space-y-4">
                    <AuthorityRow label="Cases" items={results.authorities.cases} />
                    <AuthorityRow label="Legislation" items={results.authorities.statutes} />
                    <AuthorityRow label="CPR" items={results.authorities.cpr} />
                    <AuthorityRow label="Practice directions" items={results.authorities.practiceDirs} />
                    <AuthorityRow label="Statutory instruments" items={results.authorities.statutory} />
                  </div>
                  {!hasAuthorities && (
                    <p className="text-xs text-white/28">
                      No UK legal authorities detected in the retrieved excerpts.
                    </p>
                  )}
                </div>
              )}

              {/* Grounded analysis */}
              <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/30 p-6">
                <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Grounded analysis
                </p>
                {results.answer ? (
                  <div className="space-y-3 text-sm leading-relaxed text-white/72">
                    {results.answer.split("\n\n").map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/35">No analysis generated.</p>
                )}
                {results.sessionId && (
                  <p className="mt-5 border-t border-white/[0.05] pt-3 text-[10px] text-white/22">
                    Session {results.sessionId.slice(-8)} · {results.retrievalCount} chunk
                    {results.retrievalCount !== 1 ? "s" : ""} retrieved
                  </p>
                )}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  )
}
