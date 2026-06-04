import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import { DocumentStatusPill } from "@/components/documents/document-status-pill"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type RecentDocument = {
  id: string
  matterId: string
  fileName: string
  indexingStatus: string
  retrievalStatus: string
  chunkCount: number
  uploadedAt: Date
  matter: {
    title: string
  }
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function PipelineCard({
  label,
  state,
  detail,
  active,
}: {
  label: string
  state: string
  detail: string
  active?: boolean
}) {
  return (
    <div className="rounded-[var(--aether-radius-card)] border border-white/[0.07] bg-black/25 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</p>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
            active
              ? "border-white/[0.16] bg-white/[0.05] text-white/70"
              : "border-white/[0.06] text-white/30"
          }`}
        >
          {state}
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/42">{detail}</p>
    </div>
  )
}

export default async function WorkflowsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let matterCount = 0
  let documentCount = 0
  let pendingDocuments = 0
  let activeIndexing = 0
  let readyDocuments = 0
  let researchSessions = 0
  let recentDocuments: RecentDocument[] = []

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      ;[
        matterCount,
        documentCount,
        pendingDocuments,
        activeIndexing,
        readyDocuments,
        researchSessions,
        recentDocuments,
      ] = await Promise.all([
        prisma.matter.count({ where: { userId: user.id } }),
        prisma.document.count({ where: { matter: { userId: user.id } } }),
        prisma.document.count({
          where: {
            matter: { userId: user.id },
            indexingStatus: { in: ["pending", "uploaded"] },
          },
        }),
        prisma.document.count({
          where: {
            matter: { userId: user.id },
            indexingStatus: { in: ["parsing", "chunking", "embedding", "indexing"] },
          },
        }),
        prisma.document.count({
          where: {
            matter: { userId: user.id },
            OR: [
              { indexingStatus: "retrieval-ready" },
              { retrievalStatus: { in: ["ready", "retrieval-ready"] } },
            ],
          },
        }),
        prisma.researchSession.count({ where: { userId: user.id } }),
        prisma.document.findMany({
          where: { matter: { userId: user.id } },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: {
            id: true,
            matterId: true,
            fileName: true,
            indexingStatus: true,
            retrievalStatus: true,
            chunkCount: true,
            uploadedAt: true,
            matter: { select: { title: true } },
          },
        }),
      ])
    }
  } catch {
    /* DB unavailable */
  }

  const ingestionActive = pendingDocuments > 0 || activeIndexing > 0
  const researchReady = readyDocuments > 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Orchestration
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Workflows
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Operational status for intake, document indexing, retrieval readiness, and
            research session creation across governed matters.
          </p>
        </div>
        <Link
          href="/app/matters/new"
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[13px] text-white/65 transition-colors duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/88"
        >
          Initialize workflow
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Matters", value: matterCount },
          { label: "Sources", value: documentCount },
          { label: "Active jobs", value: activeIndexing + pendingDocuments },
          { label: "Research sessions", value: researchSessions },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {stat.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.9]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PipelineCard
          label="Matter intake"
          state={matterCount > 0 ? "Live" : "Idle"}
          active={matterCount > 0}
          detail={
            matterCount > 0
              ? `${matterCount} governed matter workspace${matterCount !== 1 ? "s" : ""} provisioned.`
              : "Create a matter to establish the privilege boundary for downstream workflows."
          }
        />
        <PipelineCard
          label="Source ingestion"
          state={ingestionActive ? "Running" : documentCount > 0 ? "Ready" : "Idle"}
          active={documentCount > 0}
          detail={
            ingestionActive
              ? `${activeIndexing + pendingDocuments} document job${activeIndexing + pendingDocuments !== 1 ? "s" : ""} awaiting completion.`
              : documentCount > 0
                ? "All visible source jobs are registered; inspect documents for detailed status."
                : "Upload sources from a matter workspace to start parsing and chunking."
          }
        />
        <PipelineCard
          label="Research retrieval"
          state={researchReady ? "Available" : "Awaiting index"}
          active={researchReady}
          detail={
            researchReady
              ? `${readyDocuments} source${readyDocuments !== 1 ? "s" : ""} available for retrieval-grounded research.`
              : "Retrieval activates once at least one document completes indexing with embeddings."
          }
        />
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Recent workflow events
            </p>
            <p className="mt-1 text-sm text-white/35">
              Latest document jobs moving through the ingestion pipeline.
            </p>
          </div>
          <Link
            href="/app/documents"
            className="text-[11px] text-white/32 transition-colors hover:text-white/58"
          >
            View all documents
          </Link>
        </div>

        {recentDocuments.length === 0 ? (
          <div className="mt-8 rounded-lg border border-white/[0.05] bg-black/20 px-5 py-8 text-center">
            <p className="font-serif text-base text-white/42">No workflow events yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/25">
              Ingestion, indexing, and retrieval activity will appear here as documents
              are uploaded to matters.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {recentDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/app/matters/${doc.matterId}/documents/${doc.id}`}
                className="flex items-center gap-4 rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3 transition-colors hover:bg-white/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/70">{doc.fileName}</p>
                  <p className="mt-0.5 truncate text-xs text-white/28">
                    {doc.matter.title} · {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""} · {fmtDate(doc.uploadedAt)}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <DocumentStatusPill status={doc.indexingStatus} />
                </div>
                <div className="hidden shrink-0 lg:block">
                  <DocumentStatusPill status={doc.retrievalStatus} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
