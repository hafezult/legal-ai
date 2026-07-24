import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { matterAccessWhere } from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type WorkflowDocument = {
  id: string
  fileName: string
  indexingStatus: string
  retrievalStatus: string
  uploadedAt: Date
  matter: {
    id: string
    title: string
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

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: matterAccessWhere(user.id) },
        orderBy: { uploadedAt: "desc" },
        take: 12,
        select: {
          id: true,
          fileName: true,
          indexingStatus: true,
          retrievalStatus: true,
          uploadedAt: true,
          matter: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const statusCounts = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.indexingStatus] = (acc[doc.indexingStatus] ?? 0) + 1
    return acc
  }, {})
  const activeCount =
    (statusCounts.pending ?? 0) +
    (statusCounts.parsing ?? 0) +
    (statusCounts.chunking ?? 0) +
    (statusCounts.embedding ?? 0)
  const readyCount = documents.filter(
    (doc) => doc.retrievalStatus === "ready" || doc.indexingStatus === "retrieval-ready"
  ).length
  const failedCount = statusCounts.failed ?? 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Operations
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Workflows
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Monitor source ingestion as documents move through parsing, chunking,
            embedding, and retrieval readiness.
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
          { label: "Tracked sources", value: documents.length },
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
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {["pending", "parsing", "chunking", "embedding", "indexed", "retrieval-ready"].map(
            (status) => (
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
            )
          )}
        </div>
      </div>

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
            <span className="hidden w-28 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 xl:block">
              Uploaded
            </span>
          </div>

          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/app/matters/${doc.matter.id}/documents/${doc.id}`}
              className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white/75 transition-colors group-hover:text-white/92">
                  {doc.fileName}
                </p>
              </div>
              <span className="hidden w-44 shrink-0 truncate text-xs text-white/38 md:block">
                {doc.matter.title}
              </span>
              <div className="w-24 shrink-0">
                <DocumentStatusPill status={doc.indexingStatus} />
              </div>
              <div className="hidden w-24 shrink-0 lg:block">
                <DocumentStatusPill status={doc.retrievalStatus} />
              </div>
              <span className="hidden w-28 shrink-0 text-right text-xs text-white/25 xl:block">
                {fmtShortDate(doc.uploadedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
