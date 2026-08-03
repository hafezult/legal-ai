import Link from "next/link"

import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  getActiveOrganization,
  isOrgRole,
  matterAccessWhereForActiveOrg,
  roleAtLeast,
} from "@/lib/auth/rbac"
import { documentRetrievalReadyWhere } from "@/lib/documents/status"
import { getHealthReport } from "@/lib/health"
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
  const session = await resolvePlatformClerkId()
  if (session.status === "unauthenticated") return null
  if (session.status === "unavailable") {
    return (
      <WorkspaceLoadError
        title="Identity service unavailable"
        description={session.error}
        homeHref="/app"
      />
    )
  }
  const { clerkId: userId } = session

  let matterCount = 0
  let researchSessionCount = 0
  let dataAvailable = false
  let loadFailed = false
  let recentSessions: {
    id: string
    query: string
    hasResponse: boolean
    chunkIds: string[]
    createdAt: Date
    matter: { id: string; title: string }
  }[] = []
  let recentMatters: {
    id: string
    title: string
    clientName: string | null
    status: string
    updatedAt: Date
    _count: { documents: number; researchSessions: number }
  }[] = []
  let retrievalReadyCount = 0
  let canViewHealthDetails = false

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    })

    if (!user) {
      // Authenticated Clerk session without an app user row — provisioning/sync gap.
      loadFailed = true
    } else {
      dataAvailable = true
      const activeOrg = await getActiveOrganization(user.id)
      const activeRole =
        activeOrg && isOrgRole(activeOrg.role) ? activeOrg.role : "viewer"
      canViewHealthDetails = roleAtLeast(activeRole, "admin")
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)
      const [
        countedMatters,
        countedRetrievalReady,
        countedResearchSessions,
        sessionRows,
        matterRows,
      ] = await Promise.all([
          prisma.matter.count({
            where: { ...matterWhere, status: "active" },
          }),
          prisma.document.count({
            where: {
              matter: matterWhere,
              ...documentRetrievalReadyWhere(),
            },
          }),
          prisma.researchSession.count({ where: { matter: matterWhere } }),
          prisma.researchSession.findMany({
            where: { matter: matterWhere },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              query: true,
              response: true,
              chunkIds: true,
              createdAt: true,
              matter: { select: { id: true, title: true } },
            },
          }),
          prisma.matter.findMany({
            where: { ...matterWhere, status: "active" },
            orderBy: { updatedAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              clientName: true,
              status: true,
              updatedAt: true,
              _count: { select: { documents: true, researchSessions: true } },
            },
          }),
        ])
    }
  } catch {
    loadFailed = true
  }

  // Dependency probe details stay admin/owner-only; members see workspace signals.
  const health = canViewHealthDetails
    ? await getHealthReport().catch(() => null)
    : null

  const systemLayers: SystemLayer[] = [
    {
      label: "Authentication layer",
      // Unknown probe outcome (catch / non-admin) stays pending — never claim
      // Auth is operational without a successful Clerk probe.
      status: health
        ? health.probes.clerk.status === "ok"
          ? "operational"
          : "pending"
        : "pending",
    },
    {
      label: "Data plane",
      status: health
        ? health.probes.database.status === "ok"
          ? "operational"
          : "degraded"
        : dataAvailable
          ? "operational"
          : "degraded",
    },
    {
      label: "AI orchestration",
      status: health
        ? health.probes.openai.status === "ok"
          ? "operational"
          : "pending"
        : "pending",
    },
    {
      label: "Document index",
      status: retrievalReadyCount > 0 ? "operational" : "pending",
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

      {loadFailed ? (
        <WorkspaceLoadError title="Mission control data unavailable" />
      ) : (
        <>
      {/* Primary stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active matters", value: String(matterCount) },
          {
            label: "Retrieval-ready docs",
            value: String(retrievalReadyCount),
          },
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
            <div className="mt-4 space-y-3">
              <p className="font-serif text-xl text-white/85">
                {matterCount} active {matterCount === 1 ? "matter" : "matters"}
              </p>
              <div className="space-y-2">
                {recentMatters.map((matter) => (
                  <Link
                    key={matter.id}
                    href={`/app/matters/${matter.id}`}
                    className="block rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]"
                  >
                    <p className="line-clamp-1 text-sm text-white/62">{matter.title}</p>
                    <p className="mt-1 text-[11px] text-white/28">
                      {matter.clientName ?? "No client"} · {matter.status.replace(/_/g, " ")} ·{" "}
                      {fmtShortDate(matter.updatedAt)} · {matter._count.documents} source
                      {matter._count.documents !== 1 ? "s" : ""}
                      {matter._count.researchSessions > 0
                        ? ` · ${matter._count.researchSessions} research`
                        : ""}
                    </p>
                  </Link>
                ))}
              </div>
              <Link
                href="/app/matters"
                className="inline-flex text-[11px] text-white/30 transition-colors hover:text-white/55"
              >
                Open matter registry →
              </Link>
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
                {researchSessionCount} logged session{researchSessionCount !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {recentSessions.map((session) => (
                  <Link
                    key={session.id}
                    href={`/app/research?matter=${session.matter.id}&session=${session.id}`}
                    className="block rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]"
                  >
                    <p className="line-clamp-1 text-sm text-white/62">{session.query}</p>
                    <p className="mt-1 text-[11px] text-white/28">
                      {session.matter.title} · {fmtShortDate(session.createdAt)}
                      {session.chunkIds.length > 0
                        ? ` · ${session.chunkIds.length} chunk${session.chunkIds.length !== 1 ? "s" : ""}`
                        : ""}
                      {session.response ? " · response saved" : ""}
                    </p>
                  </Link>
                ))}
              </div>
              <Link
                href="/app/research"
                className="inline-flex text-[11px] text-white/30 transition-colors hover:text-white/55"
              >
                Open research workspace →
              </Link>
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
          Sessions are Clerk-bound. Data access routes through your Postgres user row and
          organization membership. Ownership-scoped audit trails record key mutations.
          Organization roles (`owner`, `admin`, `member`, `viewer`) gate write, delete,
          and membership management across matter workspaces.
        </p>
      </div>
        </>
      )}
    </div>
  )
}
