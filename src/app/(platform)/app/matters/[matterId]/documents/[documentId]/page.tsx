import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"
import { extractAuthorities, groupAuthorities } from "@/lib/legal/authorities"
import { createSignedUrl } from "@/lib/storage/documents"

export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(d)
}

function fmtBytes(n: number | null) {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function mimeLabel(m: string | null) {
  if (!m) return "—"
  if (m === "application/pdf") return "PDF"
  if (m.includes("wordprocessingml")) return "DOCX"
  if (m === "text/plain") return "TXT"
  return m.split("/")[1]?.toUpperCase() ?? "—"
}

function MetaField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">{label}</p>
      <p className="mt-0.5 text-sm text-white/68">{value}</p>
    </div>
  )
}

export default async function DocumentViewerPage({
  params,
}: {
  params: { matterId: string; documentId: string }
}) {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type DocDetail = {
    id: string
    fileName: string
    storagePath: string | null
    mimeType: string | null
    fileSize: number | null
    uploadStatus: string
    indexingStatus: string
    retrievalStatus: string
    parseStatus: string
    parsedText: string | null
    pageCount: number | null
    chunkCount: number
    extractionConf: number | null
    uploadedAt: Date
    createdAt: Date
    matterId: string
    matter: { title: string; clientName: string | null }
    _count: { chunks: number }
  }

  let doc: DocDetail | null = null
  let signedUrl: string | null = null

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      doc = await prisma.document.findFirst({
        where: {
          id: params.documentId,
          matterId: params.matterId,
          matter: { userId: user.id },
        },
        select: {
          id: true,
          fileName: true,
          storagePath: true,
          mimeType: true,
          fileSize: true,
          uploadStatus: true,
          indexingStatus: true,
          retrievalStatus: true,
          parseStatus: true,
          parsedText: true,
          pageCount: true,
          chunkCount: true,
          extractionConf: true,
          uploadedAt: true,
          createdAt: true,
          matterId: true,
          matter: { select: { title: true, clientName: true } },
          _count: { select: { chunks: true } },
        },
      })

      if (doc?.storagePath) {
        const { data } = await createSignedUrl(doc.storagePath, 3600)
        signedUrl = data?.signedUrl ?? null
      }
    }
  } catch {
    /* DB/storage unavailable */
  }

  if (!doc) notFound()

  // Extract authorities from parsed text
  const authorities = doc.parsedText
    ? groupAuthorities(extractAuthorities(doc.parsedText))
    : null
  const hasAuthorities = authorities
    ? Object.values(authorities).some((a) => a.length > 0)
    : false

  const textPreview = doc.parsedText
    ? doc.parsedText.slice(0, 1200).trimEnd() +
      (doc.parsedText.length > 1200 ? "…" : "")
    : null

  const timeline = [
    { label: "Document ingested",       note: fmtDate(doc.uploadedAt),    done: true },
    { label: "Parse stage",             note: doc.parseStatus,             done: doc.parseStatus === "parsed" },
    { label: "Chunking stage",          note: doc._count.chunks > 0 ? `${doc._count.chunks} chunks` : "Pending", done: doc._count.chunks > 0 },
    { label: "Embedding stage",         note: doc.indexingStatus,          done: doc.indexingStatus === "retrieval-ready" },
    { label: "Retrieval ready",         note: doc.retrievalStatus === "ready" ? "Active" : "Pending", done: doc.retrievalStatus === "ready" },
  ]

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {doc.matter.title}
              {doc.matter.clientName ? ` · ${doc.matter.clientName}` : ""}
            </p>
            <h1 className="mt-1 break-all font-serif text-xl tracking-tight text-white/[0.96] md:text-2xl">
              {doc.fileName}
            </h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <DocumentStatusPill status={doc.indexingStatus} />
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-white/32 underline-offset-2 transition-colors hover:text-white/58 hover:underline"
              >
                Download ↗
              </a>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/[0.05] pt-5">
          <MetaField label="Format"     value={mimeLabel(doc.mimeType)} />
          <MetaField label="File size"  value={fmtBytes(doc.fileSize)} />
          <MetaField label="Pages"      value={doc.pageCount ? String(doc.pageCount) : null} />
          <MetaField label="Chunks"     value={doc._count.chunks > 0 ? String(doc._count.chunks) : null} />
          <MetaField label="Confidence" value={doc.extractionConf != null ? `${Math.round(doc.extractionConf * 100)}%` : null} />
          <MetaField label="Ingested"   value={fmtDate(doc.uploadedAt)} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">

        {/* Ingestion timeline */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Ingestion timeline
          </p>
          <div className="mt-5">
            {timeline.map((ev, i) => (
              <div key={ev.label} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`mt-[3px] h-2 w-2 shrink-0 rounded-full border ${ev.done ? "border-white/35 bg-white/35" : "border-white/[0.1] bg-transparent"}`} />
                  {i < timeline.length - 1 && (
                    <div className="my-1 w-px flex-1 bg-white/[0.06]" style={{ minHeight: 22 }} />
                  )}
                </div>
                <div className="pb-4 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className={`text-[13px] ${ev.done ? "text-white/65" : "text-white/30"}`}>{ev.label}</p>
                    <p className={`text-xs ${ev.done ? "text-white/30" : "text-white/18"}`}>{ev.note}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System status */}
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Intelligence status
          </p>
          <div className="mt-5 space-y-0 divide-y divide-white/[0.04]">
            {[
              { label: "Upload status",    value: doc.uploadStatus },
              { label: "Parse status",     value: doc.parseStatus },
              { label: "Indexing status",  value: doc.indexingStatus },
              { label: "Retrieval status", value: doc.retrievalStatus },
              { label: "Chunk count",      value: doc._count.chunks > 0 ? String(doc._count.chunks) : "0" },
              { label: "Clause intelligence", value: doc.retrievalStatus === "ready" ? "Active" : "Pending" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2.5">
                <p className="text-xs text-white/40">{s.label}</p>
                <DocumentStatusPill status={s.value} className="text-[9px]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Authority analysis */}
      {hasAuthorities && authorities && (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <p className="mb-5 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Detected authorities
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Cases",                items: authorities.cases },
              { label: "Legislation",          items: authorities.statutes },
              { label: "CPR",                  items: authorities.cpr },
              { label: "Practice directions",  items: authorities.practiceDirs },
              { label: "Statutory instruments",items: authorities.statutory },
            ]
              .filter((g) => g.items.length > 0)
              .map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-white/30">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((a) => (
                      <p key={a.normalized} className="text-xs text-white/58">
                        {a.normalized}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Parsed text preview */}
      {textPreview && (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Extracted text preview
          </p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/45">
            {textPreview}
          </pre>
        </div>
      )}

      {/* Back link */}
      <div className="pt-2">
        <Link
          href={`/app/matters/${doc.matterId}`}
          className="text-[11px] text-white/28 transition-colors hover:text-white/52"
        >
          ← Back to matter workspace
        </Link>
      </div>

    </div>
  )
}
