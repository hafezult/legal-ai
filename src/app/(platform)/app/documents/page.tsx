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

type DocumentRow = {
  id: string
  matterId: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  indexingStatus: string
  retrievalStatus: string
  uploadedAt: Date
  matter: { title: string; clientName: string | null }
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
        take: 100,
        select: {
          id: true,
          matterId: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          indexingStatus: true,
          retrievalStatus: true,
          uploadedAt: true,
          matter: { select: { title: true, clientName: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Document intelligence
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Source registry
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Cross-matter inventory of uploaded sources, indexing state, and retrieval
            readiness. Open any document to inspect chunks, citations, and research traces.
          </p>
        </div>
        <Link
          href="/app/matters"
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Matter registry
        </Link>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-20 text-center">
          <p className="font-serif text-xl text-white/50">No sources ingested</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/28">
            Upload documents from a matter workspace to activate parsing, chunking,
            embeddings, and document workstations.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
          >
            Choose a matter
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
            <span className="hidden w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Retrieval
            </span>
            <span className="hidden w-32 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
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
                <p className="mt-0.5 truncate text-xs text-white/28 md:hidden">
                  {doc.matter.title}
                </p>
              </div>
              <div className="hidden w-44 shrink-0 md:block">
                <p className="truncate text-sm text-white/48">{doc.matter.title}</p>
                {doc.matter.clientName && (
                  <p className="mt-0.5 truncate text-xs text-white/24">{doc.matter.clientName}</p>
                )}
              </div>
              <span className="hidden w-14 shrink-0 text-xs text-white/38 sm:block">
                {mimeLabel(doc.mimeType)}
              </span>
              <span className="hidden w-20 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {fmtBytes(doc.fileSize)}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-24 shrink-0 lg:block">
                <DocumentStatusPill status={doc.retrievalStatus} />
              </div>
              <span className="hidden w-32 shrink-0 text-right text-xs text-white/25 xl:block">
                {fmtDate(doc.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
