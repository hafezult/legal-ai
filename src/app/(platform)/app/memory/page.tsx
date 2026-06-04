import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function MemoryPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type SessionRow = {
    id: string
    query: string
    createdAt: Date
    matter: {
      id: string
      title: string
    }
  }
  type MatterMemory = {
    id: string
    title: string
    updatedAt: Date
    _count: {
      documents: number
      chunks: number
      researchSessions: number
    }
  }

  let sessions: SessionRow[] = []
  let matters: MatterMemory[] = []
  let chunkCount = 0

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      ;[sessions, matters, chunkCount] = await Promise.all([
        prisma.researchSession.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            query: true,
            createdAt: true,
            matter: { select: { id: true, title: true } },
          },
        }),
        prisma.matter.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 8,
          select: {
            id: true,
            title: true,
            updatedAt: true,
            _count: { select: { documents: true, chunks: true, researchSessions: true } },
          },
        }),
        prisma.documentChunk.count({ where: { matter: { userId: user.id } } }),
      ])
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Workspace memory
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Knowledge ledger
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Review the matter-bound knowledge graph created from indexed chunks and
          grounded research sessions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Matter memories", value: matters.length },
          { label: "Research sessions", value: sessions.length },
          { label: "Indexed chunks", value: chunkCount },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.025] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {card.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.9]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
            Matter memory map
          </p>

          {matters.length === 0 ? (
            <div className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.01] p-5">
              <p className="font-serif text-base text-white/50">No memory entries</p>
              <p className="mt-2 text-sm leading-relaxed text-white/28">
                Matter memory appears after sources are uploaded and research is run.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {matters.map((matter) => (
                <Link
                  key={matter.id}
                  href={`/app/matters/${matter.id}`}
                  className="block rounded-lg border border-white/[0.055] bg-white/[0.012] px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/72">{matter.title}</p>
                      <p className="mt-0.5 text-xs text-white/25">
                        Updated {fmtDate(matter.updatedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-white/35">
                      {matter._count.chunks} chunks
                    </span>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-white/28">
                    <span>{matter._count.documents} docs</span>
                    <span>{matter._count.researchSessions} sessions</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
              Recent retrieval traces
            </p>
            <Link
              href="/app/research"
              className="text-[11px] text-white/35 transition-colors hover:text-white/65"
            >
              Open research
            </Link>
          </div>

          {sessions.length === 0 ? (
            <div className="mt-6 rounded-lg border border-white/[0.05] bg-black/20 p-5">
              <p className="font-serif text-base text-white/50">No saved sessions</p>
              <p className="mt-2 text-sm leading-relaxed text-white/28">
                Grounded research queries are retained here with matter scope and
                chunk lineage.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/app/matters/${session.matter.id}`}
                  className="block rounded-lg border border-white/[0.055] bg-black/20 px-4 py-3 transition-colors hover:border-white/[0.1] hover:bg-white/[0.025]"
                >
                  <p className="line-clamp-2 text-sm leading-relaxed text-white/70">
                    {session.query}
                  </p>
                  <p className="mt-2 text-xs text-white/28">
                    {session.matter.title} - {fmtDate(session.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
