"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { deleteResearchSession } from "@/app/(platform)/app/research/actions"
import { downloadMarkdown } from "@/lib/download"

export type MatterResearchSession = {
  id: string
  query: string
  response: string | null
  chunkIds: string[]
  createdAt: Date | string
  canDelete?: boolean
}

function fmtShortDate(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function sessionMarkdown(session: MatterResearchSession, matterTitle: string) {
  const lines = [
    `# Research — ${matterTitle}`,
    "",
    `Query: ${session.query}`,
    "",
    "## Answer",
    "",
    session.response?.trim() || "_No saved response._",
    "",
    `Provenance chunks: ${session.chunkIds.length}`,
  ]
  return lines.join("\n")
}

export function MatterResearchPanel({
  matterId,
  matterTitle,
  sessions,
  totalCount,
  canWrite = true,
}: {
  matterId: string
  matterTitle: string
  sessions: MatterResearchSession[]
  totalCount: number
  canWrite?: boolean
}) {
  const router = useRouter()
  const [isDeleting, startDelete] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(
    (session: MatterResearchSession) => {
      const stamp = new Date().toISOString().slice(0, 10)
      downloadMarkdown(
        `research-${matterTitle.slice(0, 40)}-${stamp}.md`,
        sessionMarkdown(session, matterTitle)
      )
    },
    [matterTitle]
  )

  const handleDelete = useCallback(
    (sessionId: string, allowed: boolean) => {
      if (!allowed || isDeleting) return
      const confirmed = window.confirm(
        "Delete this research session? The saved query and grounded response will be removed."
      )
      if (!confirmed) return
      setError(null)
      setDeletingId(sessionId)
      startDelete(async () => {
        const result = await deleteResearchSession(sessionId)
        setDeletingId(null)
        if (result.error) {
          setError(result.error)
          return
        }
        router.refresh()
      })
    },
    [isDeleting, router]
  )

  const hasSessions = totalCount > 0

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          AI research operations
        </p>
        <span className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[10px] text-white/22">
          {hasSessions ? "Active" : "Layer standing by"}
        </span>
      </div>
      <p className="mt-4 font-serif text-[14px] text-white/42">
        {hasSessions
          ? `${totalCount} research session${totalCount !== 1 ? "s" : ""} logged`
          : "No active research sessions"}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/25">
        {hasSessions
          ? "Recent grounded outputs are preserved with retrieval traces for this matter."
          : "Citation-grade outputs initialize here after research queries are submitted within this matter context."}
      </p>

      {error ? (
        <p className="mt-3 text-xs text-red-300/65">{error}</p>
      ) : null}

      <div className="mt-5 space-y-2">
        {hasSessions
          ? sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/28">
                    {fmtShortDate(session.createdAt)}
                  </p>
                  <p className="text-[10px] text-white/22">
                    {session.chunkIds.length} chunk
                    {session.chunkIds.length !== 1 ? "s" : ""}
                    {session.response ? " · response saved" : ""}
                  </p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/42">
                  {session.query}
                </p>
                {session.response ? (
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-white/26">
                    {session.response}
                  </p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <a
                    href={`/app/research?matter=${matterId}&session=${session.id}`}
                    className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.16] hover:text-white/60"
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() => handleExport(session)}
                    className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-white/[0.16] hover:text-white/60"
                  >
                    Export
                  </button>
                  {session.canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(session.id, Boolean(session.canDelete))}
                      disabled={isDeleting && deletingId === session.id}
                      className="rounded border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:border-red-400/30 hover:text-red-300/70 disabled:pointer-events-none disabled:opacity-40"
                    >
                      {isDeleting && deletingId === session.id
                        ? "Deleting…"
                        : "Delete"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          : [
              {
                label: "Authority chains",
                note: "No chains indexed. Populate after source ingestion.",
              },
              {
                label: "Retrieval trace",
                note: "No active sessions. Outputs surface after queries.",
              },
              {
                label: "Grounded excerpts",
                note: "Available after document index is established.",
              },
              {
                label: "Jurisdiction analysis",
                note: "Activates with retrieval pipeline.",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/28">
                  {row.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/18">{row.note}</p>
              </div>
            ))}
      </div>

      <a
        href={`/app/research?matter=${matterId}`}
        className="mt-4 inline-flex text-[11px] text-white/30 transition-colors hover:text-white/55"
      >
        Open research workspace →
      </a>
    </div>
  )
}
