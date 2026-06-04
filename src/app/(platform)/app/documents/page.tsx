import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function fmtBytes(n: number | null) {
  if (!n) return "-"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
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

  type DocumentRow = {
    id: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
    indexingStatus: string
    retrievalStatus: string
    chunkCount: number
    uploadedAt: Date
    matter: {
      id: string
      title: string
      clientName: string | null
    }
  }

  let documents: DocumentRow[] = []
  let matterCount = 0
  let chunkCount = 0

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      ;[documents, matterCount, chunkCount] = await Promise.all([
        prisma.document.findMany({
          where: { matter: { userId: user.id } },
          orderBy: { uploadedAt: "desc" },
          take: 50,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            indexingStatus: true,
            retrievalStatus: true,
            chunkCount: true,
            uploadedAt: true,
            matter: {
              select: {
                id: true,
                title: true,
                clientName: true,
              },
            },
          },
        }),
        prisma.matter.count({ where: { userId: user.id } }),
        prisma.documentChunk.count({ where: { matter: { userId: user.id } } }),
      ])
    }
  } catch {
    /* DB unavailable */
  }

  const readyCount = documents.filter((doc) => doc.retrievalStatus === "ready").length
  const failedCount = documents.filter((doc) => doc.indexingStatus === "failed").length

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Document intelligence
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Source registry
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Cross-matter view of uploaded evidence, indexing status, retrieval
            readiness, and parsed knowledge assets.
          </p>
        </div>
        <Link
          href="/app/matters"
          className="mt-1 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Open matters
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Documents", value: documents.length },
          { label: "Retrieval ready", value: readyCount },
          { label: "Chunks indexed", value: chunkCount },
          { label: "Matters", value: matterCount },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.025] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {card.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.9]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No sources ingested</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/28">
            Documents are uploaded inside matter workspaces so privilege boundaries
            and client context stay attached to every retrieval trace.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Choose a matter
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-5 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Source
            </span>
            <span className="hidden w-40 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="hidden w-14 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Type
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Size
            </span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Indexing
            </span>
            <span className="hidden w-28 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Retrieval
            </span>
            <span className="hidden w-32 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
              Uploaded
            </span>
          </div>

          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/app/matters/${doc.matter.id}/documents/${doc.id}`}
              className="group flex items-center gap-5 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white/78 transition-colors group-hover:text-white/95">
                  {doc.fileName}
                </p>
                <p className="mt-0.5 text-xs text-white/28">
                  {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="hidden w-40 shrink-0 md:block">
                <p className="truncate text-sm text-white/45">{doc.matter.title}</p>
                <p className="truncate text-xs text-white/25">
                  {doc.matter.clientName ?? "No client"}
                </p>
              </div>
              <span className="hidden w-14 shrink-0 text-xs text-white/38 sm:block">
                {mimeLabel(doc.mimeType)}
              </span>
              <span className="hidden w-16 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {fmtBytes(doc.fileSize)}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-28 shrink-0 lg:block">
                <DocumentStatusPill status={doc.retrievalStatus} />
              </div>
              <span className="hidden w-32 shrink-0 text-right text-xs text-white/25 xl:block">
                {fmtDate(doc.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {failedCount > 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-red-400/[0.14] bg-red-400/[0.035] px-5 py-4">
          <p className="text-sm text-red-200/70">
            {failedCount} source{failedCount === 1 ? "" : "s"} need attention.
            Open the matter workspace to review ingestion details and retry indexing.
          </p>
        </div>
      ) : null}
    </div>
  )
}
