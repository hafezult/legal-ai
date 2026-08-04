import { NextResponse } from "next/server"

import { isDocumentIdShape } from "@/lib/documents/ids"
import {
  indexingSecretRejectedReason,
  secretsMatch,
} from "@/lib/indexing/secret"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { clientKeyFromRequest } from "@/lib/request-ip"
import {
  isIndexingInProgressError,
  isIndexingRunSupersededError,
  runIndexingPipeline,
} from "@/lib/workflows/indexing"

// Allow up to 5 minutes for large documents
export const maxDuration = 300

const INDEX_HTTP_RATE_LIMIT = { limit: 30, windowMs: 60_000 }
const INDEX_AUTH_RATE_LIMIT = { limit: 60, windowMs: 60_000 }
/** Cluster-/process-wide cap so a valid secret cannot fan out unbounded work. */
const INDEX_GLOBAL_RATE_LIMIT = { limit: 10, windowMs: 60_000 }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  // Throttle before secret checks so weak/missing secrets cannot be probed
  // without bound.
  const authThrottle = await consumeRateLimit(
    `index-http-auth:${clientKeyFromRequest(request)}`,
    INDEX_AUTH_RATE_LIMIT
  )
  if (!authThrottle.ok) {
    return NextResponse.json(
      { error: "Indexing rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(authThrottle.retryAfterMs / 1000)),
        },
      }
    )
  }

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
  if (!documentId || !isDocumentIdShape(documentId)) {
    // Same generic shape as a missing document — do not confirm id validity.
    return NextResponse.json({ error: "Indexing unavailable" }, { status: 404 })
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

  const globalThrottle = await consumeRateLimit(
    "index-http-global",
    INDEX_GLOBAL_RATE_LIMIT
  )
  if (!globalThrottle.ok) {
    return NextResponse.json(
      { error: "Indexing rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(globalThrottle.retryAfterMs / 1000)),
        },
      }
    )
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    })
    if (!document) {
      // Same shape as unauthorized failures once past the secret gate — avoid
      // confirming document existence to holders of a leaked shared secret.
      return NextResponse.json({ error: "Indexing unavailable" }, { status: 404 })
    }

    const result = await runIndexingPipeline(documentId)
    return NextResponse.json({
      ok: true,
      documentId,
      ...(result.warning ? { warning: result.warning } : {}),
    })
  } catch (error) {
    if (isIndexingInProgressError(error) || isIndexingRunSupersededError(error)) {
      return NextResponse.json(
        { error: "Indexing already in progress" },
        { status: 409 }
      )
    }
    const msg = error instanceof Error ? error.message : "Indexing failed"
    console.error(`[/api/index-document/${documentId}]`, msg)
    // Data-layer / provider outages surface as unavailable; unexpected defects
    // still return a generic failure without leaking internals.
    const unavailable =
      /(?:timed?\s*out|ECONN|ENOTFOUND|503|unavailable|prisma|database)/i.test(
        msg
      )
    return NextResponse.json(
      { error: unavailable ? "Indexing unavailable" : "Indexing failed" },
      { status: unavailable ? 503 : 500 }
    )
  }
}
