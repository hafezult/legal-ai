import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { DocumentUploadZone } from "@/components/documents/document-upload-zone"
import { MatterStatusPill } from "@/components/matters/matter-status-pill"
import { prisma } from "@/lib/prisma"
import { uploadDocument } from "./actions"

export const dynamic = "force-dynamic"

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function fmtBytes(n: number | null) {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function mimeLabel(mime: string | null) {
  if (!mime) return "—"
  if (mime === "application/pdf") return "PDF"
  if (mime.includes("wordprocessingml")) return "DOCX"
  if (mime === "text/plain") return "TXT"
  return mime.split("/")[1]?.toUpperCase() ?? "—"
}

function practiceLabel(v: string | null) {
  if (!v) return null
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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

// ── Constants ─────────────────────────────────────────────────────────────

const riskStyle: Record<string, string> = {
  low:      "text-white/42",
  medium:   "text-amber-400/62",
  high:     "text-orange-400/65",
  critical: "text-red-400/65",
}

const systemLayers = [
  { label: "Authentication layer",  status: "operational" },
  { label: "Matter context",        status: "active" },
  { label: "Retrieval system",      status: "pending" },
  { label: "Embedding index",       status: "awaiting" },
  { label: "Orchestration layer",   status: "operational" },
  { label: "Drafting surface",      status: "available" },
]

const sysStyle: Record<string, string> = {
  operational: "border-white/[0.12] bg-white/[0.03] text-white/58",
  active:      "border-white/[0.16] bg-white/[0.05] text-white/75",
  pending:     "border-white/[0.07] bg-transparent text-white/32",
  awaiting:    "border-white/[0.05] bg-transparent text-white/25",
  available:   "border-white/[0.10] bg-white/[0.025] text-white/52",
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function MatterDetailPage({
  params,
}: {
  params: { matterId: string }
}) {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type Doc = {
    id: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
    indexingStatus: string
    retrievalStatus: string
    uploadStatus: string
    uploadedAt: Date
  }

  type MatterData = {
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
    documents: Doc[]
    _count: { documents: number; conversations: number }
  }

  let matter: MatterData | null = null

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
          documents: {
            orderBy: { uploadedAt: "desc" },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              indexingStatus: true,
              retrievalStatus: true,
              uploadStatus: true,
              uploadedAt: true,
            },
          },
          _count: { select: { documents: true, conversations: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  if (!matter) notFound()

  // Bind server action — safe to pass to client component
  const boundUpload = uploadDocument.bind(null, matter.id)

  const hasDocuments = matter.documents.length > 0

  const timelineEvents = [
    { label: "Matter initialized",     note: fmtDate(matter.createdAt),       state: "complete"   as const },
    { label: "Workspace provisioned",  note: fmtDate(matter.createdAt),       state: "complete"   as const },
    { label: "Source ingestion",       note: hasDocuments ? `${matter._count.documents} document${matter._count.documents !== 1 ? "s" : ""} indexed` : "Awaiting first document", state: hasDocuments ? "complete" as const : "pending" as const },
    { label: "Retrieval layer",        note: "Pending index completion",        state: "pending"    as const },
    { label: "Authority analysis",     note: "Awaiting retrieval layer",        state: "pending"    as const },
  ]

  return (
    <div className="space-y-5">

      {/* ── Section A — Matter Header ─────────────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/38">
              {practiceLabel(matter.practiceArea) ?? "Matter"}
            </p>
            <h1 className="mt-1 font-serif text-2xl tracking-tight text-white/[0.96] md:text-3xl">
              {matter.title}
            </h1>
          </div>
          <MatterStatusPill status={matter.status} className="mt-1 shrink-0" />
        </div>

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/[0.05] pt-5">
          <MetaField label="Client"       value={matter.clientName} />
          <MetaField label="Jurisdiction" value={matter.jurisdiction} />
          <MetaField label="Billing code" value={matter.billingCode} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/32">Risk level</p>
            <p className={`mt-0.5 text-sm ${riskStyle[matter.riskLevel] ?? riskStyle.medium}`}>
              {matter.riskLevel.charAt(0).toUpperCase() + matter.riskLevel.slice(1)}
            </p>
          </div>
          <MetaField label="Initialized"  value={fmtDate(matter.createdAt)} />
          <MetaField label="Last updated" value={fmtDate(matter.updatedAt)} />
        </div>

        {matter.description && (
          <p className="mt-4 border-t border-white/[0.04] pt-4 text-sm leading-relaxed text-white/42">
            {matter.description}
          </p>
        )}
      </div>

      {/* ── Section B — Document Intelligence ────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/30 p-6">

        {/* Section header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Document intelligence
            </p>
            <p className="mt-1 font-serif text-[15px] text-white/65">
              {hasDocuments
                ? `${matter._count.documents} source${matter._count.documents !== 1 ? "s" : ""} ingested`
                : "Source ingestion"}
            </p>
          </div>
          <span className="rounded-full border border-white/[0.07] px-2.5 py-0.5 text-[10px] text-white/25">
            {hasDocuments ? "Active" : "Awaiting sources"}
          </span>
        </div>

        {/* Upload zone — client component; action bound server-side */}
        <DocumentUploadZone uploadAction={boundUpload} />

        {/* Document registry */}
        {hasDocuments ? (
          <div className="mt-6">
            <p className="mb-3 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Source registry
            </p>

            <div className="overflow-hidden rounded-lg border border-white/[0.06]">
              {/* Column headers */}
              <div className="flex items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
                <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.14em] text-white/28">
                  Document
                </span>
                <span className="hidden w-12 shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/28 sm:block">
                  Type
                </span>
                <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/28 sm:block">
                  Size
                </span>
                <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/28">
                  Indexing
                </span>
                <span className="hidden w-24 shrink-0 text-[10px] uppercase tracking-[0.14em] text-white/28 lg:block">
                  Retrieval
                </span>
                <span className="hidden w-32 shrink-0 text-right text-[10px] uppercase tracking-[0.14em] text-white/28 lg:block">
                  Ingested
                </span>
              </div>

              {/* Rows */}
              {matter.documents.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/app/matters/${matter.id}/documents/${doc.id}`}
                  className="flex items-center gap-4 border-t border-white/[0.04] px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-white/75">{doc.fileName}</p>
                  </div>
                  <span className="hidden w-12 shrink-0 text-xs text-white/38 sm:block">
                    {mimeLabel(doc.mimeType)}
                  </span>
                  <span className="hidden w-16 shrink-0 text-xs tabular-nums text-white/38 sm:block">
                    {fmtBytes(doc.fileSize)}
                  </span>
                  <div className="w-24 shrink-0">
                    <DocumentStatusPill status={doc.indexingStatus} />
                  </div>
                  <div className="hidden w-24 shrink-0 lg:block">
                    <DocumentStatusPill status={doc.retrievalStatus} />
                  </div>
                  <span className="hidden w-32 shrink-0 text-right text-xs text-white/25 lg:block">
                    {fmtShortDate(doc.uploadedAt)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Empty state — intelligence readiness */
          <div className="mt-6 space-y-2">
            {[
              { label: "Indexed sources",    value: "0" },
              { label: "Ingestion queue",    value: "Idle" },
              { label: "Retrieval readiness",value: "Pending" },
              { label: "Clause intelligence",value: "Inactive" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between border-t border-white/[0.04] py-2.5 first:border-t-0">
                <p className="text-xs text-white/35">{s.label}</p>
                <p className="tabular-nums text-xs text-white/48">{s.value}</p>
              </div>
            ))}
            <p className="pt-2 text-xs leading-relaxed text-white/22">
              Grounded document intelligence activates after indexed source ingestion.
              Ingest the first document above to initialize the retrieval layer.
            </p>
          </div>
        )}
      </div>

      {/* ── Section C — Research Ops / Intelligence Readiness ─────── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* AI Research Operations */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              AI research operations
            </p>
            <span className="rounded-full border border-white/[0.06] px-2.5 py-0.5 text-[10px] text-white/22">
              Layer standing by
            </span>
          </div>
          <p className="mt-4 font-serif text-[14px] text-white/42">
            No active research sessions
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/25">
            Citation-grade outputs initialize here after research queries are submitted
            within this matter context.
          </p>
          <div className="mt-5 space-y-2">
            {[
              { label: "Authority chains",     note: "No chains indexed. Populate after source ingestion." },
              { label: "Retrieval trace",       note: "No active sessions. Outputs surface after queries." },
              { label: "Grounded excerpts",     note: "Available after document index is established." },
              { label: "Jurisdiction analysis", note: "Activates with retrieval pipeline." },
            ].map((r) => (
              <div key={r.label} className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/28">{r.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/18">{r.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Intelligence Readiness Panel */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Intelligence readiness
          </p>
          <p className="mt-4 font-serif text-[14px] text-white/42">
            Grounded intelligence pending
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/25">
            Future intelligence surfaces including clause extraction, citation analysis,
            authority linking, and semantic retrieval initialize here after source indexing.
          </p>

          <div className="mt-5 space-y-2">
            {[
              { label: "Clause extraction",    status: hasDocuments ? "pending" : "awaiting" },
              { label: "Citation analysis",    status: "awaiting" },
              { label: "Authority linking",    status: "awaiting" },
              { label: "Semantic retrieval",   status: "awaiting" },
              { label: "Reasoning traces",     status: "awaiting" },
              { label: "Research sessions",    status: matter._count.conversations > 0 ? "active" : "pending" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between border-t border-white/[0.04] py-2.5 first:border-t-0">
                <p className="text-xs text-white/38">{item.label}</p>
                <span className={`text-[10px] uppercase tracking-[0.1em] ${
                  item.status === "active"   ? "text-white/65" :
                  item.status === "pending"  ? "text-white/35" :
                                               "text-white/20"
                }`}>
                  {item.status === "awaiting" ? "Awaiting" : item.status === "pending" ? "Pending" : "Active"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section D — Operational Timeline ─────────────────────── */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
          Operational timeline
        </p>
        <div className="mt-6">
          {timelineEvents.map((ev, i) => (
            <div key={ev.label} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`mt-[3px] h-2 w-2 shrink-0 rounded-full border ${
                    ev.state === "complete"
                      ? "border-white/35 bg-white/35"
                      : "border-white/[0.1] bg-transparent"
                  }`}
                />
                {i < timelineEvents.length - 1 && (
                  <div className="my-1 w-px flex-1 bg-white/[0.06]" style={{ minHeight: 28 }} />
                )}
              </div>
              <div className="pb-5 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <p className={`text-[13px] ${ev.state === "complete" ? "text-white/68" : "text-white/30"}`}>
                    {ev.label}
                  </p>
                  <p className={`text-xs ${ev.state === "complete" ? "text-white/30" : "text-white/18"}`}>
                    {ev.note}
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
            className="text-[11px] text-white/28 transition-colors hover:text-white/52"
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
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${sysStyle[layer.status]}`}>
                {layer.status.charAt(0).toUpperCase() + layer.status.slice(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
