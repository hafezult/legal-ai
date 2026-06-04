import { auth } from "@clerk/nextjs/server"

import { PlatformFeaturePage } from "@/components/platform/platform-feature-page"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DocumentStats = {
  matters: number
  documents: number
  retrievalReady: number
  inProgress: number
}

async function getDocumentStats(clerkId: string): Promise<DocumentStats> {
  const empty = { matters: 0, documents: 0, retrievalReady: 0, inProgress: 0 }

  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return empty

    const documentScope = { matter: { userId: user.id } }
    const [matters, documents, retrievalReady, inProgress] = await Promise.all([
      prisma.matter.count({ where: { userId: user.id } }),
      prisma.document.count({ where: documentScope }),
      prisma.document.count({
        where: { ...documentScope, indexingStatus: "retrieval-ready" },
      }),
      prisma.document.count({
        where: {
          ...documentScope,
          indexingStatus: { in: ["pending", "parsing", "chunking", "embedding"] },
        },
      }),
    ])

    return { matters, documents, retrievalReady, inProgress }
  } catch {
    return empty
  }
}

export default async function DocumentsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  const stats = await getDocumentStats(clerkId)

  return (
    <PlatformFeaturePage
      eyebrow="Document intelligence"
      title="Document command center"
      description="Track ingestion health across every matter, keep uploads scoped to privilege boundaries, and route source material into the research index with visible status checkpoints."
      primaryAction={{ href: "/app/matters", label: "Open matter registry" }}
      secondaryAction={{ href: "/app/research", label: "Run research" }}
      metrics={[
        { label: "Matter workspaces", value: String(stats.matters), detail: "Upload context is always matter-scoped." },
        { label: "Registered sources", value: String(stats.documents), detail: "PDF, DOCX, and TXT files." },
        { label: "Retrieval ready", value: String(stats.retrievalReady), detail: "Indexed sources available to research." },
        { label: "In pipeline", value: String(stats.inProgress), detail: "Parsing, chunking, or embedding now." },
      ]}
      cards={[
        {
          title: "Matter-scoped uploads",
          description: "Documents enter through a matter workspace so every source inherits client, jurisdiction, risk, and privilege context before storage.",
          meta: "Access boundary: Clerk user plus Prisma ownership",
          status: "live",
        },
        {
          title: "Structured parsing",
          description: "The indexing workflow extracts text, page counts, confidence, headings, and chunk metadata for downstream review.",
          meta: "Pipeline: parse -> chunk -> embed",
          status: "live",
        },
        {
          title: "Retrieval traceability",
          description: "Each indexed chunk keeps document, page, heading, and relevance metadata so research answers can show source excerpts.",
          meta: "Surface: research and workstation",
          status: "ready",
        },
        {
          title: "Operational exception path",
          description: "Files remain registered when embeddings are unavailable, giving teams reviewable text and a clear non-semantic status instead of silent failure.",
          meta: "Fallback: indexed without semantic retrieval",
          status: "guarded",
        },
      ]}
      sidebarTitle="Ingestion lifecycle"
      sidebarDescription="The document surface now reflects the same pipeline used by the matter detail and document workstation views."
      steps={[
        { label: "Upload accepted", detail: "File type, size, storage, and matter ownership are checked server-side.", state: "complete" },
        { label: "Text extracted", detail: "PDF, DOCX, and TXT sources are normalized into parsed text with confidence metadata.", state: "complete" },
        { label: "Chunks generated", detail: "Source text is split into retrieval-ready passages with token estimates and headings.", state: "active" },
        { label: "Research enabled", detail: "When embeddings exist, chunks become available to semantic search and citation review.", state: stats.retrievalReady > 0 ? "complete" : "pending" },
      ]}
    />
  )
}
