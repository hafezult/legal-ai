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

function excerpt(text: string | null) {
  if (!text) return "No answer text stored. Re-run the research query to regenerate output."
  return text.length > 420 ? `${text.slice(0, 420).trim()}...` : text
}

export default async function DraftingPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type DraftingSource = {
    id: string
    query: string
    response: string | null
    chunkIds: string[]
    createdAt: Date
    matter: { id: string; title: string; practiceArea: string | null }
  }

  let sources: DraftingSource[] = []

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })

    if (user) {
      sources = await prisma.researchSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 12,
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
              practiceArea: true,
            },
          },
        },
      })
    }
  } catch {
    /* Database unavailable */
  }

  const answerCount = sources.filter((source) => Boolean(source.response)).length
  const citedChunks = sources.reduce((total, source) => total + source.chunkIds.length, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Draft preparation
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Grounded source material
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
          Review saved research outputs and cited source chunks before converting them
          into client-facing drafting work.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Research inputs", value: String(sources.length) },
          { label: "Generated answers", value: String(answerCount) },
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

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Drafting controls
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/38">
              This workspace currently exposes approved source material. Document
              assembly should stay downstream of retrieved citations until a dedicated
              draft schema and approval workflow are introduced.
            </p>
          </div>
          <Link
            href="/app/research"
            className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
          >
            Run research
          </Link>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No drafting sources yet</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/28">
            Run grounded research against indexed documents to build a source-backed
            drafting queue.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sources.map((source) => (
            <Link
              key={source.id}
              href={`/app/research?matter=${source.matter.id}`}
              className="block rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/32">
                    {source.matter.practiceArea?.replace(/_/g, " ") ?? "Matter"}
                  </p>
                  <p className="mt-1 font-serif text-lg leading-snug text-white/82">
                    {source.query}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-white/25">
                  {fmtDate(source.createdAt)}
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/42">
                {excerpt(source.response)}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-3">
                <p className="truncate text-xs text-white/30">{source.matter.title}</p>
                <p className="shrink-0 text-xs text-white/30">
                  {source.chunkIds.length} cited chunk
                  {source.chunkIds.length !== 1 ? "s" : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
