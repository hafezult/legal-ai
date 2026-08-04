"use server"

import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import {
  buildDraftUserPrompt,
  groundedSystemRulesAppendix,
} from "@/lib/ai/prompt-envelope"
import { requireClerkId } from "@/lib/auth/require-actor"
import {
  matterAccessWhere,
  requireMatterPermission,
  requireMatterPermissionLocked,
  requireWorkProductDeleteLocked,
} from "@/lib/auth/rbac"
import {
  DRAFT_ACCESS_REVOKED_MESSAGE,
  DRAFT_PERSIST_REVOKED_MESSAGE,
  redactDraftOnRevocation,
} from "@/lib/drafting/revocation"
import {
  DRAFT_TYPE_LABELS,
  DRAFT_TYPES,
  MAX_DRAFT_INSTRUCTION_CHARS,
  type DraftType,
} from "@/lib/drafting/types"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { destructiveMutationKey } from "@/lib/rate-limit-policy"
import { buildCitationSnapshot } from "@/lib/retrieval/citation-snapshot"
import { loadProvenanceChunks } from "@/lib/retrieval/provenance"
import { indexedChunkCount, semanticSearch } from "@/lib/retrieval/search"

const DRAFT_RATE_LIMIT = { limit: 12, windowMs: 60_000 } as const
const DRAFT_DELETE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const DRAFT_RESTORE_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const
/** Wall-clock budget under page maxDuration (300s) for embed + grounded chat. */
const DRAFT_ACTION_DEADLINE_MS = 270_000

function rateLimitMessage(action: string, retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return `${action} rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
}

export type DraftSourceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
  documentId?: string
}

export type DraftOutput = {
  draftId: string
  matterId: string | null
  matterTitle: string
  title: string
  draftType: DraftType
  instruction: string
  content: string
  chunks: DraftSourceChunk[]
  retrievalCount: number
  indexedChunks: number
  embeddingConfigured: boolean
  error?: string
}

function isDraftType(value: string): value is DraftType {
  return (DRAFT_TYPES as readonly string[]).includes(value)
}

function draftTitle(draftType: DraftType, instruction: string) {
  const label = DRAFT_TYPE_LABELS[draftType]
  const trimmed = instruction.replace(/\s+/g, " ").trim()
  const excerpt =
    trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed || "Untitled instruction"
  return `${label}: ${excerpt}`
}

function systemPromptFor(draftType: DraftType): string {
  const shared = `You are a legal drafting assistant specialising in English and Welsh law, assisting barristers and solicitors.

Rules you must follow without exception:
1. Draft ONLY from the retrieved source excerpts provided. Do not invent facts, citations, or authorities absent from the sources.
2. Use precise UK legal English (claimant/defendant, counsel, chambers, disclosure, privilege).
3. When relying on a source, cite the document name and page number exactly as provided.
4. If the sources are insufficient, state the gap clearly and draft only what is supported.
5. Structure the output with clear headings appropriate to the requested draft type.
6. Do not include conversational preamble — return the draft itself.
7. ${groundedSystemRulesAppendix()}`

  switch (draftType) {
    case "advice":
      return `${shared}

Produce a counsel's advice note with: Issue, Material facts (from sources only), Advice, and Next steps.`
    case "brief":
      return `${shared}

Produce a concise skeleton / brief outline with: Issues, Submissions (numbered), and Supporting extracts.`
    case "memo":
      return `${shared}

Produce an internal research memo with: Purpose, Findings, Risks, and Recommendations.`
    case "clause":
      return `${shared}

Produce a clause analysis note with: Clause focus, Operative effect, Risks/ambiguities, and Suggested drafting points.`
  }
}

async function generateGroundedDraft(
  draftType: DraftType,
  instruction: string,
  chunks: DraftSourceChunk[],
  remainingBudgetMs?: number
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return "Draft generation unavailable — OPENAI_API_KEY not configured. Retrieved source excerpts are listed above for manual drafting."
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
    throw new Error("Insufficient budget remaining for grounded draft generation.")
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
        temperature: 0.15,
        max_tokens: 2200,
        messages: [
          { role: "system", content: systemPromptFor(draftType) },
          {
            role: "user",
            content: buildDraftUserPrompt(
              DRAFT_TYPE_LABELS[draftType],
              instruction,
              chunks
            ),
          },
        ],
      },
      { signal: controller.signal }
    )

    return response.choices[0]?.message?.content ?? "No draft generated."
  } finally {
    if (abortTimer) clearTimeout(abortTimer)
  }
}

