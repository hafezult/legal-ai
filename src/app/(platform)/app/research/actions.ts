"use server"

import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"
import { extractAuthorities, groupAuthorities } from "@/lib/legal/authorities"
import { semanticSearch, indexedChunkCount } from "@/lib/retrieval/search"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"

// ── Types ─────────────────────────────────────────────────────────────────

export type ResearchChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
}

export type ResearchAuthorities = {
  cases: string[]
  statutes: string[]
  cpr: string[]
  practiceDirs: string[]
  statutory: string[]
}

export type ResearchOutput = {
  query: string
  matterId: string
  matterTitle: string
  answer: string
  chunks: ResearchChunk[]
  authorities: ResearchAuthorities
  sessionId: string
  retrievalCount: number
  indexedChunks: number
  embeddingConfigured: boolean
  error?: string
}

// ── Grounded LLM response ─────────────────────────────────────────────────

async function generateGroundedResponse(
  query: string,
  chunks: ResearchChunk[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return "AI analysis unavailable — OPENAI_API_KEY not configured. Retrieved excerpts are displayed above."
  }

  const context = chunks
    .map((c, i) => {
      const src = [
        `Source ${i + 1}: ${c.fileName}`,
        c.headingPath ? `Section: ${c.headingPath}` : null,
        c.pageRef ? `Page ${c.pageRef}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      return `[${src}]\n${c.content}`
    })
    .join("\n\n---\n\n")

  const { OpenAI } = await import("openai")
  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 1800,
    messages: [
      {
        role: "system",
        content: `You are a legal research assistant specialising in English and Welsh law, assisting barristers and solicitors in chambers and litigation teams.

Rules you must follow without exception:
1. Answer ONLY from the retrieved source excerpts provided. Do not draw on external legal knowledge.
2. Do not invent, assume, or extrapolate any case citations, statutory provisions, or legal principles not present in the sources.
3. Use precise legal English appropriate for a barrister's skeleton argument or counsel's advice.
4. When citing a source, reference the document name and page number exactly as provided.
5. If the sources do not contain sufficient information, state this clearly: "The retrieved sources do not address this point."
6. Structure your response with clear paragraphs. Use headings where appropriate.
7. Apply UK legal terminology throughout (claimant/defendant, barrister, counsel, chambers, disclosure, privilege, etc.).`,
      },
      {
        role: "user",
        content: `Research query: ${query}\n\n--- RETRIEVED SOURCES ---\n\n${context}`,
      },
    ],
  })

  return response.choices[0]?.message?.content ?? "No response generated."
}

// ── Main research action ──────────────────────────────────────────────────

export async function runResearch(
  matterId: string,
  query: string
): Promise<ResearchOutput> {
  const { userId: clerkId } = auth()

  const emptyResult = (error: string): ResearchOutput => ({
    query,
    matterId,
    matterTitle: "",
    answer: "",
    chunks: [],
    authorities: { cases: [], statutes: [], cpr: [], practiceDirs: [], statutory: [] },
    sessionId: "",
    retrievalCount: 0,
    indexedChunks: 0,
    embeddingConfigured: isEmbeddingConfigured(),
    error,
  })

  if (!clerkId) return emptyResult("Authentication required.")
  if (!query.trim()) return emptyResult("Research query cannot be empty.")
  if (!matterId) return emptyResult("No matter selected.")

  // Validate ownership
  let user: { id: string } | null = null
  let matter: { id: string; title: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return emptyResult("User session not found.")

    matter = await prisma.matter.findFirst({
      where: { id: matterId, userId: user.id },
      select: { id: true, title: true },
    })
    if (!matter) return emptyResult("Matter not found or access denied.")
  } catch {
    return emptyResult("Data layer unreachable.")
  }

  const embeddingConfigured = isEmbeddingConfigured()
  const indexedChunks = await indexedChunkCount(matterId).catch(() => 0)

  if (!embeddingConfigured) {
    return {
      ...emptyResult(""),
      matterTitle: matter.title,
      answer:
        "Semantic retrieval requires OPENAI_API_KEY to be configured. " +
        "Add your key to .env.local and re-index the matter documents.",
      indexedChunks,
      embeddingConfigured: false,
    }
  }

  if (indexedChunks === 0) {
    return {
      ...emptyResult(""),
      matterTitle: matter.title,
      answer:
        "No indexed sources found for this matter. Upload documents and allow the indexing pipeline to complete before running research queries.",
      indexedChunks: 0,
      embeddingConfigured: true,
    }
  }

  // Semantic retrieval
  let chunks: ResearchChunk[] = []
  try {
    const raw = await semanticSearch(query, matterId, { topK: 6 })
    chunks = raw.map((c) => ({
      id: c.id,
      content: c.content,
      fileName: c.fileName,
      pageRef: c.pageRef,
      headingPath: c.headingPath,
      distance: c.distance,
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Retrieval failed."
    return { ...emptyResult(msg), matterTitle: matter.title, embeddingConfigured }
  }

  // Extract authorities from retrieved excerpts
  const combinedText = chunks.map((c) => c.content).join("\n\n")
  const rawAuthorities = extractAuthorities(combinedText)
  const grouped = groupAuthorities(rawAuthorities)
  const authorities: ResearchAuthorities = {
    cases:       grouped.cases.map((a) => a.normalized),
    statutes:    grouped.statutes.map((a) => a.normalized),
    cpr:         grouped.cpr.map((a) => a.normalized),
    practiceDirs:grouped.practiceDirs.map((a) => a.normalized),
    statutory:   grouped.statutory.map((a) => a.normalized),
  }

  // Grounded LLM response
  const answer = await generateGroundedResponse(query, chunks)

  // Persist research session
  let sessionId = ""
  try {
    const session = await prisma.researchSession.create({
      data: {
        userId: user.id,
        matterId,
        query,
        response: answer,
        chunkIds: chunks.map((c) => c.id),
      },
    })
    sessionId = session.id
  } catch {
    /* Non-fatal — session persistence failure should not break research */
  }

  return {
    query,
    matterId,
    matterTitle: matter.title,
    answer,
    chunks,
    authorities,
    sessionId,
    retrievalCount: chunks.length,
    indexedChunks,
    embeddingConfigured: true,
  }
}
