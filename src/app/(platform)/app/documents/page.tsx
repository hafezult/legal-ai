import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function fmtBytes(bytes: number | null) {
  if (!bytes) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function mimeLabel(mime: string | null) {
  if (!mime) return "Source"
  if (mime === "application/pdf") return "PDF"
  if (mime.includes("wordprocessingml")) return "DOCX"
  if (mime === "text/plain") return "TXT"
  return mime.split("/")[1]?.toUpperCase() ?? "Source"
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

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })

    if (user) {
      documents = await prisma.document.findMany({
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
      })
    }
  } catch {
    /* Database unavailable */
  }

  const readyCount = documents.filter(
    (document) => document.indexingStatus === "retrieval-ready"
  ).length
  const failedCount = documents.filter(
    (document) => document.indexingStatus === "failed"
  ).length
  const chunkCount = documents.reduce((total, document) => total + document.chunkCount, 0)

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
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
            A cross-matter view of uploaded sources, indexing progress, and retrieval
            readiness.
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
          { label: "Sources", value: String(documents.length) },
          { label: "Retrieval ready", value: String(readyCount) },
          { label: "Failed", value: String(failedCount) },
          { label: "Chunks", value: String(chunkCount) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No documents uploaded</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/28">
            Upload sources inside a matter workspace to populate the registry and
            initialize retrieval-ready document intelligence.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Go to matters
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Source
            </span>
            <span className="hidden w-40 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Type
            </span>
            <span className="hidden w-20 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Size
            </span>
            <span className="w-28 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Index
            </span>
            <span className="hidden w-32 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Uploaded
            </span>
          </div>

          {documents.map((document) => (
            <Link
              key={document.id}
              href={`/app/matters/${document.matter.id}/documents/${document.id}`}
              className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[15px] text-white/82 transition-colors group-hover:text-white/95">
                  {document.fileName}
                </p>
                <p className="mt-0.5 text-xs text-white/28">
                  {document.chunkCount} chunk{document.chunkCount !== 1 ? "s" : ""} ·{" "}
                  {document.retrievalStatus}
                </p>
              </div>
              <span className="hidden w-40 shrink-0 truncate text-sm text-white/42 md:block">
                {document.matter.title}
                {document.matter.clientName ? (
                  <span className="block truncate text-xs text-white/25">
                    {document.matter.clientName}
                  </span>
                ) : null}
              </span>
              <span className="hidden w-16 shrink-0 text-xs text-white/38 sm:block">
                {mimeLabel(document.mimeType)}
              </span>
              <span className="hidden w-20 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {fmtBytes(document.fileSize)}
              </span>
              <div className="w-28 shrink-0">
                <DocumentStatusPill status={document.indexingStatus} />
              </div>
              <span className="hidden w-32 shrink-0 text-right text-xs text-white/25 lg:block">
                {fmtDate(document.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
