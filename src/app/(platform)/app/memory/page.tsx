import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function MemoryPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matterCount = 0
  let documentCount = 0
  let chunkCount = 0
  let researchSessionCount = 0
  let matters: {
    id: string
    title: string
    _count: { documents: number; chunks: number; researchSessions: number }
  }[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      ;[matterCount, documentCount, chunkCount, researchSessionCount, matters] =
        await Promise.all([
          prisma.matter.count({ where: { userId: user.id } }),
          prisma.document.count({ where: { matter: { userId: user.id } } }),
          prisma.documentChunk.count({ where: { matter: { userId: user.id } } }),
          prisma.researchSession.count({ where: { userId: user.id } }),
          prisma.matter.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: "desc" },
            take: 6,
            select: {
              id: true,
              title: true,
              _count: {
                select: {
                  documents: true,
                  chunks: true,
                  researchSessions: true,
                },
              },
            },
          }),
        ])
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Memory
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Matter memory
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Review the structured context Aether has retained for retrieval:
          matters, source documents, chunks, and research traces.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Matters", value: matterCount },
          { label: "Documents", value: documentCount },
          { label: "Chunks", value: chunkCount },
          { label: "Sessions", value: researchSessionCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
              {item.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matter memory yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/28">
            Matter memory is created as documents are uploaded, chunked, and queried
            through the research workspace.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matters.map((matter) => (
            <Link
              key={matter.id}
              href={`/app/matters/${matter.id}`}
              className="flex flex-wrap items-center gap-4 rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] px-5 py-4 transition-colors hover:bg-white/[0.03]"
            >
              <p className="min-w-0 flex-1 truncate font-serif text-base text-white/76">
                {matter.title}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/32">
                  {matter._count.documents} docs
                </span>
                <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/32">
                  {matter._count.chunks} chunks
                </span>
                <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/32">
                  {matter._count.researchSessions} sessions
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
