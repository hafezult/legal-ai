import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { notFound } from "next/navigation"

import { MatterStatusPill } from "@/components/matters/matter-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function practiceAreaLabel(value: string | null) {
  if (!value) return null
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function MetaField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-white/32">{label}</p>
      <p className="mt-0.5 text-sm text-white/68">{value}</p>
    </div>
  )
}

const riskStyle: Record<string, string> = {
  low: "text-white/42",
  medium: "text-amber-400/62",
  high: "text-orange-400/65",
  critical: "text-red-400/65",
}

const systemLayers = [
  { label: "Authentication layer", status: "operational" },
  { label: "Matter context", status: "active" },
  { label: "Retrieval system", status: "pending" },
  { label: "Embedding index", status: "awaiting" },
  { label: "Orchestration layer", status: "operational" },
  { label: "Drafting surface", status: "available" },
]

const systemStatusStyle: Record<string, string> = {
  operational: "border-white/[0.12] bg-white/[0.03] text-white/58",
  active:      "border-white/[0.16] bg-white/[0.05] text-white/75",
  pending:     "border-white/[0.07] bg-transparent text-white/32",
  awaiting:    "border-white/[0.05] bg-transparent text-white/25",
  available:   "border-white/[0.10] bg-white/[0.025] text-white/52",
}