export async function generateDraft(
  matterId: string,
  draftTypeInput: string,
  instruction: string
): Promise<DraftOutput> {
  const emptyResult = (error: string): DraftOutput => ({
    draftId: "",
    matterId,
    matterTitle: "",
    title: "",
    draftType: isDraftType(draftTypeInput) ? draftTypeInput : "advice",
    instruction,
    content: "",
    chunks: [],
    retrievalCount: 0,
    indexedChunks: 0,
    embeddingConfigured: isEmbeddingConfigured(),
    error,
  })

  const clerk = await requireClerkId()
  if (!clerk.ok) return emptyResult(clerk.error)
  const { clerkId } = clerk

  if (!matterId) return emptyResult("No matter selected.")
  if (!instruction.trim()) return emptyResult("Draft instruction cannot be empty.")
  if (instruction.length > MAX_DRAFT_INSTRUCTION_CHARS) {
    return emptyResult(
      `Draft instruction exceeds the ${MAX_DRAFT_INSTRUCTION_CHARS.toLocaleString()} character limit.`
    )
  }
  if (!isDraftType(draftTypeInput)) return emptyResult("Unsupported draft type.")

  const draftType = draftTypeInput

  let user: { id: string } | null = null
  let matter: { id: string; title: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } })
    if (!user) return emptyResult("User session not found.")

    const throttle = await consumeRateLimit(`draft:${user.id}`, DRAFT_RATE_LIMIT)
    if (!throttle.ok) {
      const seconds = Math.ceil(throttle.retryAfterMs / 1000)
      return emptyResult(
        `Drafting rate limit reached. Retry in about ${seconds} second${seconds === 1 ? "" : "s"}.`
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
      console.error("[generateDraft] indexedChunkCount", err.message.slice(0, 240))
    }
    return {
      ...emptyResult(
        "Unable to verify indexed sources. Retry shortly or check Settings readiness probes."
      ),
      matterTitle: matter.title,
      draftType,
      embeddingConfigured,
    }
  }

  if (!embeddingConfigured) {
    return {
      ...emptyResult(""),
      matterTitle: matter.title,
      draftType,
      content:
        "Grounded drafting requires OPENAI_API_KEY to be configured. " +
        "Add your key to .env.local and re-index the matter documents.",
      indexedChunks,
      embeddingConfigured: false,
    }
  }

  if (indexedChunks === 0) {
    return {
      ...emptyResult(""),
      matterTitle: matter.title,
      draftType,
      content:
        "No indexed sources found for this matter. Upload documents and allow indexing to complete before generating drafts.",
      indexedChunks: 0,
      embeddingConfigured: true,
    }
  }

  const actionStartedAt = Date.now()
  const remainingBudgetMs = () =>
    Math.max(0, DRAFT_ACTION_DEADLINE_MS - (Date.now() - actionStartedAt))

  let chunks: DraftSourceChunk[] = []
  try {
    const raw = await semanticSearch(instruction, matterId, {
      topK: 8,
      deadlineMs: remainingBudgetMs(),
    })
    chunks = raw.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      fileName: chunk.fileName,
      pageRef: chunk.pageRef,
      headingPath: chunk.headingPath,
      distance: chunk.distance,
      documentId: chunk.documentId,
    }))
  } catch (err) {
    if (err instanceof Error) {
      console.error("[generateDraft] retrieval", err.message.slice(0, 240))
    }
    return {
      ...emptyResult("Retrieval failed. Verify embeddings and try again."),
      matterTitle: matter.title,
      draftType,
      embeddingConfigured,
    }
  }

  // Re-check write access before LLM generation so a mid-flight revocation
  // does not send retrieved matter excerpts to the model or the client.
  try {
    const preGenerate = await requireMatterPermission(user.id, matterId, "write")
    if (!preGenerate.ok) {
      return {
        ...emptyResult(DRAFT_ACCESS_REVOKED_MESSAGE),
        matterTitle: matter.title,
        draftType,
        indexedChunks,
        embeddingConfigured: true,
      }
    }
  } catch {
    return {
      ...emptyResult("Data layer unreachable."),
      matterTitle: matter.title,
      draftType,
      indexedChunks,
      embeddingConfigured: true,
    }
  }

  let content = ""
  let generationError: string | undefined
  try {
    content = await generateGroundedDraft(
      draftType,
      instruction.trim(),
      chunks,
      remainingBudgetMs()
    )
  } catch (err) {
    if (err instanceof Error) {
      console.error("[generateDraft] generation", err.message.slice(0, 240))
    }
    generationError = "Draft generation failed."
    content =
      "Retrieved source excerpts are listed below, but draft generation failed. Retry or verify OPENAI_API_KEY."
  }
  const title = draftTitle(draftType, instruction)

  let draftId = ""
  let persistenceError: string | undefined
  // Only return generated/retrieved content after locked reauth succeeds.
  // If the persistence transaction throws before that point, fail closed.
  let lockedReauthConfirmed = false
  try {
    // Re-authorize under matter + membership locks immediately before writes —
    // retrieval/generation can take minutes, during which membership may have
    // been revoked.
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

      const draft = await tx.draftDocument.create({
        data: {
          userId: user.id,
          matterId,
          title,
          draftType,
          instruction: instruction.trim(),
          content,
          chunkIds: chunks.map((chunk) => chunk.id),
          citationSnapshot: buildCitationSnapshot(chunks),
          status: generationError ? "failed" : "ready",
        },
      })

      await tx.matter.update({
        where: { id: matterId },
        data: { updatedAt: new Date() },
      })

      return { ok: true as const, draftId: draft.id }
    })

    if (!persisted.ok) {
      // Fail closed: do not return retrieved/generated matter content after
      // write access was revoked under the locked persistence check.
      return redactDraftOnRevocation(
        {
          draftId: "",
          matterId,
          matterTitle: matter.title,
          title,
          draftType,
          instruction: instruction.trim(),
          content,
          chunks,
          retrievalCount: chunks.length,
          indexedChunks,
          embeddingConfigured: true,
          error: undefined,
        },
        DRAFT_PERSIST_REVOKED_MESSAGE
      )
    }
    draftId = persisted.draftId
    await recordAuditEvent({
      userId: user.id,
      action: "draft.generate",
      entityType: "draft_document",
      entityId: persisted.draftId,
      matterId,
      summary: `Generated ${draftType} draft on “${matter.title}”`,
      metadata: { draftType, chunkCount: chunks.length },
    })
  } catch {
    if (!lockedReauthConfirmed) {
      return redactDraftOnRevocation(
        {
          draftId: "",
          matterId,
          matterTitle: matter.title,
          title,
          draftType,
          instruction: instruction.trim(),
          content,
          chunks,
          retrievalCount: chunks.length,
          indexedChunks,
          embeddingConfigured: true,
          error: undefined,
        },
        DRAFT_PERSIST_REVOKED_MESSAGE
      )
    }
    persistenceError =
      "Draft generated, but it could not be saved to matter history."
  }

  revalidatePath("/app/drafting")
  revalidatePath(`/app/matters/${matterId}`)
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  revalidatePath("/app")

  return {
    draftId,
    matterId,
    matterTitle: matter.title,
    title,
    draftType,
    instruction: instruction.trim(),
    content,
    chunks,
    retrievalCount: chunks.length,
    indexedChunks,
    embeddingConfigured: true,
    error: generationError ?? persistenceError,
  }
}

