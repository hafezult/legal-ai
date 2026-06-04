import { auth } from "@clerk/nextjs/server"

import { PlatformFeaturePage } from "@/components/platform/platform-feature-page"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type MemoryStats = {
  matters: number
  chunks: number
  sessions: number
  documents: number
}

async function getMemoryStats(clerkId: string): Promise<MemoryStats> {
  const empty = { matters: 0, chunks: 0, sessions: 0, documents: 0 }

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return empty

    const matterScope = { userId: user.id }
    const [matters, chunks, sessions, documents] = await Promise.all([
      prisma.matter.count({ where: matterScope }),
      prisma.documentChunk.count({ where: { matter: matterScope } }),
      prisma.researchSession.count({ where: { userId: user.id } }),
      prisma.document.count({ where: { matter: matterScope } }),
    ])

    return { matters, chunks, sessions, documents }
  } catch {
    return empty
  }
}

export default async function MemoryPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  const stats = await getMemoryStats(clerkId)

  return (
    <PlatformFeaturePage
      eyebrow="Knowledge governance"
      title="Memory ledger"
      description="Monitor the durable context retained by the platform: matter metadata, indexed chunks, and research sessions that can support future review."
      primaryAction={{ href: "/app/research", label: "Open research" }}
      secondaryAction={{ href: "/app/documents", label: "Inspect sources" }}
      metrics={[
        { label: "Matter contexts", value: String(stats.matters), detail: "User-owned legal workspaces." },
        { label: "Indexed chunks", value: String(stats.chunks), detail: "Reviewable retrieval passages." },
        { label: "Research sessions", value: String(stats.sessions), detail: "Stored questions and source IDs." },
        { label: "Source documents", value: String(stats.documents), detail: "Files contributing memory." },
      ]}
      cards={[
        {
          title: "Matter memory",
          description: "Client, jurisdiction, practice area, risk, and scope fields form the durable context shared by documents and research.",
          meta: "Storage: Prisma matter model",
          status: "live",
        },
        {
          title: "Retrieval memory",
          description: "Document chunks preserve source text, order, page references, headings, and optional vector embeddings.",
          meta: "Storage: DocumentChunk records",
          status: "live",
        },
        {
          title: "Research memory",
          description: "Research sessions retain the query, answer, and chunk IDs so later review can reconstruct what informed the response.",
          meta: "Storage: ResearchSession records",
          status: "ready",
        },
        {
          title: "Retention controls",
          description: "Firm-level retention, deletion, and export rules can attach to the existing ownership model without changing route boundaries.",
          meta: "Policy layer: settings",
          status: "planned",
        },
      ]}
      sidebarTitle="Memory boundary"
      sidebarDescription="Memory is scoped to the authenticated user and matter ownership model already enforced by server routes."
      steps={[
        { label: "Identity resolved", detail: "Clerk user IDs map to internal user rows before any memory is read.", state: "complete" },
        { label: "Matter scope applied", detail: "Documents, chunks, and sessions are filtered through user-owned matters.", state: "complete" },
        { label: "Context reused", detail: "Research and workstations can surface retained chunks and session records.", state: "active" },
        { label: "Retention policy attached", detail: "Workspace settings can later define deletion, export, and audit schedules.", state: "pending" },
      ]}
    />
  )
}
