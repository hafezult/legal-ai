import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type SystemLayer = {
  label: string
  status: "operational" | "pending" | "degraded"
}

const systemLayers: SystemLayer[] = [
  { label: "Authentication layer", status: "operational" },
  { label: "Data plane", status: "pending" },
  { label: "AI orchestration", status: "operational" },
  { label: "Document index", status: "pending" },
]

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

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default async function DashboardPage() {
  const { userId } = auth()
  if (!userId) {
    return null
  }

  let matterCount = 0
  let indexedDocumentCount = 0
  let totalDocumentCount = 0
  let recentMatters: {
    id: string
    title: string
    status: string
    updatedAt: Date
  }[] = []
  let recentSessions: {
    id: string
    query: string
    createdAt: Date
    matter: { id: string; title: string }
  }[] = []

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    })

    if (user) {
      ;[
        matterCount,
        indexedDocumentCount,
        totalDocumentCount,
        recentMatters,
        recentSessions,
      ] = await Promise.all([
        prisma.matter.count({ where: { userId: user.id } }),
        prisma.document.count({
          where: { matter: { userId: user.id }, retrievalStatus: "ready" },
        }),
        prisma.document.count({
          where: { matter: { userId: user.id } },
        }),
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
            matter: { select: { id: true, title: true } },
          },
        }),
      ])
    }
  } catch {
    /* Database unavailable in local dev */
  }

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
          {
            label: "Retrieval-ready docs",
            value:
              totalDocumentCount > 0
                ? `${indexedDocumentCount}/${totalDocumentCount}`
                : "0",
          },
          { label: "Workspace", value: "Live" },
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
          {recentMatters.length === 0 ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-white/50">No active matters</p>
              <p className="text-sm leading-relaxed text-white/32">
                Initialize your first matter workspace to begin tracked work.
                Matter context grounds all AI outputs to privilege boundaries.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {recentMatters.map((matter) => (
                <Link
                  key={matter.id}
                  href={`/app/matters/${matter.id}`}
                  className="block rounded-lg border border-white/[0.05] bg-white/[0.015] px-3.5 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-serif text-sm text-white/72">
                      {matter.title}
                    </p>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-white/28">
                      {matter.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/25">
                    Updated {formatShortDate(matter.updatedAt)}
                  </p>
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
          {recentSessions.length === 0 ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-white/50">No sessions logged</p>
              <p className="text-sm leading-relaxed text-white/32">
                Sessions surface here as your team queries the research layer.
                Authority tables, citation-grade excerpts, and retrieval traces are
                preserved per matter.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {recentSessions.map((session) => (
                <Link
                  key={session.id}
                  href="/app/research"
                  className="block rounded-lg border border-white/[0.05] bg-white/[0.015] px-3.5 py-3 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm leading-relaxed text-white/62">
                      {session.query}
                    </p>
                    <span className="shrink-0 text-[10px] text-white/24">
                      {formatShortDate(session.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/28">
                    {session.matter.title}
                  </p>
                </Link>
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