export default async function MatterDetailPage({
  params,
}: {
  params: { matterId: string }
}) {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type MatterDetail = {
    id: string
    title: string
    description: string | null
    clientName: string | null
    practiceArea: string | null
    jurisdiction: string | null
    riskLevel: string
    billingCode: string | null
    status: string
    createdAt: Date
    updatedAt: Date
    _count: { documents: number; conversations: number }
  }

  let matter: MatterDetail | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      matter = await prisma.matter.findFirst({
        where: { id: params.matterId, userId: user.id },
        select: {
          id: true,
          title: true,
          description: true,
          clientName: true,
          practiceArea: true,
          jurisdiction: true,
          riskLevel: true,
          billingCode: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { documents: true, conversations: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  if (!matter) notFound()

  const timelineEvents = [
    {
      label: "Matter initialized",
      note: formatDate(matter.createdAt),
      state: "complete" as const,
    },
    {
      label: "Workspace provisioned",
      note: formatDate(matter.createdAt),
      state: "complete" as const,
    },
    {
      label: "Retrieval layer",
      note: "Pending source ingestion",
      state: "pending" as const,
    },
    {
      label: "Authority analysis",
      note: "Awaiting retrieval layer",
      state: "pending" as const,
    },
    {
      label: "Drafting surface",
      note: "Available",
      state: "available" as const,
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Section A — Matter Header ──────────────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/38">
              {practiceAreaLabel(matter.practiceArea) ?? "Matter"}
            </p>
            <h1 className="mt-1 font-serif text-2xl tracking-tight text-white/[0.96] md:text-3xl">
              {matter.title}
            </h1>
          </div>
          <MatterStatusPill status={matter.status} className="mt-1" />
        </div>

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/[0.05] pt-5">
          <MetaField label="Client" value={matter.clientName} />
          <MetaField label="Jurisdiction" value={matter.jurisdiction} />
          <MetaField label="Billing code" value={matter.billingCode} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/32">Risk level</p>
            <p className={`mt-0.5 text-sm ${riskStyle[matter.riskLevel] ?? riskStyle.medium}`}>
              {matter.riskLevel.charAt(0).toUpperCase() + matter.riskLevel.slice(1)}
            </p>
          </div>
          <MetaField label="Initialized" value={formatDate(matter.createdAt)} />
          <MetaField label="Last updated" value={formatDate(matter.updatedAt)} />
        </div>

        {matter.description && (
          <p className="mt-4 border-t border-white/[0.04] pt-4 text-sm leading-relaxed text-white/42">
            {matter.description}
          </p>
        )}
      </div>

      {/* ── Section B + C — Research Ops / Document Intelligence ──── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Section B — AI Research Operations */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/30 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              AI research operations
            </p>
            <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/25">
              Layer standing by
            </span>
          </div>

          <p className="mt-5 font-serif text-[15px] text-white/48">
            No active research sessions
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/28">
            Citation-grade outputs initialize here after research queries are submitted
            within this matter context. Sessions are scoped to privilege boundaries.
          </p>

          <div className="mt-6 space-y-2.5">
            {[
              {
                label: "Authority chains",
                note: "No authority chains indexed. Chains populate after source ingestion and query sessions.",
              },
              {
                label: "Retrieval trace",
                note: "No active retrieval sessions. Citation outputs surface after research queries.",
              },
              {
                label: "Jurisdiction analysis",
                note: "Pending. Jurisdiction layer activates with the retrieval pipeline.",
              },
              {
                label: "Grounded excerpts",
                note: "Excerpt intelligence available after document index is established.",
              },
            ].map((region) => (
              <div
                key={region.label}
                className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/32">
                  {region.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/22">{region.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section C — Document Intelligence */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/30 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Document intelligence
            </p>
            <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/25">
              Awaiting sources
            </span>
          </div>

          <p className="mt-5 font-serif text-[15px] text-white/48">
            Source ingestion pending
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/28">
            Document intelligence activates after source ingestion. Indexed documents
            establish retrieval context for governed AI research within this matter.
          </p>

          <div className="mt-6 space-y-0 divide-y divide-white/[0.04]">
            {[
              {
                label: "Indexed sources",
                value: String(matter._count.documents),
              },
              { label: "Ingestion queue", value: "Idle" },
              {
                label: "Retrieval readiness",
                value: matter._count.documents > 0 ? "Ready" : "Pending",
              },
              { label: "Clause intelligence", value: "Inactive" },
              {
                label: "Research sessions",
                value: String(matter._count.conversations),
              },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center justify-between py-2.5">
                <p className="text-xs text-white/38">{stat.label}</p>
                <p className="tabular-nums text-xs text-white/52">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3">
            <p className="text-xs leading-relaxed text-white/22">
              Document upload, indexing, embedding pipelines, and clause extraction will
              surface here in the document intelligence phase.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section D — Operational Timeline ─────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          Operational timeline
        </p>

        <div className="mt-6">
          {timelineEvents.map((event, i) => (
            <div key={event.label} className="flex gap-4">
              {/* Track */}
              <div className="flex flex-col items-center">
                <div
                  className={`mt-[3px] h-2 w-2 shrink-0 rounded-full border ${
                    event.state === "complete"
                      ? "border-white/35 bg-white/35"
                      : event.state === "available"
                      ? "border-white/[0.18] bg-white/[0.1]"
                      : "border-white/[0.1] bg-transparent"
                  }`}
                />
                {i < timelineEvents.length - 1 && (
                  <div className="my-1 w-px flex-1 bg-white/[0.06]" style={{ minHeight: 28 }} />
                )}
              </div>

              {/* Content */}
              <div className="pb-5 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <p
                    className={`text-[13px] ${
                      event.state === "complete" ? "text-white/68" : "text-white/32"
                    }`}
                  >
                    {event.label}
                  </p>
                  <p
                    className={`text-xs ${
                      event.state === "complete" ? "text-white/32" : "text-white/18"
                    }`}
                  >
                    {event.note}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section E — System State ──────────────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] p-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">System state</p>
          <Link
            href="/app/matters"
            className="text-[11px] text-white/28 transition-colors hover:text-white/55"
          >
            ← Registry
          </Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {systemLayers.map((layer) => (
            <div
              key={layer.label}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3"
            >
              <p className="text-[12px] text-white/48">{layer.label}</p>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${systemStatusStyle[layer.status]}`}
              >
                {layer.status.charAt(0).toUpperCase() + layer.status.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
