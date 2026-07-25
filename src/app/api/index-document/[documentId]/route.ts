import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import {
  isIndexingInProgressError,
  runIndexingPipeline,
} from "@/lib/workflows/indexing"

// Allow up to 5 minutes for large documents
export const maxDuration = 300

const WEAK_INDEXING_SECRETS = new Set([
  "change-me",
  "changeme",
  "secret",
  "password",
  "test",
  "indexing",
  "aether",
])

function indexingSecretRejectedReason(): string | null {
  const secret = process.env.INDEXING_SECRET
  if (process.env.NODE_ENV === "development") {
    return null
  }
  if (!secret) {
    return "INDEXING_SECRET is not configured"
  }
  if (WEAK_INDEXING_SECRETS.has(secret.toLowerCase())) {
    return "INDEXING_SECRET is too weak for production"
  }
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  // Validate internal secret. Local development may omit it, but deployed
  // environments must configure a non-trivial INDEXING_SECRET.
  const rejected = indexingSecretRejectedReason()
  if (rejected) {
    console.error("[/api/index-document] indexing secret rejected:", rejected)
    return NextResponse.json(
      { error: "Indexing endpoint is unavailable" },
      { status: 503 }
    )
  }

  const secret = process.env.INDEXING_SECRET
  if (secret && request.headers.get("x-aether-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 })
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  })
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  try {
    await runIndexingPipeline(documentId)
    return NextResponse.json({ ok: true, documentId })
  } catch (error) {
    if (isIndexingInProgressError(error)) {
      return NextResponse.json(
        { error: "Indexing already in progress" },
        { status: 409 }
      )
    }
    const msg = error instanceof Error ? error.message : "Indexing failed"
    console.error(`[/api/index-document/${documentId}]`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
