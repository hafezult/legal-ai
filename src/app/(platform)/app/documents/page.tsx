import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentRetryButton } from "@/components/documents/document-retry-button"
import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import {
  canWriteListedMatter,
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  roleHasPermission,
} from "@/lib/auth/rbac"
import {
  documentNeedsRetry,
  isDocumentRetrievalReady,
} from "@/lib/documents/status"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

type DocumentRow = {
  id: string
  fileName: string
  mimeType: string | null
  fileSize: number | null
  indexingStatus: string
  retrievalStatus: string
  chunkCount: number
  uploadedAt: Date
  updatedAt: Date
  canWrite: boolean
  matter: {
    id: string
    title: string
  }
}

export default async function DocumentsPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let documents: DocumentRow[] = []
  let canWrite = false

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      const orgCanWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true
      canWrite = orgCanWrite
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)
      const rows = await prisma.document.findMany({
        where: { matter: matterWhere },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          indexingStatus: true,
          retrievalStatus: true,
          chunkCount: true,
          uploadedAt: true,
          updatedAt: true,
          matter: {
            select: {
              id: true,
              title: true,
              userId: true,
              organizationId: true,
            },
          },
        },
      })
      documents = rows.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        indexingStatus: doc.indexingStatus,
        retrievalStatus: doc.retrievalStatus,
        chunkCount: doc.chunkCount,
        uploadedAt: doc.uploadedAt,
        updatedAt: doc.updatedAt,
        canWrite: canWriteListedMatter(doc.matter, user.id, orgCanWrite),
        matter: {
          id: doc.matter.id,
          title: doc.matter.title,
        },
      }))
      canWrite = orgCanWrite || documents.some((doc) => doc.canWrite)
    }
  } catch {
    /* DB unavailable */
  }

  const indexedCount = documents.filter((doc) =>
    ["indexed", "retrieval-ready"].includes(doc.indexingStatus)
  ).length
  const retrievalReadyCount = documents.filter(isDocumentRetrievalReady).length
  const failedCount = documents.filter((doc) => documentNeedsRetry(doc)).length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Document intelligence
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Documents
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Cross-matter source registry with ingestion, indexing, and retrieval readiness.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
          {[
            { label: "Sources", value: documents.length },
            { label: "Indexed", value: indexedCount },
            { label: "Retrieval", value: retrievalReadyCount },
            { label: "Failed", value: failedCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                {stat.label}
              </p>
              <p className="mt-1 font-light text-2xl tabular-nums text-white/82">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No documents uploaded</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            Upload sources from a matter workspace to initialize document intelligence.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Open matter registry
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Source
            </span>
            <span className="hidden w-44 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="hidden w-14 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
              Type
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Size
            </span>
            <span className="hidden w-16 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Chunks
            </span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Indexing
            </span>
            <span className="hidden w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
              Retrieval
            </span>
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Action
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
              Uploaded
            </span>
          </div>

          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
            >
              <Link
                href={`/app/matters/${doc.matter.id}/documents/${doc.id}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-[13px] text-white/75 transition-colors group-hover:text-white/92">
                  {doc.fileName}
                </p>
              </Link>
              <span className="hidden w-44 shrink-0 truncate text-xs text-white/38 md:block">
                {doc.matter.title}
              </span>
              <span className="hidden w-14 shrink-0 text-xs text-white/38 sm:block">
                {mimeLabel(doc.mimeType)}
              </span>
              <span className="hidden w-16 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {fmtBytes(doc.fileSize)}
              </span>
              <span className="hidden w-16 shrink-0 text-xs tabular-nums text-white/38 lg:block">
                {doc.chunkCount}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-24 shrink-0 xl:block">
                <DocumentStatusPill status={doc.retrievalStatus} />
              </div>
              <div className="w-20 shrink-0">
                {doc.canWrite && documentNeedsRetry(doc) ? (
                  <DocumentRetryButton
                    matterId={doc.matter.id}
                    documentId={doc.id}
                  />
                ) : (
                  <Link
                    href={`/app/matters/${doc.matter.id}/documents/${doc.id}`}
                    className="text-[10px] uppercase tracking-[0.12em] text-white/28 transition-colors hover:text-white/55"
                  >
                    Open
                  </Link>
                )}
              </div>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/25 xl:block">
                {fmtShortDate(doc.uploadedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
