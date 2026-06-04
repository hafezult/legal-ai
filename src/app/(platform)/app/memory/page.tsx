import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function preview(text: string | null) {
  if (!text) return "No generated answer was stored for this session."
  return text.length > 220 ? `${text.slice(0, 220).trim()}...` : text
}

export default async function MemoryPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type MemorySession = {
    id: string
    query: string
    response: string | null
    chunkIds: string[]
    createdAt: Date
    matter: { id: string; title: string; clientName: string | null }
  }

  let sessions: MemorySession[] = []
  let matterCount = 0

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })

    if (user) {
      ;[sessions, matterCount] = await Promise.all([
        prisma.researchSession.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            query: true,
            response: true,
            chunkIds: true,
            createdAt: true,
            matter: {
              select: {
                id: true,
                title: true,
                clientName: true,
              },
            },
          },
        }),
        prisma.matter.count({ where: { userId: user.id } }),
      ])
    }
  } catch {
    /* Database unavailable */
  }

  const citedChunks = sessions.reduce(
    (total, session) => total + session.chunkIds.length,
    0
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Matter memory
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Research ledger
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
          Persisted research queries, grounded answers, and cited retrieval chunks across
          active matter workspaces.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Stored sessions", value: String(sessions.length) },
          { label: "Matter scopes", value: String(matterCount) },
          { label: "Cited chunks", value: String(citedChunks) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No research memory yet</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/28">
            Run a grounded research query from the Research workspace to create the
            first persisted matter memory entry.
          </p>
          <Link
            href="/app/research"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Open research
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/app/research?matter=${session.matter.id}`}
              className="block rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.025]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/32">
                    {session.matter.title}
                  </p>
                  <p className="mt-1 font-serif text-lg leading-snug text-white/82">
                    {session.query}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-white/25">
                  {fmtDate(session.createdAt)}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/42">
                {preview(session.response)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.matter.clientName ? (
                  <span className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
                    {session.matter.clientName}
                  </span>
                ) : null}
                <span className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
                  {session.chunkIds.length} cited chunk
                  {session.chunkIds.length !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
