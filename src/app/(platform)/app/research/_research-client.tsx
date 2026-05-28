"use client"

import { useCallback, useState, useTransition } from "react"

import { runResearch, type ResearchOutput } from "./actions"

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

type Matter = { id: string; title: string; _count: { documents: number } }

export function ResearchClient({ matters }: { matters: Matter[] }) {
  const [isPending, startTransition] = useTransition()
  const [selectedMatter, setSelectedMatter] = useState(matters[0]?.id ?? "")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ResearchOutput | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!query.trim() || !selectedMatter || isPending) return
      setLocalError(null)
      setResults(null)

      startTransition(async () => {
        const output = await runResearch(selectedMatter, query)
        if (output.error) setLocalError(output.error)
        else setResults(output)
      })
    },
    [query, selectedMatter, isPending]
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
        </div>
      ) : (
        <>
          {/* ── Query form ────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
                Research query
              </p>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={4}
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
              <div className="flex items-center gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                  Retrieved excerpts
                </p>
                <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/35">
                  {results.retrievalCount} source{results.retrievalCount !== 1 ? "s" : ""} · {results.matterTitle}
                </span>
                {!results.embeddingConfigured && (
                  <span className="rounded-full border border-amber-400/[0.2] bg-amber-400/[0.04] px-2.5 py-0.5 text-[10px] text-amber-400/60">
                    Embeddings not configured
                  </span>
                )}
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
