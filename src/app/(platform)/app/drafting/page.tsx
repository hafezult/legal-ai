import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DraftingMatter = {
  id: string
  title: string
  clientName: string | null
  jurisdiction: string | null
  documents: {
    id: string
    indexingStatus: string
    retrievalStatus: string
  }[]
  _count: {
    researchSessions: number
  }
}

export default async function DraftingPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let matters: DraftingMatter[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matters = await prisma.matter.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          clientName: true,
          jurisdiction: true,
          documents: {
            select: {
              id: true,
              indexingStatus: true,
              retrievalStatus: true,
            },
          },
          _count: { select: { researchSessions: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const sourceCount = matters.reduce((sum, matter) => sum + matter.documents.length, 0)
  const retrievalReadyCount = matters.reduce(
    (sum, matter) =>
      sum +
      matter.documents.filter(
        (doc) => doc.retrievalStatus === "ready" || doc.indexingStatus === "retrieval-ready"
      ).length,
    0
  )
  const researchSessionCount = matters.reduce(
    (sum, matter) => sum + matter._count.researchSessions,
    0
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Draft preparation
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Drafting
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Use indexed matter sources and saved research sessions as the evidence base
            for briefs, advice notes, and clause analysis.
          </p>
        </div>
        <Link
          href="/app/research"
          className="mt-1 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Open research
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Matter contexts", value: matters.length },
          { label: "Retrieval-ready sources", value: retrievalReadyCount },
          { label: "Saved research sessions", value: researchSessionCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-card)] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/85">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matter context available</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            Create a matter and upload sources before preparing grounded drafts.
          </p>
          <Link
            href="/app/matters/new"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Initialize matter
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Matter
            </span>
            <span className="hidden w-36 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Client
            </span>
            <span className="hidden w-36 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Jurisdiction
            </span>
            <span className="w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32">
              Sources
            </span>
            <span className="w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32">
              Research
            </span>
          </div>

          {matters.map((matter) => {
            const readySources = matter.documents.filter(
              (doc) =>
                doc.retrievalStatus === "ready" || doc.indexingStatus === "retrieval-ready"
            ).length

            return (
              <Link
                key={matter.id}
                href={`/app/matters/${matter.id}`}
                className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-[15px] text-white/82 transition-colors group-hover:text-white/95">
                    {matter.title}
                  </p>
                </div>
                <span className="hidden w-36 shrink-0 truncate text-sm text-white/40 md:block">
                  {matter.clientName ?? "-"}
                </span>
                <span className="hidden w-36 shrink-0 truncate text-sm text-white/40 lg:block">
                  {matter.jurisdiction ?? "-"}
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-white/45">
                  {readySources}/{matter.documents.length} ready
                </span>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-white/45">
                  {matter._count.researchSessions}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Drafting control
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Draft outputs should be prepared from retrieval-ready sources and reviewed
          against the matter record before client use.
        </p>
      </div>
    </div>
  )
}
