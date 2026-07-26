"use server"

import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { requireClerkId } from "@/lib/auth/require-actor"
import {
  matterAccessWhere,
  requireMatterPermission,
  requireWorkProductDelete,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { extractAuthorities, groupAuthorities } from "@/lib/legal/authorities"
import { consumeRateLimit } from "@/lib/rate-limit"
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { buildCitationSnapshot } from "@/lib/retrieval/citation-snapshot"
import { loadProvenanceChunks } from "@/lib/retrieval/provenance"
import { semanticSearch, indexedChunkCount } from "@/lib/retrieval/search"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { MAX_RESEARCH_QUERY_CHARS } from "@/lib/research/limits"

const RESEARCH_RATE_LIMIT = { limit: 12, windowMs: 60_000 } as const
const RESEARCH_DELETE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const RESEARCH_RESTORE_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const

function rateLimitMessage(action: string, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return `${action} rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
}

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
  matterId: string | null
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

  const { createOpenAIClient } = await import("@/lib/ai/openai-client")
  const client = await createOpenAIClient()

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

  const clerk = await requireClerkId()
  if (!clerk.ok) return emptyResult(clerk.error)
  const { clerkId } = clerk

  if (!query.trim()) return emptyResult("Research query cannot be empty.")
  if (query.length > MAX_RESEARCH_QUERY_CHARS) {
    return emptyResult(
      `Research query exceeds the ${MAX_RESEARCH_QUERY_CHARS.toLocaleString()} character limit.`
    )
  }
  if (!matterId) return emptyResult("No matter selected.")

  // Validate write access
  let user: { id: string } | null = null
  let matter: { id: string; title: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return emptyResult("User session not found.")

    const throttle = await consumeRateLimit(`research:${user.id}`, RESEARCH_RATE_LIMIT)
    if (!throttle.ok) {
      const seconds = Math.ceil(throttle.retryAfterMs / 1000)
      return emptyResult(
        `Research rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
      )
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) return emptyResult(permission.error)

    matter = await prisma.matter.findUnique({
      where: { id: matterId },
      select: { id: true, title: true },
    })
    if (!matter) return emptyResult("Matter not found or access denied.")
  } catch {
    return emptyResult("Data layer unreachable.")
  }

  const embeddingConfigured = isEmbeddingConfigured()
  let indexedChunks = 0
  try {
    indexedChunks = await indexedChunkCount(matterId)
  } catch (err) {
    if (err instanceof Error) {
      console.error("[runResearch] indexedChunkCount", err.message.slice(0, 240))
    }
    return {
      ...emptyResult(
        "Unable to verify indexed sources. Retry shortly or check Settings readiness probes."
      ),
      matterTitle: matter.title,
      embeddingConfigured,
    }
  }

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
    if (err instanceof Error) {
      console.error("[runResearch] retrieval", err.message.slice(0, 240))
    }
    return {
      ...emptyResult("Retrieval failed. Verify embeddings and try again."),
      matterTitle: matter.title,
      embeddingConfigured,
    }
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

  // Grounded LLM response — retrieval already succeeded; surface provider
  // failures without discarding the excerpts.
  let answer = ""
  let generationError: string | undefined
  try {
    answer = await generateGroundedResponse(query, chunks)
  } catch (err) {
    if (err instanceof Error) {
      console.error("[runResearch] generation", err.message.slice(0, 240))
    }
    generationError = "Grounded response generation failed."
    answer =
      "Retrieved excerpts are shown below, but grounded analysis failed. Retry the query or verify OPENAI_API_KEY."
  }

  // Persist research session and open a matter conversation thread
  let sessionId = ""
  let persistenceError: string | undefined
  try {
    const session = await prisma.researchSession.create({
      data: {
        userId: user.id,
        matterId,
        query,
        response: answer,
        chunkIds: chunks.map((c) => c.id),
        citationSnapshot: buildCitationSnapshot(chunks),
      },
    })
    sessionId = session.id

    await recordAuditEvent({
      userId: user.id,
      action: "research.run",
      entityType: "research_session",
      entityId: session.id,
      matterId,
      summary: `Ran research query on “${matter.title}”`,
      metadata: { chunkCount: chunks.length, queryLength: query.length },
    })
  } catch {
    persistenceError =
      "Research completed, but the session could not be saved to matter history."
  }

  if (sessionId) {
    try {
      const conversationTitle = query.replace(/\s+/g, " ").trim()
      if (conversationTitle) {
        await prisma.conversation.create({
          data: {
            matterId,
            createdByUserId: user.id,
            title:
              conversationTitle.length > 120
                ? `${conversationTitle.slice(0, 117)}…`
                : conversationTitle,
            messages: {
              create: [
                { role: "user", content: query },
                ...(answer
                  ? [{ role: "assistant", content: answer }]
                  : []),
              ],
            },
          },
        })
        await prisma.matter.update({
          where: { id: matterId },
          data: { updatedAt: new Date() },
        })
      }
    } catch {
      persistenceError =
        persistenceError ??
        "Research session saved, but the matter conversation thread could not be created."
    }
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

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
    error: generationError ?? persistenceError,
  }
}