/** Restore a saved draft with stored provenance source excerpts. */
export async function restoreDraft(draftId: string): Promise<DraftOutput> {
  const emptyResult = (error: string): DraftOutput => ({
    draftId: "",
    matterId: null,
    matterTitle: "",
    title: "",
    draftType: "advice",
    instruction: "",
    content: "",
    chunks: [],
    retrievalCount: 0,
    indexedChunks: 0,
    embeddingConfigured: isEmbeddingConfigured(),
    error,
  })

  const clerk = await requireClerkId()
  if (!clerk.ok) return emptyResult(clerk.error)
  const { clerkId } = clerk

  if (!draftId) return emptyResult("Draft id is required.")

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return emptyResult("User session not found.")

    const throttle = await consumeRateLimit(
      `draft-restore:${user.id}`,
      DRAFT_RESTORE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return emptyResult(rateLimitMessage("Draft restore", throttle.retryAfterMs))
    }

    const draft = await prisma.draftDocument.findFirst({
      where: {
        id: draftId,
        OR: [{ userId: user.id }, { matter: matterAccessWhere(user.id) }],
      },
      select: {
        id: true,
        title: true,
        draftType: true,
        instruction: true,
        content: true,
        chunkIds: true,
        citationSnapshot: true,
        matterId: true,
        matter: { select: { title: true } },
      },
    })
    if (!draft) return emptyResult("Draft not found or access denied.")

    const permission = await requireMatterPermission(user.id, draft.matterId, "read")
    if (!permission.ok) return emptyResult(permission.error)

    const draftType: DraftType = isDraftType(draft.draftType) ? draft.draftType : "advice"

    // Final locked reauth + re-read of body and provenance so a mid-restore
    // revoke/delete cannot fail open with stale draft text or source excerpts.
    let restored: {
      id: string
      title: string
      draftType: string
      instruction: string
      content: string | null
      matterTitle: string
      chunks: DraftSourceChunk[]
    }
    try {
      const lockedRead = await prisma.$transaction(async (tx) => {
        const stillAllowed = await requireMatterPermissionLocked(
          tx,
          user.id,
          draft.matterId,
          "read"
        )
        if (!stillAllowed.ok) {
          return { ok: false as const, error: DRAFT_ACCESS_REVOKED_MESSAGE }
        }
        const fresh = await tx.draftDocument.findFirst({
          where: {
            id: draft.id,
            matterId: draft.matterId,
          },
          select: {
            id: true,
            title: true,
            draftType: true,
            instruction: true,
            content: true,
            chunkIds: true,
            citationSnapshot: true,
            matter: { select: { title: true } },
          },
        })
        if (!fresh) {
          return {
            ok: false as const,
            error: "Draft not found or access denied.",
          }
        }
        const chunks = await loadProvenanceChunks(
          draft.matterId,
          fresh.chunkIds,
          fresh.citationSnapshot,
          tx
        )
        return {
          ok: true as const,
          value: {
            id: fresh.id,
            title: fresh.title,
            draftType: fresh.draftType,
            instruction: fresh.instruction,
            content: fresh.content,
            matterTitle: fresh.matter.title,
            chunks,
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
      indexedChunks = await indexedChunkCount(draft.matterId)
    } catch (err) {
      if (err instanceof Error) {
        console.error(
          "[restoreDraft] indexedChunkCount",
          err.message.slice(0, 240)
        )
      }
      return emptyResult(
        "Unable to verify indexed sources. Retry shortly or check Settings readiness probes."
      )
    }

    const restoredType: DraftType = isDraftType(restored.draftType)
      ? restored.draftType
      : draftType

    return {
      draftId: restored.id,
      matterId: draft.matterId,
      matterTitle: restored.matterTitle,
      title: restored.title,
      draftType: restoredType,
      instruction: restored.instruction,
      content: restored.content ?? "",
      chunks: restored.chunks,
      retrievalCount: restored.chunks.length,
      indexedChunks,
      embeddingConfigured: isEmbeddingConfigured(),
    }
  } catch {
    return emptyResult("Unable to restore draft.")
  }
}

export type DraftDeleteState = {
  error?: string
  success?: boolean
}

export async function deleteDraft(draftId: string): Promise<DraftDeleteState> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return { error: clerk.error }
  const { clerkId } = clerk
  if (!draftId) return { error: "Draft id is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const throttle = await consumeRateLimit(
      destructiveMutationKey(user.id),
      DRAFT_DELETE_RATE_LIMIT
    )
    if (!throttle.ok) {
      return { error: rateLimitMessage("Draft delete", throttle.retryAfterMs) }
    }

    const draft = await prisma.draftDocument.findFirst({
      where: {
        id: draftId,
        OR: [{ userId: user.id }, { matter: matterAccessWhere(user.id) }],
      },
      select: { id: true, matterId: true, title: true, userId: true },
    })
    if (!draft) return { error: "Draft not found or access denied." }

    matterId = draft.matterId
    await prisma.$transaction(async (tx) => {
      const permission = await requireWorkProductDeleteLocked(
        tx,
        user.id,
        draft.matterId,
        draft.userId
      )
      if (!permission.ok) {
        throw new Error(`PERMISSION:${permission.error}`)
      }

      const deleted = await tx.draftDocument.deleteMany({
        where: {
          id: draft.id,
          matterId: draft.matterId,
        },
      })
      if (deleted.count !== 1) {
        throw new Error("PERMISSION:Draft not found or access denied.")
      }
    })

    await recordAuditEvent({
      userId: user.id,
      action: "draft.delete",
      entityType: "draft_document",
      entityId: draft.id,
      matterId: draft.matterId,
      summary: `Deleted draft “${draft.title.slice(0, 80)}”`,
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PERMISSION:")) {
      return { error: error.message.slice("PERMISSION:".length) }
    }
    return { error: "Data layer unreachable. Please try again." }
  }

  revalidatePath("/app/drafting")
  revalidatePath("/app")
  revalidatePath("/app/memory")
  revalidatePath("/app/settings")
  if (matterId) {
    revalidatePath(`/app/matters/${matterId}`)
  }

  return { success: true }
}
