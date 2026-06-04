import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { MatterStatusPill } from "@/components/matters/matter-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DraftingMatter = {
  id: string
  title: string
  clientName: string | null
  practiceArea: string | null
  jurisdiction: string | null
  riskLevel: string
  status: string
  updatedAt: Date
  _count: {
    documents: number
    chunks: number
    researchSessions: number
  }
}

function practiceLabel(value: string | null) {
  if (!value) return "General"
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function readiness(matter: DraftingMatter) {
  if (matter._count.documents === 0) {
    return {
      label: "Needs sources",
      className: "border-white/[0.06] text-white/28",
      note: "Upload source documents before generating governed drafts.",
    }
  }
  if (matter._count.chunks === 0) {
    return {
      label: "Parsing",
      className: "border-amber-400/[0.18] text-amber-400/58",
      note: "Documents are registered; chunking or indexing has not populated context yet.",
    }
  }
  if (matter._count.researchSessions === 0) {
    return {
      label: "Source-ready",
      className: "border-white/[0.14] text-white/60",
      note: "Matter has source context. Run research to create a grounded drafting trace.",
    }
  }
  return {
    label: "Grounded",
    className: "border-white/[0.18] bg-white/[0.04] text-white/76",
    note: "Research memory and source chunks are ready to support drafted outputs.",
  }
}

export default async function DraftingPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matters: DraftingMatter[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matters = await prisma.matter.findMany({
        where: { userId: user.id, status: { not: "archived" } },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          clientName: true,
          practiceArea: true,
          jurisdiction: true,
          riskLevel: true,
          status: true,
          updatedAt: true,
          _count: {
            select: {
              documents: true,
              chunks: true,
              researchSessions: true,
            },
          },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const groundedMatters = matters.filter((matter) => matter._count.researchSessions > 0).length
  const sourceReadyMatters = matters.filter((matter) => matter._count.chunks > 0).length
  const totalSources = matters.reduce((sum, matter) => sum + matter._count.documents, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Output preparation
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Drafting
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            A readiness bench for drafting work product from governed matter context,
            source documents, and saved research traces.
          </p>
        </div>
        <Link
          href="/app/research"
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Build research trace
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Open matters", value: matters.length },
          { label: "Source-ready", value: sourceReadyMatters },
          { label: "Grounded drafts", value: groundedMatters },
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

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Draft controls
          </p>
          <p className="mt-4 font-serif text-lg text-white/68">
            Grounded output requirements
          </p>
          <div className="mt-5 space-y-3">
            {[
              "Select a matter with uploaded source documents.",
              "Run research to preserve retrieved excerpts and authority traces.",
              "Review source readiness before moving text into client work product.",
              "Keep drafts tied to matter ownership and privilege boundaries.",
            ].map((item, index) => (
              <div key={item} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-[10px] text-white/38">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-white/42">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
              Source inventory
            </p>
            <p className="mt-1 text-sm text-white/50">
              {totalSources} document{totalSources !== 1 ? "s" : ""} available across active matters.
            </p>
          </div>
        </div>

        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Matter drafting bench
              </p>
              <p className="mt-1 text-sm text-white/35">
                Prioritized by recent matter activity.
              </p>
            </div>
            <Link
              href="/app/matters/new"
              className="text-[11px] text-white/32 transition-colors hover:text-white/58"
            >
              New matter
            </Link>
          </div>

          {matters.length === 0 ? (
            <div className="mt-8 rounded-lg border border-white/[0.05] bg-black/20 px-5 py-8 text-center">
              <p className="font-serif text-base text-white/42">No drafting matters</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/25">
                Initialize a matter to begin collecting sources and drafting context.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {matters.map((matter) => {
                const state = readiness(matter)
                return (
                  <Link
                    key={matter.id}
                    href={`/app/matters/${matter.id}`}
                    className="block rounded-lg border border-white/[0.05] bg-black/20 px-4 py-4 transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                          {practiceLabel(matter.practiceArea)}
                          {matter.jurisdiction ? ` · ${matter.jurisdiction}` : ""}
                        </p>
                        <p className="mt-1 truncate font-serif text-[16px] text-white/76">
                          {matter.title}
                        </p>
                        {matter.clientName ? (
                          <p className="mt-0.5 truncate text-xs text-white/28">
                            {matter.clientName}
                          </p>
                        ) : null}
                      </div>
                      <MatterStatusPill status={matter.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${state.className}`}>
                        {state.label}
                      </span>
                      <span className="text-xs text-white/32">
                        {matter._count.documents} source{matter._count.documents !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-white/32">
                        {matter._count.chunks} chunk{matter._count.chunks !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-white/32">
                        {matter._count.researchSessions} trace{matter._count.researchSessions !== 1 ? "s" : ""}
                      </span>
                      <span className="ml-auto text-xs text-white/22">
                        Updated {fmtDate(matter.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-white/28">{state.note}</p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
