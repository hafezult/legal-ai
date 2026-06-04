import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function workflowLabel(status: string) {
  if (status === "retrieval-ready") return "Retrieval ready"
  return status.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

export default async function WorkflowsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let documents: {
    id: string
    fileName: string
    indexingStatus: string
    retrievalStatus: string
    uploadedAt: Date
    matter: { id: string; title: string }
  }[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      documents = await prisma.document.findMany({
        where: { matter: { userId: user.id } },
        orderBy: [{ indexingStatus: "asc" }, { uploadedAt: "desc" }],
        take: 12,
        select: {
          id: true,
          fileName: true,
          indexingStatus: true,
          retrievalStatus: true,
          uploadedAt: true,
          matter: { select: { id: true, title: true } },
        },
      })
    }
  } catch {
    /* DB unavailable */
  }

  const inProgress = documents.filter((doc) =>
    ["pending", "parsing", "chunking", "embedding"].includes(doc.indexingStatus)
  )
  const ready = documents.filter((doc) => doc.retrievalStatus === "ready")
  const failed = documents.filter((doc) => doc.indexingStatus === "failed")

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Orchestration
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Workflow monitor
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Track the document ingestion pipeline from upload through parsing,
          embedding, and retrieval readiness.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "In progress", value: inProgress.length },
          { label: "Retrieval ready", value: ready.length },
          { label: "Needs attention", value: failed.length },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
              {item.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {documents.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No ingestion workflows</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/28">
            Upload a document from a matter workspace to create an indexing workflow.
          </p>
          <Link
            href="/app/matters"
            className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Open matters
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <Link
              key={document.id}
              href={`/app/matters/${document.matter.id}/documents/${document.id}`}
              className="flex flex-wrap items-center gap-4 rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] px-5 py-4 transition-colors hover:bg-white/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/72">{document.fileName}</p>
                <p className="mt-0.5 truncate text-xs text-white/28">
                  {document.matter.title} · {workflowLabel(document.indexingStatus)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <DocumentStatusPill status={document.indexingStatus} />
                <DocumentStatusPill status={document.retrievalStatus} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
