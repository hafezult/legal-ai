import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type MatterMemory = {
  id: string
  title: string
  clientName: string | null
  updatedAt: Date
  _count: {
    documents: number
    chunks: number
    researchSessions: number
  }
}

type ResearchMemory = {
  id: string
  query: string
  response: string | null
  chunkIds: string[]
  createdAt: Date
  matter: {
    id: string
    title: string
  }
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function truncate(value: string, max = 180) {
  return value.length > max ? `${value.slice(0, max).trim()}...` : value
}

export default async function MemoryPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matterMemory: MatterMemory[] = []
  let researchMemory: ResearchMemory[] = []
  let totalChunks = 0

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      ;[matterMemory, researchMemory, totalChunks] = await Promise.all([
        prisma.matter.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            clientName: true,
            updatedAt: true,
            _count: {
              select: {
                documents: true,
                chunks: true,
                researchSessions: true,
              },
            },
          },
        }),
        prisma.researchSession.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 5,
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
              },
            },
          },
        }),
        prisma.documentChunk.count({ where: { matter: { userId: user.id } } }),
      ])
    }
  } catch {
    /* DB unavailable */
  }

  const totalDocuments = matterMemory.reduce((sum, matter) => sum + matter._count.documents, 0)
  const totalResearch = matterMemory.reduce((sum, matter) => sum + matter._count.researchSessions, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Knowledge graph
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Memory
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Workspace memory is assembled from matter metadata, indexed source chunks,
          and saved research sessions while preserving matter boundaries.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Matter memories", value: matterMemory.length },
          { label: "Source chunks", value: totalChunks },
          { label: "Research sessions", value: totalResearch },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.9]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Matter memory map
              </p>
              <p className="mt-1 text-sm text-white/35">
                Indexed context available per governed workspace.
              </p>
            </div>
            <Link
              href="/app/matters"
              className="text-[11px] text-white/32 transition-colors hover:text-white/58"
            >
              Matters
            </Link>
          </div>

          {matterMemory.length === 0 ? (
            <div className="mt-8 rounded-lg border border-white/[0.05] bg-white/[0.01] px-5 py-8 text-center">
              <p className="font-serif text-base text-white/42">No matter memory yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/25">
                Create a matter and upload sources to build a scoped memory graph.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {matterMemory.map((matter) => (
                <Link
                  key={matter.id}
                  href={`/app/matters/${matter.id}`}
                  className="block rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3 transition-colors hover:bg-white/[0.025]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-[15px] text-white/72">
                        {matter.title}
                      </p>
                      {matter.clientName ? (
                        <p className="mt-0.5 truncate text-xs text-white/28">
                          {matter.clientName}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-white/24">
                      {fmtDate(matter.updatedAt)}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-white/35 sm:grid-cols-3">
                    <span>{matter._count.documents} source{matter._count.documents !== 1 ? "s" : ""}</span>
                    <span>{matter._count.chunks} chunk{matter._count.chunks !== 1 ? "s" : ""}</span>
                    <span>{matter._count.researchSessions} session{matter._count.researchSessions !== 1 ? "s" : ""}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Research memory
              </p>
              <p className="mt-1 text-sm text-white/35">
                Recent grounded outputs and retrieval traces.
              </p>
            </div>
            <Link
              href="/app/research"
              className="text-[11px] text-white/32 transition-colors hover:text-white/58"
            >
              Research
            </Link>
          </div>

          {researchMemory.length === 0 ? (
            <div className="mt-8 rounded-lg border border-white/[0.05] bg-black/20 px-5 py-8 text-center">
              <p className="font-serif text-base text-white/42">No saved sessions</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/25">
                Research runs persist here with source chunk references when the data
                layer is available.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {researchMemory.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3"
                >
                  <Link
                    href={`/app/matters/${session.matter.id}`}
                    className="text-[10px] uppercase tracking-[0.14em] text-white/30 transition-colors hover:text-white/52"
                  >
                    {session.matter.title}
                  </Link>
                  <p className="mt-2 text-sm leading-relaxed text-white/68">
                    {truncate(session.query, 120)}
                  </p>
                  {session.response ? (
                    <p className="mt-2 border-l border-white/[0.07] pl-3 text-xs leading-relaxed text-white/32">
                      {truncate(session.response)}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[10px] text-white/22">
                    {fmtDate(session.createdAt)} · {session.chunkIds.length} retrieved chunk{session.chunkIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Retention posture
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Current memory is derived from first-party matter records ({totalDocuments} source
          {totalDocuments !== 1 ? "s" : ""}) and remains scoped by authenticated user and
          matter ownership.
        </p>
      </div>
    </div>
  )
}
