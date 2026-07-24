"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { recordAuditEvent } from "@/lib/audit"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { prisma } from "@/lib/prisma"
import { indexedChunkCount, semanticSearch } from "@/lib/retrieval/search"

export const DRAFT_TYPES = [
  "advice",
  "brief",
  "memo",
  "clause",
] as const

export type DraftType = (typeof DRAFT_TYPES)[number]

export type DraftSourceChunk = {
  id: string
  content: string
  fileName: string
  pageRef: number | null
  headingPath: string | null
  distance: number
}

export type DraftOutput = {
  draftId: string
  matterId: string
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

const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  advice: "Counsel's advice note",
  brief: "Skeleton / brief outline",
  memo: "Internal research memo",
  clause: "Clause analysis note",
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
6. Do not include conversational preamble — return the draft itself.`

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
  chunks: DraftSourceChunk[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return "Draft generation unavailable — OPENAI_API_KEY not configured. Retrieved source excerpts are listed above for manual drafting."
  }

  const context = chunks
    .map((chunk, index) => {
      const src = [
        `Source ${index + 1}: ${chunk.fileName}`,
        chunk.headingPath ? `Section: ${chunk.headingPath}` : null,
        chunk.pageRef ? `Page ${chunk.pageRef}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
      return `[${src}]\n${chunk.content}`
    })
    .join("\n\n---\n\n")

  const { OpenAI } = await import("openai")
  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 2200,
    messages: [
      { role: "system", content: systemPromptFor(draftType) },
      {
        role: "user",
        content: `Draft type: ${DRAFT_TYPE_LABELS[draftType]}\nInstruction: ${instruction}\n\n--- RETRIEVED SOURCES ---\n\n${context}`,
      },
    ],
  })

  return response.choices[0]?.message?.content ?? "No draft generated."
}

export async function generateDraft(
  matterId: string,
  draftTypeInput: string,
  instruction: string
): Promise<DraftOutput> {
  const { userId: clerkId } = await auth()

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

  if (!clerkId) return emptyResult("Authentication required.")
  if (!matterId) return emptyResult("No matter selected.")
  if (!instruction.trim()) return emptyResult("Draft instruction cannot be empty.")
  if (!isDraftType(draftTypeInput)) return emptyResult("Unsupported draft type.")

  const draftType = draftTypeInput

  let user: { id: string } | null = null
  let matter: { id: string; title: string } | null = null
  try {
    user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } })
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

  let chunks: DraftSourceChunk[] = []
  try {
    const raw = await semanticSearch(instruction, matterId, { topK: 8 })
    chunks = raw.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      fileName: chunk.fileName,
      pageRef: chunk.pageRef,
      headingPath: chunk.headingPath,
      distance: chunk.distance,
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Retrieval failed."
    return { ...emptyResult(msg), matterTitle: matter.title, draftType, embeddingConfigured }
  }

  const content = await generateGroundedDraft(draftType, instruction.trim(), chunks)
  const title = draftTitle(draftType, instruction)

  let draftId = ""
  try {
    const draft = await prisma.draftDocument.create({
      data: {
        userId: user.id,
        matterId,
        title,
        draftType,
        instruction: instruction.trim(),
        content,
        chunkIds: chunks.map((chunk) => chunk.id),
        status: "ready",
      },
    })
    draftId = draft.id

    await recordAuditEvent({
      userId: user.id,
      action: "draft.generate",
      entityType: "draft_document",
      entityId: draft.id,
      matterId,
      summary: `Generated ${draftType} draft on “${matter.title}”`,
      metadata: { draftType, chunkCount: chunks.length },
    })

    await prisma.matter.update({
      where: { id: matterId },
      data: { updatedAt: new Date() },
    })
  } catch {
    /* Non-fatal — draft persistence failure should not discard generated content */
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
  }
}

export type DraftDeleteState = {
  error?: string
  success?: boolean
}

export async function deleteDraft(draftId: string): Promise<DraftDeleteState> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return { error: "Authentication required." }
  if (!draftId) return { error: "Draft id is required." }

  let matterId: string | null = null

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) return { error: "Session not found. Please sign in again." }

    const draft = await prisma.draftDocument.findFirst({
      where: { id: draftId, userId: user.id },
      select: { id: true, matterId: true, title: true },
    })
    if (!draft) return { error: "Draft not found or access denied." }

    matterId = draft.matterId
    await prisma.draftDocument.delete({ where: { id: draft.id } })

    await recordAuditEvent({
      userId: user.id,
      action: "draft.delete",
      entityType: "draft_document",
      entityId: draft.id,
      matterId: draft.matterId,
      summary: `Deleted draft “${draft.title.slice(0, 80)}”`,
    })
  } catch {
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
