import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function mimeLabel(mime: string | null) {
  if (!mime) return "Source"
  if (mime === "application/pdf") return "PDF"
  if (mime.includes("wordprocessingml")) return "DOCX"
  if (mime === "text/plain") return "TXT"
  return mime.split("/")[1]?.toUpperCase() ?? "Source"
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let documents: {
    id: string
    fileName: string
    mimeType: string | null
    fileSize: number | null
    uploadedAt: Date
    indexingStatus: string
    retrievalStatus: string
    chunkCount: number
    matter: { id: string; title: string }
  }[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: { userId: user.id } },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          uploadedAt: true,
          indexingStatus: true,
          retrievalStatus: true,
          chunkCount: true,
          matter: { select: { id: true, title: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Document intelligence
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Source registry
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          A matter-scoped view of every uploaded source, indexing state, and
          retrieval readiness signal across the workspace.
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No documents uploaded</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/28">
            Upload documents from a matter workspace to preserve privilege boundaries
            and activate document intelligence.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Open matters
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-5 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Document
            </span>
            <span className="hidden w-40 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Type
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Size
            </span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Indexing
            </span>
            <span className="hidden w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Retrieval
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Uploaded
            </span>
          </div>

          {documents.map((document) => (
            <Link
              key={document.id}
              href={`/app/matters/${document.matter.id}/documents/${document.id}`}
              className="group flex items-center gap-5 border-t border-white/[0.04] px-5 py-4 transition-colors first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/78 transition-colors group-hover:text-white/92">
                  {document.fileName}
                </p>
                <p className="mt-0.5 text-xs text-white/28">
                  {document.chunkCount} chunk{document.chunkCount !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="hidden w-40 shrink-0 truncate text-sm text-white/42 md:block">
                {document.matter.title}
              </span>
              <span className="hidden w-16 shrink-0 text-xs text-white/38 sm:block">
                {mimeLabel(document.mimeType)}
              </span>
              <span className="hidden w-16 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {formatBytes(document.fileSize)}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={document.indexingStatus} />
              </div>
              <div className="hidden w-24 shrink-0 lg:block">
                <DocumentStatusPill status={document.retrievalStatus} />
              </div>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/28 lg:block">
                {formatDate(document.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
