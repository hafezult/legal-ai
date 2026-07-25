import { NextResponse } from "next/server"

import {
  indexingSecretRejectedReason,
  secretsMatch,
} from "@/lib/indexing/secret"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  isIndexingInProgressError,
  isIndexingRunSupersededError,
  runIndexingPipeline,
} from "@/lib/workflows/indexing"

// Allow up to 5 minutes for large documents
export const maxDuration = 300

const INDEX_HTTP_RATE_LIMIT = { limit: 30, windowMs: 60_000 }

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
  if (secret && !secretsMatch(request.headers.get("x-aether-secret"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = await params
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 })
  }

  const throttle = await consumeRateLimit(
    `index-http:${documentId}`,
    INDEX_HTTP_RATE_LIMIT
  )
  if (!throttle.ok) {
    return NextResponse.json(
      { error: "Indexing rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(throttle.retryAfterMs / 1000)),
        },
      }
    )
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
    if (isIndexingInProgressError(error) || isIndexingRunSupersededError(error)) {
      return NextResponse.json(
        { error: "Indexing already in progress" },
        { status: 409 }
      )
    }
    const msg = error instanceof Error ? error.message : "Indexing failed"
    console.error(`[/api/index-document/${documentId}]`, msg)
    return NextResponse.json({ error: "Indexing failed" }, { status: 500 })
  }
}
