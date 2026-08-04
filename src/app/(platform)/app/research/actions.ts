"use server"

import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { requireClerkId } from "@/lib/auth/require-actor"
import {
  matterAccessWhere,
  requireMatterPermissionLocked,
  requireWorkProductDeleteLocked,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { extractAuthorities, groupAuthorities } from "@/lib/legal/authorities"
import { consumeRateLimit } from "@/lib/rate-limit"
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { buildCitationSnapshot } from "@/lib/retrieval/citation-snapshot"
import { loadProvenanceChunks } from "@/lib/retrieval/provenance"
import { semanticSearch, indexedChunkCount } from "@/lib/retrieval/search"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import {
  buildResearchUserPrompt,
  groundedSystemRulesAppendix,
} from "@/lib/ai/prompt-envelope"
import { MAX_RESEARCH_QUERY_CHARS } from "@/lib/research/limits"
import {
  redactResearchOnRevocation,
  RESEARCH_ACCESS_REVOKED_MESSAGE,
  RESEARCH_PERSIST_REVOKED_MESSAGE,
} from "@/lib/research/revocation"

const RESEARCH_RATE_LIMIT = { limit: 12, windowMs: 60_000 } as const
const RESEARCH_DELETE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const RESEARCH_RESTORE_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const
/** Wall-clock budget under page maxDuration (300s) for embed + grounded chat. */
const RESEARCH_ACTION_DEADLINE_MS = 270_000

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
  documentId?: string
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
  chunks: ResearchChunk[],
  remainingBudgetMs?: number
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return "AI analysis unavailable — OPENAI_API_KEY not configured. Retrieved excerpts are displayed above."
  }

  const {
    OPENAI_REQUEST_TIMEOUT_MS,
    createOpenAIClient,
    openAICallBudgetFromDeadline,
  } = await import("@/lib/ai/openai-client")

  const budget =
    remainingBudgetMs === undefined
      ? { timeout: OPENAI_REQUEST_TIMEOUT_MS, maxRetries: 1 as const }
      : openAICallBudgetFromDeadline(remainingBudgetMs)
  if (!budget) {
    throw new Error("Insufficient budget remaining for grounded research response.")
  }

  const client = await createOpenAIClient(budget)
  const controller = new AbortController()
  const abortTimer =
    remainingBudgetMs === undefined
      ? null
      : setTimeout(() => controller.abort(), remainingBudgetMs)

  try {
    const response = await client.chat.completions.create(
      {
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
7. Apply UK legal terminology throughout (claimant/defendant, barrister, counsel, chambers, disclosure, privilege, etc.).
8. ${groundedSystemRulesAppendix()}`,
          },
          {
            role: "user",
            content: buildResearchUserPrompt(query, chunks),
          },
        ],
      },
      { signal: controller.signal }
    )

    return response.choices[0]?.message?.content ?? "No response generated."
  } finally {
    if (abortTimer) clearTimeout(abortTimer)
  }
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

  // Validate write access under matter + membership locks before reading the
  // matter title or retrieving privileged corpus excerpts.
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

    const authorized = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        user!.id,
        matterId,
        "write"
      )
      if (!permission.ok) return { ok: false as const, error: permission.error }
      const row = await tx.matter.findUnique({
        where: { id: matterId },
        select: { id: true, title: true },
      })
      if (!row) {
        return { ok: false as const, error: "Matter not found or access denied." }
      }
      return { ok: true as const, matter: row }
    })
    if (!authorized.ok) return emptyResult(authorized.error)
    matter = authorized.matter
  } catch {
    return emptyResult("Data layer unreachable.")
  }

  const embeddingConfigured = isEmbeddingConfigured()
  let indexedChunks = 0
  let indexedCountError: string | null = null
  try {
    indexedChunks = await indexedChunkCount(matterId)
  } catch (err) {
    if (err instanceof Error) {
      console.error("[runResearch] indexedChunkCount", err.message.slice(0, 240))
    }
    indexedCountError =
      "Unable to verify indexed sources. Retry shortly or check Settings readiness probes."
  }

  // Locked reauth after unlocked indexedChunkCount (and before any early
  // matterTitle publish or corpus retrieval) so a mid-flight revoke cannot
  // echo the matter label after access is lost.
  try {
    const postCount = await prisma.$transaction(async (tx) =>
      requireMatterPermissionLocked(tx, user.id, matterId, "write")
    )
    if (!postCount.ok) {
      return emptyResult(RESEARCH_ACCESS_REVOKED_MESSAGE)
    }
  } catch {
    return emptyResult("Data layer unreachable.")
  }

  if (indexedCountError) {
    return {
      ...emptyResult(indexedCountError),
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

  const actionStartedAt = Date.now()
  const remainingBudgetMs = () =>
    Math.max(0, RESEARCH_ACTION_DEADLINE_MS - (Date.now() - actionStartedAt))

  // Semantic retrieval
  let chunks: ResearchChunk[] = []
  try {
    const raw = await semanticSearch(query, matterId, {
      topK: 6,
      deadlineMs: remainingBudgetMs(),
    })
    chunks = raw.map((c) => ({
      id: c.id,
      content: c.content,
      fileName: c.fileName,
      pageRef: c.pageRef,
      headingPath: c.headingPath,
      distance: c.distance,
      documentId: c.documentId,
    }))
  } catch (err) {
    if (err instanceof Error) {
      console.error("[runResearch] retrieval", err.message.slice(0, 240))
    }
    try {
      const postRetrieve = await prisma.$transaction(async (tx) =>
        requireMatterPermissionLocked(tx, user.id, matterId, "write")
      )
      if (!postRetrieve.ok) {
        return emptyResult(RESEARCH_ACCESS_REVOKED_MESSAGE)
      }
    } catch {
      return emptyResult("Data layer unreachable.")
    }
    return {
      ...emptyResult("Retrieval failed. Verify embeddings and try again."),
      matterTitle: matter.title,
      embeddingConfigured,
    }
  }

  // Re-check write access under lock before LLM generation so a mid-flight
  // revocation does not send retrieved matter excerpts to the model or client.
  try {
    const preGenerate = await prisma.$transaction(async (tx) =>
      requireMatterPermissionLocked(tx, user.id, matterId, "write")
    )
    if (!preGenerate.ok) {
      return {
        ...emptyResult(RESEARCH_ACCESS_REVOKED_MESSAGE),
        indexedChunks,
        embeddingConfigured: true,
      }
    }
  } catch {
    return {
      ...emptyResult("Data layer unreachable."),
      indexedChunks,
      embeddingConfigured: true,
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
    answer = await generateGroundedResponse(query, chunks, remainingBudgetMs())
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
  // Only return generated/retrieved content after locked reauth succeeds.
  // If the persistence transaction throws before that point, fail closed.
  let lockedReauthConfirmed = false
  try {
    // Re-authorize under matter + membership locks immediately before writes —
    // retrieval/generation can take minutes, during which membership may have
    // been revoked. Session + conversation share one transaction so the second
    // write cannot succeed after a mid-flight demotion.
    const persisted = await prisma.$transaction(async (tx) => {
      const stillAllowed = await requireMatterPermissionLocked(
        tx,
        user.id,
        matterId,
        "write"
      )
      if (!stillAllowed.ok) {
        return { ok: false as const }
      }
      lockedReauthConfirmed = true

      const session = await tx.researchSession.create({
        data: {
          userId: user.id,
          matterId,
          query,
          response: answer,
          chunkIds: chunks.map((c) => c.id),
          citationSnapshot: buildCitationSnapshot(chunks),
        },
      })

      const conversationTitle = query.replace(/\s+/g, " ").trim()
      if (conversationTitle) {
        await tx.conversation.create({
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
                ...(answer ? [{ role: "assistant", content: answer }] : []),
              ],
            },
          },
        })
        await tx.matter.update({
          where: { id: matterId },
          data: { updatedAt: new Date() },
        })
      }

      return { ok: true as const, sessionId: session.id }
    })

    if (!persisted.ok) {
      // Fail closed: do not return retrieved/generated matter content after
      // write access was revoked under the locked persistence check.
      return redactResearchOnRevocation(
        {
          query,
          matterId,
          matterTitle: matter.title,
          answer,
          chunks,
          authorities,
          sessionId: "",
          retrievalCount: chunks.length,
          indexedChunks,
          embeddingConfigured: true,
          error: undefined,
        },
        RESEARCH_PERSIST_REVOKED_MESSAGE
      )
    }
    sessionId = persisted.sessionId
    await recordAuditEvent({
      userId: user.id,
      action: "research.run",
      entityType: "research_session",
      entityId: persisted.sessionId,
      matterId,
      summary: `Ran research query on “${matter.title}”`,
      metadata: { chunkCount: chunks.length, queryLength: query.length },
    })
  } catch {
    if (!lockedReauthConfirmed) {
      return redactResearchOnRevocation(
        {
          query,
          matterId,
          matterTitle: matter.title,
          answer,
          chunks,
          authorities,
          sessionId: "",
          retrievalCount: chunks.length,
          indexedChunks,
          embeddingConfigured: true,
          error: undefined,
        },
        RESEARCH_PERSIST_REVOKED_MESSAGE
      )
    }
    persistenceError =
      "Research completed, but the session could not be saved to matter history."
  }

  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  // Final locked publish reauth after audit/revalidation so a concurrent
  // removal cannot receive generated/retrieved content after revoke.
  try {
    const publishAllowed = await prisma.$transaction(async (tx) =>
      requireMatterPermissionLocked(tx, user.id, matterId, "read")
    )
    if (!publishAllowed.ok) {
      return redactResearchOnRevocation(
        {
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
          error: undefined,
        },
        RESEARCH_ACCESS_REVOKED_MESSAGE
      )
    }
  } catch {
    return redactResearchOnRevocation(
      {
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
        error: undefined,
      },
      RESEARCH_ACCESS_REVOKED_MESSAGE
    )
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

    // Identifier-only pre-lookup under current matter access. Do not select
    // response/query/provenance here — a removed org-matter creator can still
    // match ResearchSession.userId and would otherwise load bodies into Node
    // before the locked reauth below.
    const session = await prisma.researchSession.findFirst({
      where: {
        id: sessionId,
        matter: matterAccessWhere(user.id),
      },
      select: {
        id: true,
        matterId: true,
      },
    })
    if (!session) return emptyResult("Research session not found or access denied.")

    // Final locked reauth + re-read of body and provenance so a mid-restore
    // revoke/delete cannot fail open with stale answers or source excerpts.
    let restored: {
      id: string
      query: string
      response: string | null
      matterTitle: string
      chunks: ResearchChunk[]
      authorities: ResearchAuthorities
    }
    try {
      const lockedRead = await prisma.$transaction(async (tx) => {
        const stillAllowed = await requireMatterPermissionLocked(
          tx,
          user.id,
          session.matterId,
          "read"
        )
        if (!stillAllowed.ok) {
          return { ok: false as const, error: RESEARCH_ACCESS_REVOKED_MESSAGE }
        }
        const fresh = await tx.researchSession.findFirst({
          where: {
            id: session.id,
            matterId: session.matterId,
          },
          select: {
            id: true,
            query: true,
            response: true,
            chunkIds: true,
            citationSnapshot: true,
            matter: { select: { title: true } },
          },
        })
        if (!fresh) {
          return {
            ok: false as const,
            error: "Research session not found or access denied.",
          }
        }
        const chunks = await loadProvenanceChunks(
          session.matterId,
          fresh.chunkIds,
          fresh.citationSnapshot,
          tx
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
        return {
          ok: true as const,
          value: {
            id: fresh.id,
            query: fresh.query,
            response: fresh.response,
            matterTitle: fresh.matter.title,
            chunks,
            authorities,
          },
        }
      })
      if (!lockedRead.ok) return emptyResult(lockedRead.error)
      restored = lockedRead.value
    } catch {
      return emptyResult("Unable to verify workspace permissions.")
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

    // Final locked reauth after the post-lock indexed count so a concurrent
    // removal cannot receive restored bodies/provenance after revoke.
    try {
      const publishAllowed = await prisma.$transaction(async (tx) =>
        requireMatterPermissionLocked(tx, user.id, session.matterId, "read")
      )
      if (!publishAllowed.ok) {
        return emptyResult(RESEARCH_ACCESS_REVOKED_MESSAGE)
      }
    } catch {
      return emptyResult("Unable to verify workspace permissions.")
    }

    return {
      query: restored.query,
      matterId: session.matterId,
      matterTitle: restored.matterTitle,
      answer: restored.response ?? "",
      chunks: restored.chunks,
      authorities: restored.authorities,
      sessionId: restored.id,
      retrievalCount: restored.chunks.length,
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

    matterId = researchSession.matterId
    await prisma.$transaction(async (tx) => {
      const permission = await requireWorkProductDeleteLocked(
        tx,
        user.id,
        researchSession.matterId,
        researchSession.userId
      )
      if (!permission.ok) {
        throw new Error(`PERMISSION:${permission.error}`)
      }

      const deleted = await tx.researchSession.deleteMany({
        where: {
          id: researchSession.id,
          matterId: researchSession.matterId,
        },
      })
      if (deleted.count !== 1) {
        throw new Error(
          "PERMISSION:Research session not found or access denied."
        )
      }
    })

    await recordAuditEvent({
      userId: user.id,
      action: "research.delete",
      entityType: "research_session",
      entityId: researchSession.id,
      matterId: researchSession.matterId,
      summary: "Deleted research session",
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
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
