import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

const pipelineSteps = [
  { key: "pending", label: "Queued", note: "Document registered and awaiting parsing." },
  { key: "parsing", label: "Parsing", note: "Text extraction is running." },
  { key: "chunking", label: "Chunking", note: "Matter-aware chunks are being persisted." },
  { key: "embedding", label: "Embedding", note: "Semantic vectors are being generated." },
  { key: "retrieval-ready", label: "Ready", note: "Document is available to research." },
  { key: "failed", label: "Failed", note: "Operator review or re-indexing is required." },
] as const

export default async function WorkflowsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type WorkflowDocument = {
    id: string
    fileName: string
    indexingStatus: string
    retrievalStatus: string
    updatedAt: Date
    matter: {
      id: string
      title: string
    }
  }

  let documents: WorkflowDocument[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: { userId: user.id } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          fileName: true,
          indexingStatus: true,
          retrievalStatus: true,
          updatedAt: true,
          matter: { select: { id: true, title: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const counts = new Map<string, number>()
  for (const doc of documents) {
    const key = doc.retrievalStatus === "ready" ? "retrieval-ready" : doc.indexingStatus
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const activeCount = documents.filter((doc) =>
    ["pending", "parsing", "chunking", "embedding"].includes(doc.indexingStatus)
  ).length
  const failedCount = counts.get("failed") ?? 0

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Workflow control
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Ingestion pipeline
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Monitor document parsing, chunking, embedding, and retrieval readiness
            across the legal intelligence workspace.
          </p>
        </div>
        <Link
          href="/app/documents"
          className="mt-1 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Source registry
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active jobs", value: activeCount },
          { label: "Completed", value: counts.get("retrieval-ready") ?? 0 },
          { label: "Needs review", value: failedCount },
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pipelineSteps.map((step) => (
          <div
            key={step.key}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/25 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/36">
                {step.label}
              </p>
              <span className="font-light text-2xl tabular-nums text-white/78">
                {counts.get(step.key) ?? 0}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/28">{step.note}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
            Recent workflow events
          </p>
          <span className="text-[11px] text-white/25">{documents.length} tracked</span>
        </div>

        {documents.length === 0 ? (
          <div className="mt-6 rounded-lg border border-white/[0.05] bg-black/20 p-5">
            <p className="font-serif text-base text-white/50">No ingestion runs yet</p>
            <p className="mt-2 text-sm leading-relaxed text-white/28">
              Upload sources from a matter workspace to initialize the indexing
              workflow.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.05]">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/app/matters/${doc.matter.id}/documents/${doc.id}`}
                className="flex items-center gap-4 border-t border-white/[0.04] px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/72">{doc.fileName}</p>
                  <p className="mt-0.5 truncate text-xs text-white/28">
                    {doc.matter.title}
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <DocumentStatusPill
                    status={doc.retrievalStatus === "ready" ? "retrieval-ready" : doc.indexingStatus}
                  />
                </div>
                <span className="hidden w-28 shrink-0 text-right text-xs text-white/25 sm:block">
                  {fmtDate(doc.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