/** Restore a saved research session with stored provenance chunks and authorities. */
export async function restoreResearchSession(
  sessionId: string
): Promise<ResearchOutput> {
  const emptyResult = (error: string): ResearchOutput => ({
    query: "",
    matterId: null,
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

  const clerk = await requireClerkId()
  if (!clerk.ok) return emptyResult(clerk.error)
  const { clerkId } = clerk

  if (!sessionId) return emptyResult("Session id is required.")

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return emptyResult("User session not found.")

    const throttle = await consumeRateLimit(
      `research-restore:${user.id}`,
      RESEARCH_RESTORE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return emptyResult(
        rateLimitMessage("Research restore", throttle.retryAfterMs)
      )
    }

    const session = await prisma.researchSession.findFirst({
      where: {
        id: sessionId,
        OR: [{ userId: user.id }, { matter: matterAccessWhere(user.id) }],
      },
      select: {
        id: true,
        query: true,
        response: true,
        chunkIds: true,
        citationSnapshot: true,
        matterId: true,
        matter: { select: { title: true } },
      },
    })
    if (!session) return emptyResult("Research session not found or access denied.")

    const permission = await requireMatterPermission(user.id, session.matterId, "read")
    if (!permission.ok) return emptyResult(permission.error)

    const chunks = await loadProvenanceChunks(
      session.matterId,
      session.chunkIds,
      session.citationSnapshot
    )
    const combinedText = chunks.map((chunk) => chunk.content).join("\n\n")
    const grouped = groupAuthorities(extractAuthorities(combinedText))
    const authorities: ResearchAuthorities = {
      cases: grouped.cases.map((a) => a.normalized),
      statutes: grouped.statutes.map((a) => a.normalized),
      cpr: grouped.cpr.map((a) => a.normalized),
      practiceDirs: grouped.practiceDirs.map((a) => a.normalized),
      statutory: grouped.statutory.map((a) => a.normalized),
    }
    let indexedChunks = 0
    try {
      indexedChunks = await indexedChunkCount(session.matterId)
    } catch (err) {
      if (err instanceof Error) {
        console.error(
          "[restoreResearchSession] indexedChunkCount",
          err.message.slice(0, 240)
        )
      }
      return emptyResult(
        "Unable to verify indexed sources. Retry shortly or check Settings readiness probes."
      )
    }

    return {
      query: session.query,
      matterId: session.matterId,
      matterTitle: session.matter.title,
      answer: session.response ?? "",
      chunks,
      authorities,
      sessionId: session.id,
      retrievalCount: chunks.length,
      indexedChunks,
      embeddingConfigured: isEmbeddingConfigured(),
    }
  } catch {
    return emptyResult("Unable to restore research session.")
  }
}

export type ResearchSessionDeleteState = {
  error?: string
  success?: boolean
}

export async function deleteResearchSession(
  sessionId: string
): Promise<ResearchSessionDeleteState> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!sessionId) return { error: "Session id is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      destructiveMutationKey(user.id),
      RESEARCH_DELETE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return {
        error: rateLimitMessage("Research delete", throttle.retryAfterMs),
      }
    }

    const researchSession = await prisma.researchSession.findFirst({
      where: {
        id: sessionId,
        OR: [{ userId: user.id }, { matter: matterAccessWhere(user.id) }],
      },
      select: { id: true, matterId: true, userId: true },
    })
    if (!researchSession) return { error: "Research session not found or access denied." }

    const permission = await requireWorkProductDelete(
      user.id,
      researchSession.matterId,
      researchSession.userId
    )
    if (!permission.ok) return { error: permission.error }

    matterId = researchSession.matterId
    await prisma.researchSession.delete({ where: { id: researchSession.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "research.delete",
      entityType: "research_session",
      entityId: researchSession.id,
      matterId: researchSession.matterId,
      summary: "Deleted research session",
    })
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  revalidatePath("/app/research")
  revalidatePath("/app")
  revalidatePath("/app/memory")
  revalidatePath("/app/workflows")
  revalidatePath("/app/settings")
  if (matterId) {
    revalidatePath(`/app/matters/${matterId}`)
  }

  return { success: true }
}
