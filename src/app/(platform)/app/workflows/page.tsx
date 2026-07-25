import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import type { Prisma } from "@prisma/client"

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
  documentRetryOr,
  RETRYABLE_IN_PROGRESS_STATUSES,
  STALE_INDEXING_MS,
} from "@/lib/documents/status"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type WorkflowDocument = {
  id: string
  fileName: string
  indexingStatus: string
  retrievalStatus: string
  uploadedAt: Date
  updatedAt: Date
  canWrite: boolean
  matter: {
    id: string
    title: string
  }
}

const PIPELINE_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "indexed",
  "retrieval-ready",
  "failed",
] as const

function failedDocumentWhere(
  documentWhere: Prisma.DocumentWhereInput,
  staleBefore: Date
): Prisma.DocumentWhereInput {
  return {
    ...documentWhere,
    OR: documentRetryOr(staleBefore),
  }
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export default async function WorkflowsPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let documents: WorkflowDocument[] = []
  let canWrite = false
  let trackedCount = 0
  let readyCount = 0
  let failedCount = 0
  let activeCount = 0
  let statusCounts: Record<string, number> = {}
  let failedDocuments: WorkflowDocument[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      const orgCanWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : true
      canWrite = orgCanWrite
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)
      const documentWhere = { matter: matterWhere }
      const staleBefore = new Date(Date.now() - STALE_INDEXING_MS)
      const retryWhere = failedDocumentWhere(documentWhere, staleBefore)

      const [rows, failedRows, total, ready, failed, active, statusGroups] =
        await Promise.all([
          prisma.document.findMany({
            where: documentWhere,
            orderBy: { uploadedAt: "desc" },
            take: 40,
            select: {
              id: true,
              fileName: true,
              indexingStatus: true,
              retrievalStatus: true,
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
          }),
          prisma.document.findMany({
            where: retryWhere,
            orderBy: { updatedAt: "desc" },
            take: 40,
            select: {
              id: true,
              fileName: true,
              indexingStatus: true,
              retrievalStatus: true,
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
          }),
          prisma.document.count({ where: documentWhere }),
          prisma.document.count({
            where: {
              ...documentWhere,
              retrievalStatus: "ready",
              indexingStatus: "retrieval-ready",
            },
          }),
          prisma.document.count({ where: retryWhere }),
          // Fresh in-progress only — stale claims are counted under Failed.
          prisma.document.count({
            where: {
              ...documentWhere,
              indexingStatus: { in: [...RETRYABLE_IN_PROGRESS_STATUSES] },
              updatedAt: { gte: staleBefore },
            },
          }),
          prisma.document.groupBy({
            by: ["indexingStatus"],
            where: documentWhere,
            _count: { _all: true },
          }),
        ])

      trackedCount = total
      readyCount = ready
      failedCount = failed
      activeCount = active
      statusCounts = Object.fromEntries(
        statusGroups.map((row) => [row.indexingStatus, row._count._all])
      )

      const toWorkflowDoc = (
        doc: (typeof rows)[number]
      ): WorkflowDocument => ({
        id: doc.id,
        fileName: doc.fileName,
        indexingStatus: doc.indexingStatus,
        retrievalStatus: doc.retrievalStatus,
        uploadedAt: doc.uploadedAt,
        updatedAt: doc.updatedAt,
        canWrite: canWriteListedMatter(doc.matter, user.id, orgCanWrite),
        matter: {
          id: doc.matter.id,
          title: doc.matter.title,
        },
      })

      documents = rows.map(toWorkflowDoc)
      failedDocuments = failedRows
        .map(toWorkflowDoc)
        .filter((doc) => documentNeedsRetry(doc))
      canWrite = orgCanWrite || documents.some((doc) => doc.canWrite)
    }
  } catch {
    /* DB unavailable */
  }

  const retriableFailed = failedDocuments.filter((doc) => doc.canWrite)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Operations
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Indexing workflows
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Document ingestion pipeline monitor — track parsing, chunking,
            embedding, and retrieval readiness, then retry failed sources.
          </p>
        </div>
        <Link
          href="/app/documents"
          className="mt-1 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Open documents
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Tracked sources", value: trackedCount },
          { label: "Active pipeline", value: activeCount },
          { label: "Retrieval-ready", value: readyCount },
          { label: "Failed", value: failedCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-card)] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/85">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Pipeline stages
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {PIPELINE_STATUSES.map((status) => (
              <div
                key={status}
                className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                  {status.replace(/-/g, " ")}
                </p>
                <p className="mt-1 font-light text-2xl tabular-nums text-white/75">
                  {statusCounts[status] ?? 0}
                </p>
              </div>
            ))}
        </div>
      </div>

      {retriableFailed.length > 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-amber-400/15 bg-amber-400/[0.03] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/55">
                Failed indexing / retrieval
              </p>
              <p className="mt-1.5 text-sm text-white/45">
                Retry ingestion for sources that failed parsing or embedding.
                {failedCount > retriableFailed.length
                  ? ` Showing the ${retriableFailed.length} most recently updated of ${failedCount}.`
                  : null}
              </p>
            </div>
            <span className="rounded-full border border-amber-400/20 px-2.5 py-0.5 text-[10px] text-amber-200/60">
              {failedCount} failed
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {retriableFailed.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/70">{doc.fileName}</p>
                  <p className="mt-0.5 text-xs text-white/30">{doc.matter.title}</p>
                </div>
                <DocumentRetryButton matterId={doc.matter.id} documentId={doc.id} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No workflow events yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            Upload documents from a matter workspace to start the indexing pipeline.
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
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Source
            </span>
            <span className="hidden w-44 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Matter
            </span>
            <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Indexing
            </span>
            <span className="hidden w-24 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Retrieval
            </span>
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Action
            </span>
            <span className="hidden w-28 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
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
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-24 shrink-0 lg:block">
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
              <span className="hidden w-28 shrink-0 text-right text-xs text-white/25 xl:block">
                {fmtShortDate(doc.uploadedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
