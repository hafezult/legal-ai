import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type SystemLayer = {
  label: string
  status: "operational" | "pending" | "degraded"
  note: string
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

export default async function DashboardPage() {
  const { userId } = auth()
  if (!userId) {
    return null
  }

  let matterCount = 0
  let documentCount = 0
  let indexedDocumentCount = 0
  let researchSessionCount = 0
  let dataPlaneAvailable = false
  let recentMatter: {
    id: string
    title: string
    clientName: string | null
    updatedAt: Date
  } | null = null
  let recentSession: {
    id: string
    query: string
    createdAt: Date
    matter: { title: string }
  } | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    })

    if (user) {
      dataPlaneAvailable = true
      ;[
        matterCount,
        documentCount,
        indexedDocumentCount,
        researchSessionCount,
        recentMatter,
        recentSession,
      ] = await Promise.all([
        prisma.matter.count({ where: { userId: user.id, status: { not: "archived" } } }),
        prisma.document.count({
          where: { matter: { userId: user.id } },
        }),
        prisma.document.count({
          where: { matter: { userId: user.id }, retrievalStatus: "ready" },
        }),
        prisma.researchSession.count({ where: { userId: user.id } }),
        prisma.matter.findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            clientName: true,
            updatedAt: true,
          },
        }),
        prisma.researchSession.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
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
    /* Database unavailable in local dev */
  }

  const systemLayers: SystemLayer[] = [
    {
      label: "Authentication layer",
      status: "operational",
      note: "Clerk session active",
    },
    {
      label: "Data plane",
      status: dataPlaneAvailable ? "operational" : "degraded",
      note: dataPlaneAvailable ? "Prisma connected" : "Database unavailable",
    },
    {
      label: "AI orchestration",
      status: process.env.OPENAI_API_KEY ? "operational" : "pending",
      note: process.env.OPENAI_API_KEY ? "OpenAI configured" : "Awaiting OPENAI_API_KEY",
    },
    {
      label: "Document index",
      status: indexedDocumentCount > 0 ? "operational" : documentCount > 0 ? "pending" : "pending",
      note:
        indexedDocumentCount > 0
          ? `${indexedDocumentCount} ready`
          : documentCount > 0
            ? "Indexing pending"
            : "Awaiting sources",
    },
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
          { label: "Indexed documents", value: String(indexedDocumentCount) },
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
          {matterCount === 0 ? (
            <div className="mt-4 space-y-1">
              <p className="font-serif text-base text-white/50">No active matters</p>
              <p className="text-sm leading-relaxed text-white/32">
                Initialize your first matter workspace to begin tracked work.
                Matter context grounds all AI outputs to privilege boundaries.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="font-serif text-xl text-white/85">
                {matterCount} active {matterCount === 1 ? "matter" : "matters"}
              </p>
              {recentMatter && (
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/28">
                    Latest update
                  </p>
                  <p className="mt-1 truncate text-sm text-white/62">
                    {recentMatter.title}
                  </p>
                  <p className="mt-0.5 text-xs text-white/28">
                    {recentMatter.clientName ?? "No client recorded"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI research sessions */}
        <div className="rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-black/30 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            AI research sessions
          </p>
          {researchSessionCount === 0 ? (
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
              <p className="font-serif text-xl text-white/85">
                {researchSessionCount} session{researchSessionCount !== 1 ? "s" : ""}
              </p>
              {recentSession && (
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/28">
                    Latest query · {recentSession.matter.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-white/62">
                    {recentSession.query}
                  </p>
                </div>
              )}
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
              <div className="text-right">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${statusStyle[layer.status]}`}
                >
                  {statusLabel[layer.status]}
                </span>
                <p className="mt-1 text-[10px] text-white/25">{layer.note}</p>
              </div>
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
