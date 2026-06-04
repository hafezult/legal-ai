import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DocumentRow = {
  id: string
  matterId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  indexingStatus: string
  retrievalStatus: string
  parseStatus: string
  chunkCount: number
  uploadedAt: Date
  matter: {
    title: string
    clientName: string | null
  }
}

function fmtBytes(n: number | null) {
  if (!n) return "-"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function mimeLabel(mime: string | null) {
  if (!mime) return "-"
  if (mime === "application/pdf") return "PDF"
  if (mime.includes("wordprocessingml")) return "DOCX"
  if (mime === "text/plain") return "TXT"
  return mime.split("/")[1]?.toUpperCase() ?? "-"
}

export default async function DocumentsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let documents: DocumentRow[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: { userId: user.id } },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          matterId: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          indexingStatus: true,
          retrievalStatus: true,
          parseStatus: true,
          chunkCount: true,
          uploadedAt: true,
          matter: {
            select: {
              title: true,
              clientName: true,
            },
          },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const indexedCount = documents.filter((doc) =>
    ["indexed", "retrieval-ready"].includes(doc.indexingStatus)
  ).length
  const retrievalReadyCount = documents.filter((doc) =>
    ["ready", "retrieval-ready"].includes(doc.retrievalStatus)
  ).length
  const totalChunks = documents.reduce((sum, doc) => sum + doc.chunkCount, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Source intelligence
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Documents
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            A matter-scoped registry for uploaded sources, parsing state, chunk lineage,
            and retrieval readiness across the workspace.
          </p>
        </div>
        <Link
          href="/app/matters"
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Upload from matter
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Sources", value: documents.length },
          { label: "Indexed", value: indexedCount },
          { label: "Retrieval ready", value: retrievalReadyCount },
          { label: "Chunks", value: totalChunks },
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

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No sources ingested</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/28">
            Upload PDF, DOCX, or TXT sources from a matter workspace to activate parsing,
            chunking, and retrieval status here.
          </p>
          <Link
            href="/app/matters"
            className="mt-7 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Open matter registry
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Document
            </span>
            <span className="hidden w-44 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="hidden w-14 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Type
            </span>
            <span className="hidden w-20 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Size
            </span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Index
            </span>
            <span className="hidden w-28 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
              Retrieval
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Uploaded
            </span>
          </div>

          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/app/matters/${doc.matterId}/documents/${doc.id}`}
              className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/78 transition-colors group-hover:text-white/95">
                  {doc.fileName}
                </p>
                <p className="mt-0.5 text-xs text-white/28">
                  {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""} · parse {doc.parseStatus}
                </p>
              </div>
              <div className="hidden w-44 shrink-0 md:block">
                <p className="truncate text-sm text-white/45">{doc.matter.title}</p>
                {doc.matter.clientName ? (
                  <p className="mt-0.5 truncate text-xs text-white/25">
                    {doc.matter.clientName}
                  </p>
                ) : null}
              </div>
              <span className="hidden w-14 shrink-0 text-xs text-white/36 sm:block">
                {mimeLabel(doc.mimeType)}
              </span>
              <span className="hidden w-20 shrink-0 text-xs tabular-nums text-white/36 lg:block">
                {fmtBytes(doc.fileSize)}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-28 shrink-0 xl:block">
                <DocumentStatusPill status={doc.retrievalStatus} />
              </div>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/25 lg:block">
                {fmtDate(doc.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
