import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const pipelineStages = [
  { key: "pending", label: "Queued" },
  { key: "parsing", label: "Parsing" },
  { key: "chunking", label: "Chunking" },
  { key: "embedding", label: "Embedding" },
  { key: "indexed", label: "Indexed" },
  { key: "retrieval-ready", label: "Retrieval ready" },
  { key: "failed", label: "Failed" },
] as const

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default async function WorkflowsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type WorkflowDocument = {
    id: string
    fileName: string
    indexingStatus: string
    retrievalStatus: string
    parseStatus: string
    chunkCount: number
    updatedAt: Date
    matter: { id: string; title: string }
  }

  let documents: WorkflowDocument[] = []

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })

    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: { userId: user.id } },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          fileName: true,
          indexingStatus: true,
          retrievalStatus: true,
          parseStatus: true,
          chunkCount: true,
          updatedAt: true,
          matter: { select: { id: true, title: true } },
        },
      })
    }
  } catch {
    /* Database unavailable */
  }

  const stageCounts = new Map<string, number>()
  for (const document of documents) {
    stageCounts.set(
      document.indexingStatus,
      (stageCounts.get(document.indexingStatus) ?? 0) + 1
    )
  }

  const activeCount = documents.filter((document) =>
    ["pending", "parsing", "chunking", "embedding"].includes(document.indexingStatus)
  ).length
  const readyCount = stageCounts.get("retrieval-ready") ?? 0
  const failedCount = stageCounts.get("failed") ?? 0

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Orchestration
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Indexing workflows
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
          Monitor document parsing, chunking, embedding, and retrieval readiness across
          every matter workspace.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active queue", value: String(activeCount) },
          { label: "Retrieval ready", value: String(readyCount) },
          { label: "Needs attention", value: String(failedCount) },
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

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Pipeline stages
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {pipelineStages.map((stage) => (
              <div
                key={stage.key}
                className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.015] px-4 py-3"
              >
                <p className="text-sm text-white/55">{stage.label}</p>
                <p className="font-light tabular-nums text-xl text-white/82">
                  {stageCounts.get(stage.key) ?? 0}
                </p>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Runtime readiness
          </p>
          <div className="mt-5 space-y-3">
            {[
              {
                label: "Database",
                status: "Configured",
                active: true,
              },
              {
                label: "Embeddings",
                status: isEmbeddingConfigured() ? "Configured" : "Missing OpenAI key",
                active: isEmbeddingConfigured(),
              },
              {
                label: "Index trigger",
                status: process.env.INDEXING_SECRET ? "Secured" : "Local mode",
                active: true,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 border-t border-white/[0.05] py-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm text-white/42">{item.label}</p>
                <span
                  className={`text-[10px] uppercase tracking-[0.12em] ${
                    item.active ? "text-white/62" : "text-amber-400/62"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Recent workflow events
          </p>
          <Link
            href="/app/documents"
            className="text-[11px] text-white/30 transition-colors hover:text-white/58"
          >
            View documents
          </Link>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-lg text-white/48">No workflows yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/25">
              Upload documents from a matter workspace to initialize the indexing
              pipeline.
            </p>
          </div>
        ) : (
          <div>
            {documents.map((document) => (
              <Link
                key={document.id}
                href={`/app/matters/${document.matter.id}/documents/${document.id}`}
                className="flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors first:border-t-0 hover:bg-white/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/72">{document.fileName}</p>
                  <p className="mt-0.5 text-xs text-white/28">
                    {document.matter.title} · parse {document.parseStatus} ·{" "}
                    {document.chunkCount} chunks
                  </p>
                </div>
                <div className="w-32 shrink-0">
                  <DocumentStatusPill status={document.indexingStatus} />
                </div>
                <p className="hidden w-28 shrink-0 text-right text-xs text-white/25 sm:block">
                  {fmtDate(document.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
