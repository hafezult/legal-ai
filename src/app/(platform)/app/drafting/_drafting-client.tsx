"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"

import { downloadMarkdown } from "@/lib/download"
import {
  DRAFT_TYPES,
  MAX_DRAFT_INSTRUCTION_CHARS,
  type DraftType,
} from "@/lib/drafting/types"
import {
  deleteDraft,
  generateDraft,
  restoreDraft,
  type DraftOutput,
} from "./actions"

const DRAFT_TYPE_OPTIONS: { value: DraftType; label: string }[] = [
  { value: "advice", label: "Advice note" },
  { value: "brief", label: "Skeleton / brief" },
  { value: "memo", label: "Research memo" },
  { value: "clause", label: "Clause analysis" },
]

const EXAMPLE_INSTRUCTIONS = [
  "Prepare counsel's advice on disclosure risks arising from the uploaded witness evidence.",
  "Outline a skeleton argument on breach of fiduciary duty based on the matter sources.",
  "Draft an internal memo summarising termination and notice-period clauses.",
  "Analyse the limitation and exclusion clauses and note drafting risks.",
]

type Matter = {
  id: string
  title: string
  canWrite?: boolean
  canDelete?: boolean
  _count: { documents: number }
}

type RecentDraft = {
  id: string
  title: string
  draftType: string
  instruction: string
  content: string | null
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

function draftTypeLabel(draftType: string) {
  return DRAFT_TYPE_OPTIONS.find((option) => option.value === draftType)?.label ?? draftType
}

function draftMarkdown(output: DraftOutput) {
  const lines = [
    `# ${output.title}`,
    "",
    `Matter: ${output.matterTitle}`,
    `Type: ${draftTypeLabel(output.draftType)}`,
    "",
    `## Instruction`,
    "",
    output.instruction,
    "",
    `## Grounded draft`,
    "",
    output.content || "_No draft content saved._",
    "",
    `## Provenance`,
    "",
    `- Draft: \`${output.draftId}\``,
    `- Retrieved chunks: ${output.retrievalCount}`,
  ]
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

export function DraftingClient({
  matters,
  recentDrafts,
  canWrite = true,
  initialMatterId,
  initialResults = null,
}: {
  matters: Matter[]
  recentDrafts: RecentDraft[]
  canWrite?: boolean
  initialMatterId?: string
  initialResults?: DraftOutput | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const [isRestoring, startRestoreTransition] = useTransition()
  // Failed restores return matterId: null — treat empty as missing so ?? can fall through.
  const restoredMatterId = initialResults?.matterId?.trim() || undefined
  const initialMatter =
    (restoredMatterId &&
    matters.some((matter) => matter.id === restoredMatterId)
      ? restoredMatterId
      : undefined) ??
    (initialMatterId && matters.some((matter) => matter.id === initialMatterId)
      ? initialMatterId
      : undefined) ??
    matters[0]?.id ??
    ""
  const initialTyped =
    initialResults &&
    (DRAFT_TYPES as readonly string[]).includes(initialResults.draftType)
      ? (initialResults.draftType as DraftType)
      : "advice"
  const [selectedMatter, setSelectedMatter] = useState(initialMatter)
  const [draftType, setDraftType] = useState<DraftType>(initialTyped)
  const [instruction, setInstruction] = useState(initialResults?.instruction ?? "")
  const [results, setResults] = useState<DraftOutput | null>(
    initialResults && !initialResults.error ? initialResults : null
  )
  const [localError, setLocalError] = useState<string | null>(
    initialResults?.error ?? null
  )
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  const selectedMatterCanWrite =
    matters.find((matter) => matter.id === selectedMatter)?.canWrite ?? canWrite

  const matterDrafts = recentDrafts.filter(
    (draft) => !selectedMatter || draft.matterId === selectedMatter
  )

  const exportDraft = useCallback((output: DraftOutput) => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadMarkdown(
      `draft-${output.draftType}-${output.matterTitle.slice(0, 32)}-${stamp}.md`,
      draftMarkdown(output)
    )
  }, [])

  const restoreSavedDraft = useCallback((draft: RecentDraft) => {
    const typed = (DRAFT_TYPES as readonly string[]).includes(draft.draftType)
      ? (draft.draftType as DraftType)
      : "advice"
    setSelectedMatter(draft.matterId)
    setInstruction(draft.instruction)
    setDraftType(typed)
    setLocalError(null)
    setResults({
      draftId: draft.id,
      matterId: draft.matterId,
      matterTitle: draft.matterTitle,
      title: draft.title,
      draftType: typed,
      instruction: draft.instruction,
      content: draft.content ?? "",
      chunks: [],
      retrievalCount: draft.chunkIds.length,
      indexedChunks: draft.chunkIds.length,
      embeddingConfigured: true,
    })

    startRestoreTransition(async () => {
      const output = await restoreDraft(draft.id)
      if (output.error) {
        setLocalError(output.error)
        return
      }
      setResults(output)
    })
  }, [])

  const exportSavedDraft = useCallback(
    (draft: RecentDraft) => {
      setLocalError(null)
      startRestoreTransition(async () => {
        const output = await restoreDraft(draft.id)
        if (output.error) {
          setLocalError(output.error)
          return
        }
        exportDraft(output)
      })
    },
    [exportDraft]
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (!selectedMatterCanWrite || !instruction.trim() || !selectedMatter || isPending)
        return
      setLocalError(null)
      setResults(null)

      startTransition(async () => {
        const output = await generateDraft(selectedMatter, draftType, instruction)
        const hasPartial =
          Boolean(output.content) || output.chunks.length > 0
        setResults(output.error && !hasPartial ? null : output)
        setLocalError(output.error ?? null)
        router.refresh()
      })
    },
    [selectedMatterCanWrite, instruction, selectedMatter, draftType, isPending, router]
  )

  const handleDeleteDraft = useCallback(
    (draftId: string, draftMatterId: string) => {
      const draftCanWrite =
        matters.find((matter) => matter.id === draftMatterId)?.canWrite ?? canWrite
      if (!draftCanWrite || isDeleting) return
      const confirmed = window.confirm(
        "Delete this draft? The generated work product will be permanently removed."
      )
      if (!confirmed) return
      setLocalError(null)
      setDeletingDraftId(draftId)

      startDeleteTransition(async () => {
        const result = await deleteDraft(draftId)
        if (result.error) {
          setLocalError(result.error)
          setDeletingDraftId(null)
          return
        }

        if (results?.draftId === draftId) {
          setResults(null)
        }

        setDeletingDraftId(null)
        router.refresh()
      })
    },
    [matters, canWrite, isDeleting, results?.draftId, router]
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Draft preparation
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Drafting
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Generate grounded advice notes, skeletons, memos, and clause analyses from
            retrieval-ready matter sources — then review before client use.
          </p>
        </div>

        {matters.length > 0 && (
          <div className="min-w-[220px]">
            <label
              htmlFor="drafting-active-matter"
              className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-white/35"
            >
              Active matter
            </label>
            <select
              id="drafting-active-matter"
              value={selectedMatter}
              onChange={(event) => setSelectedMatter(event.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-zinc-950 px-4 py-2.5 text-sm text-white/80 focus:border-white/[0.16] focus:outline-none"
            >
              {matters.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.title} ({matter._count.documents} doc
                  {matter._count.documents !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matter context available</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            Create a matter and upload sources before preparing grounded drafts.
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
              href="/app/research"
              className="rounded-lg border border-white/[0.07] bg-white/[0.01] px-5 py-2.5 text-sm text-white/45 transition-colors duration-200 hover:border-white/[0.14] hover:text-white/72"
            >
              Open research
            </Link>
          </div>
        </div>
      ) : (
        <>
          {selectedMatterCanWrite ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div>
                  <label
                    htmlFor="draft-type"
                    className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-white/35"
                  >
                    Draft type
                  </label>
                  <select
                    id="draft-type"
                    value={draftType}
                    onChange={(event) => setDraftType(event.target.value as DraftType)}
                    className="w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-zinc-950 px-4 py-2.5 text-sm text-white/80 focus:border-white/[0.16] focus:outline-none"
                  >
                    {DRAFT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="draft-instruction"
                    className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-white/35"
                  >
                    Drafting instruction
                  </label>
                  <textarea
                    id="draft-instruction"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    rows={4}
                    maxLength={MAX_DRAFT_INSTRUCTION_CHARS}
                    placeholder={EXAMPLE_INSTRUCTIONS[0]}
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-white/85 placeholder:text-white/22 focus:border-white/[0.16] focus:bg-white/[0.03] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {EXAMPLE_INSTRUCTIONS.slice(1).map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInstruction(example)}
                    className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-white/32 transition-colors hover:border-white/[0.12] hover:text-white/55"
                  >
                    {example.slice(0, 48)}…
                  </button>
                ))}
              </div>

              {localError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border border-red-400/[0.15] bg-red-400/[0.04] px-4 py-3"
                >
                  <p className="text-sm text-red-400/68">{localError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!instruction.trim() || !selectedMatter || isPending}
                className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-6 py-2.5 text-sm text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white/92 disabled:pointer-events-none disabled:opacity-38"
              >
                {isPending ? "Preparing draft…" : "Generate draft →"}
              </button>
            </form>
          ) : (
            <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                Read-only access
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/40">
                Your organization role can review and export saved drafts, but cannot
                generate new work product or delete drafts.
              </p>
              {localError && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-3 text-sm text-red-400/68"
                >
                  {localError}
                </p>
              )}
            </div>
          )}

          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                Recent drafts
              </p>
              <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/30">
                {matterDrafts.length} shown
              </span>
            </div>
            {localError ? (
              <p
                role="alert"
                aria-live="polite"
                className="mt-3 text-sm text-red-400/68"
              >
                {localError}
              </p>
            ) : null}
            {matterDrafts.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-white/32">
                No saved drafts for this matter yet. Generate a grounded draft to persist
                an evidence-backed work product.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {matterDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-black/30"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => restoreSavedDraft(draft)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                            {draft.matterTitle} · {draftTypeLabel(draft.draftType)}
                          </p>
                          <p className="text-[10px] text-white/22">
                            {fmtShortDate(draft.createdAt)} · {draft.chunkIds.length}{" "}
                            source{draft.chunkIds.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-white/62">
                          {excerpt(draft.instruction)}
                        </p>
                        <p className="mt-1.5 text-xs text-white/28">
                          {draft.content
                            ? excerpt(draft.content, 120)
                            : "No draft content saved."}
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => exportSavedDraft(draft)}
                          disabled={isRestoring}
                          className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.16] hover:text-white/68 disabled:pointer-events-none disabled:opacity-40"
                        >
                          {isRestoring ? "…" : "Export"}
                        </button>
                        {draft.canDelete ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteDraft(draft.id, draft.matterId)}
                            disabled={isDeleting && deletingDraftId === draft.id}
                            className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-red-400/30 hover:text-red-300/70 disabled:pointer-events-none disabled:opacity-40"
                          >
                            {isDeleting && deletingDraftId === draft.id
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

          {isPending && (
            <div className="animate-pulse space-y-4 pt-4">
              <div className="h-2.5 w-48 rounded bg-white/[0.05]" />
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-5"
                >
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
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                  {results.chunks.length > 0 ? "Source excerpts" : "Saved draft"}
                </p>
                <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/35">
                  {results.retrievalCount} source
                  {results.retrievalCount !== 1 ? "s" : ""} · {results.matterTitle}
                </span>
                <span className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-white/35">
                  {draftTypeLabel(results.draftType)}
                </span>
                {!results.embeddingConfigured && (
                  <span className="rounded-full border border-amber-400/[0.2] bg-amber-400/[0.04] px-2.5 py-0.5 text-[10px] text-amber-400/60">
                    Embeddings not configured
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => exportDraft(results)}
                  disabled={!results.content}
                  className="ml-auto rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/40 transition-colors hover:border-white/[0.16] hover:text-white/72 disabled:pointer-events-none disabled:opacity-40"
                >
                  Export Markdown
                </button>
              </div>

              {results.chunks.length > 0 ? (
                <div className="space-y-3">
                  {results.chunks.map((chunk, index) => (
                    <div
                      key={chunk.id}
                      className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                          Excerpt {index + 1}
                        </span>
                        <span className="text-xs text-white/50">{chunk.fileName}</span>
                        {chunk.pageRef && (
                          <span className="text-xs text-white/35">Page {chunk.pageRef}</span>
                        )}
                        {chunk.headingPath && (
                          <span className="text-xs italic text-white/28">
                            {chunk.headingPath}
                          </span>
                        )}
                        <span
                          className={`ml-auto text-xs ${relevanceClass(chunk.distance)}`}
                        >
                          {relevanceLabel(chunk.distance)} relevance
                        </span>
                      </div>
                      <p className="border-l border-white/[0.08] pl-4 text-sm leading-relaxed text-white/68">
                        {chunk.content.length > 600
                          ? `${chunk.content.slice(0, 600)}…`
                          : chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : results.content ? (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-6">
                  <p className="text-sm text-white/40">
                    {isRestoring
                      ? "Loading source excerpts for this restored draft…"
                      : "No source excerpts are available for this draft. The grounded draft below is preserved from the original generation."}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-5 py-6">
                  <p className="text-sm text-white/40">
                    No relevant excerpts retrieved. Rephrase the instruction or confirm
                    documents are fully indexed.
                  </p>
                </div>
              )}

              <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/30 p-6">
                <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Grounded draft
                </p>
                {results.content ? (
                  <div className="space-y-3 text-sm leading-relaxed text-white/72">
                    {results.content.split("\n\n").map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-white/35">No draft generated.</p>
                )}
                {results.draftId && (
                  <p className="mt-5 border-t border-white/[0.05] pt-3 text-[10px] text-white/22">
                    Draft {results.draftId.slice(-8)} · {results.retrievalCount} chunk
                    {results.retrievalCount !== 1 ? "s" : ""} retrieved
                  </p>
                )}
              </div>

              <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Drafting control
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/40">
                  Review this draft against the matter record and source excerpts before
                  client use. Generated text is evidence-bound, not a substitute for
                  counsel judgment.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
