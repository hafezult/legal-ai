import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import {
  getActiveOrganization,
  matterAccessWhereForActiveOrg,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { isDocumentRetrievalReady } from "@/lib/documents/status"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type MemoryMatter = {
  id: string
  title: string
  clientName: string | null
  updatedAt: Date
  documents: {
    indexingStatus: string
    retrievalStatus: string
  }[]
  conversations: {
    _count: { messages: number }
  }[]
  _count: {
    chunks: number
    researchSessions: number
    conversations: number
    draftDocuments: number
  }
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

export default async function MemoryPage() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  let matters: MemoryMatter[] = []
  let canWrite = false
  let messageCount = 0

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (user) {
      const activeOrg = await getActiveOrganization(user.id)
      canWrite = activeOrg ? roleHasPermission(activeOrg.role, "write") : true
      const matterWhere = matterAccessWhereForActiveOrg(user.id, activeOrg?.id)
      const [matterRows, messageTotal] = await Promise.all([
        prisma.matter.findMany({
          where: matterWhere,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            clientName: true,
            updatedAt: true,
            documents: {
              select: {
                indexingStatus: true,
                retrievalStatus: true,
              },
            },
            conversations: {
              select: {
                _count: { select: { messages: true } },
              },
            },
            _count: {
              select: {
                chunks: true,
                researchSessions: true,
                conversations: true,
                draftDocuments: true,
              },
            },
          },
        }),
        // Aggregate once for the summary strip — avoids a second pass over the
        // conversation-graph payload when only the workspace total is needed.
        prisma.conversationMessage.count({
          where: { conversation: { matter: matterWhere } },
        }),
      ])
      matters = matterRows
      messageCount = messageTotal
    }
  } catch {
    /* DB unavailable */
  }

  const documentCount = matters.reduce((sum, matter) => sum + matter.documents.length, 0)
  const chunkCount = matters.reduce((sum, matter) => sum + matter._count.chunks, 0)
  const researchSessionCount = matters.reduce(
    (sum, matter) => sum + matter._count.researchSessions,
    0
  )
  const conversationCount = matters.reduce(
    (sum, matter) => sum + matter._count.conversations,
    0
  )
  const draftCount = matters.reduce(
    (sum, matter) => sum + matter._count.draftDocuments,
    0
  )
  const retrievalReadyCount = matters.reduce(
    (sum, matter) =>
      sum +
      matter.documents.filter(
        (doc) => isDocumentRetrievalReady(doc)
      ).length,
    0
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Knowledge base
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Matter memory
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Registry of matter-scoped sources, retrieval chunks, research history,
          and grounded drafts for the active organization — open a matter to
          search and work with that knowledge.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "Matters", value: matters.length },
          { label: "Sources", value: documentCount },
          { label: "Chunks", value: chunkCount },
          { label: "Research sessions", value: researchSessionCount },
          { label: "Drafts", value: draftCount },
          { label: "Conversations", value: conversationCount },
          { label: "Messages", value: messageCount },
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

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
              Retrieval coverage
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/40">
              {retrievalReadyCount} of {documentCount} source
              {documentCount === 1 ? "" : "s"} are retrieval-ready for grounded research.
            </p>
          </div>
          <Link
            href="/app/documents"
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Review sources
          </Link>
        </div>
      </div>

      {matters.length === 0 ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-8 py-16 text-center">
          <p className="font-serif text-lg text-white/45">No matter memory yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
            {canWrite
              ? "Create a matter and ingest source documents to build the memory index."
              : "Your organization role is read-only. Ask an admin to create a matter or grant write access."}
          </p>
          {canWrite ? (
            <Link
              href="/app/matters/new"
              className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
            >
              Initialize matter
            </Link>
          ) : (
            <Link
              href="/app/matters"
              className="mt-8 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
            >
              Browse matters
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
          <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
              Matter
            </span>
            <span className="hidden w-36 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32 md:block">
              Client
            </span>
            <span className="w-20 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32">
              Sources
            </span>
            <span className="w-20 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32">
              Chunks
            </span>
            <span className="hidden w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 lg:block">
              Updated
            </span>
          </div>

          {matters.map((matter) => (
            <Link
              key={matter.id}
              href={`/app/matters/${matter.id}`}
              className="group flex items-center gap-4 border-t border-white/[0.04] px-5 py-4 transition-colors duration-150 first:border-t-0 hover:bg-white/[0.025]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[15px] text-white/82 transition-colors group-hover:text-white/95">
                  {matter.title}
                </p>
                <p className="mt-0.5 text-xs text-white/28">
                  {matter._count.researchSessions} research session
                  {matter._count.researchSessions === 1 ? "" : "s"}
                  {" · "}
                  {matter._count.draftDocuments} draft
                  {matter._count.draftDocuments === 1 ? "" : "s"}
                  {" · "}
                  {matter._count.conversations} conversation
                  {matter._count.conversations === 1 ? "" : "s"}
                  {" · "}
                  {matter.conversations.reduce(
                    (sum, conversation) => sum + conversation._count.messages,
                    0
                  )}{" "}
                  message
                  {matter.conversations.reduce(
                    (sum, conversation) => sum + conversation._count.messages,
                    0
                  ) === 1
                    ? ""
                    : "s"}
                </p>
              </div>
              <span className="hidden w-36 shrink-0 truncate text-sm text-white/40 md:block">
                {matter.clientName ?? "-"}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-white/45">
                {matter.documents.length}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-white/45">
                {matter._count.chunks}
              </span>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/25 lg:block">
                {fmtShortDate(matter.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
