import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type SystemLayer = {
  label: string
  status: "operational" | "pending" | "degraded"
}

const statusStyle: Record<SystemLayer["status"], string> = {
  operational: "bg-white/20 text-white/70",
  pending: "bg-white/[0.06] text-white/35",
  degraded: "bg-red-500/20 text-red-300/70",
}

const statusLabel: Record<SystemLayer["status"], string> = {
  operational: "Operational",
  pending: "Pending connection",
  degraded: "Degraded",
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function DashboardPage() {
  const { userId } = auth()
  if (!userId) {
    return null
  }

  let matterCount = 0
  let indexedDocumentCount = 0
  let researchSessionCount = 0
  let dataLayerAvailable = true
  let recentMatters: {
    id: string
    title: string
    status: string
    updatedAt: Date
  }[] = []
  let recentResearchSessions: {
    id: string
    query: string
    createdAt: Date
    matter: { title: string }
  }[] = []

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    })

    if (user) {
      ;[
        matterCount,
        indexedDocumentCount,
        researchSessionCount,
        recentMatters,
        recentResearchSessions,
      ] = await Promise.all([
        prisma.matter.count({ where: { userId: user.id, status: { not: "archived" } } }),
        prisma.document.count({
          where: {
            matter: { userId: user.id },
            OR: [{ retrievalStatus: "ready" }, { indexingStatus: "retrieval-ready" }],
          },
        }),
        prisma.researchSession.count({ where: { userId: user.id } }),
        prisma.matter.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 3,
          select: { id: true, title: true, status: true, updatedAt: true },
        }),
        prisma.researchSession.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            query: true,
            createdAt: true,
            matter: { select: { title: true } },
          },
        }),
      ])
    }
  } catch {
    dataLayerAvailable = false
  }

  const systemLayers: SystemLayer[] = [
    { label: "Authentication layer", status: "operational" },
    { label: "Data plane", status: dataLayerAvailable ? "operational" : "degraded" },
    { label: "AI orchestration", status: process.env.OPENAI_API_KEY ? "operational" : "pending" },
    { label: "Document index", status: indexedDocumentCount > 0 ? "operational" : "pending" },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Overview
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Mission control
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
          Grounded matter context, governed AI routing, and verifiable outputs—one
          operational layer for partner-grade work.
        </p>
      </div>

      {/* Primary stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active matters", value: String(matterCount) },
          { label: "Retrieval-ready docs", value: String(indexedDocumentCount) },
          { label: "Research sessions", value: String(researchSessionCount) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
              {card.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Operational panels */}
      <div className="grid gap-4 border-t border-white/[0.06] pt-8 lg:grid-cols-2">
        {/* Recent matter activity */}
        <div className="rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-black/30 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Recent matter activity
          </p>
          {!dataLayerAvailable ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-red-300/65">Data layer unavailable</p>
              <p className="text-sm leading-relaxed text-white/32">
                Connect Postgres to load matter activity.
              </p>
            </div>
          ) : recentMatters.length === 0 ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-white/50">No active matters</p>
              <p className="text-sm leading-relaxed text-white/32">
                Initialize your first matter workspace to begin tracked work.
                Matter context grounds all AI outputs to privilege boundaries.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {recentMatters.map((matter) => (
                <Link
                  key={matter.id}
                  href={`/app/matters/${matter.id}`}
                  className="block rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3 transition-colors hover:border-white/[0.08] hover:bg-white/[0.025]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-serif text-sm text-white/72">{matter.title}</p>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/28">
                      {matter.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/25">Updated {fmtShortDate(matter.updatedAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* AI research sessions */}
        <div className="rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-black/30 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            AI research sessions
          </p>
          {!dataLayerAvailable ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-red-300/65">Session history unavailable</p>
              <p className="text-sm leading-relaxed text-white/32">
                Research history appears after the data layer reconnects.
              </p>
            </div>
          ) : recentResearchSessions.length === 0 ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-white/50">No sessions logged</p>
              <p className="text-sm leading-relaxed text-white/32">
                Sessions surface here as your team queries the research layer.
                Authority tables, citation-grade excerpts, and retrieval traces are
                preserved per matter.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {recentResearchSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3"
                >
                  <p className="line-clamp-2 text-sm leading-relaxed text-white/62">
                    {session.query}
                  </p>
                  <p className="mt-2 text-xs text-white/25">
                    {session.matter.title} · {fmtShortDate(session.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System status */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          System status
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {systemLayers.map((layer) => (
            <div
              key={layer.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
            >
              <p className="text-[12px] text-white/55">{layer.label}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusStyle[layer.status]}`}
              >
                {statusLabel[layer.status]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Governance note */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Governance
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Sessions are Clerk-bound. Data access routes through your Postgres user row.
          Extend with org roles and audit trails as you harden the platform.
        </p>
      </div>
    </div>
  )
}
