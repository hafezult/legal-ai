import { NextResponse } from "next/server"

import {
  AUTH_REQUIRED_ERROR,
  requireClerkId,
} from "@/lib/auth/require-actor"
import {
  PERMISSION_VERIFY_UNAVAILABLE_ERROR,
  requireMatterPermission,
} from "@/lib/auth/rbac"
import { isDocumentIdShape } from "@/lib/documents/ids"
import {
  ingestUploadedDocument,
  type IngestUploadResult,
} from "@/lib/documents/ingest-upload"
import { ingestUploadHttpStatus } from "@/lib/documents/ingest-upload-status"
import { validateUploadContentLength } from "@/lib/documents/upload"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { clientKeyFromRequest } from "@/lib/request-ip"

export const maxDuration = 300

const UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
/** Pre-auth IP throttle so unauthenticated floods cannot hammer Clerk/Prisma. */
const UPLOAD_AUTH_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const

function jsonResult(result: IngestUploadResult, status = 200) {
  return NextResponse.json(result, { status })
}

function rateLimitResponse(retryAfterMs: number, message: string) {
  const seconds = Math.ceil(retryAfterMs / 1000)
  return NextResponse.json(
    {
      error: message.replace(
        "{seconds}",
        `${seconds} second${seconds === 1 ? "" : "s"}`
      ),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    }
  )
}

/**
 * Document upload route — authenticates and rate-limits before parsing multipart
 * so the global Server Actions body limit can stay small.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matterId: string }> }
) {
  // Throttle by client IP before auth/user lookup (parity with index-document).
  const authThrottle = await consumeRateLimit(
    `upload-auth:${clientKeyFromRequest(request)}`,
    UPLOAD_AUTH_RATE_LIMIT
  )
  if (!authThrottle.ok) {
    return rateLimitResponse(
      authThrottle.retryAfterMs,
      "Upload rate limit reached. Retry in about {seconds}."
    )
  }

  const contentLengthCheck = validateUploadContentLength(
    request.headers.get("content-length")
  )
  if (!contentLengthCheck.ok) {
    return jsonResult(
      { error: contentLengthCheck.error },
      contentLengthCheck.status
    )
  }

  const clerk = await requireClerkId()
  if (!clerk.ok) {
    const status = clerk.error === AUTH_REQUIRED_ERROR ? 401 : 503
    return jsonResult({ error: clerk.error }, status)
  }
  const { clerkId } = clerk

  const { matterId } = await params
  if (!matterId || !isDocumentIdShape(matterId)) {
    return jsonResult({ error: "Matter not found or access denied." }, 404)
  }

  let ownerUserId: string
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) {
      return jsonResult({ error: "Session not found. Please sign in again." }, 401)
    }
    ownerUserId = user.id

    const throttle = await consumeRateLimit(
      `upload:${user.id}`,
      UPLOAD_RATE_LIMIT
    )
    if (!throttle.ok) {
      return rateLimitResponse(
        throttle.retryAfterMs,
        "Upload rate limit reached. Retry in about {seconds}."
      )
    }

    const permission = await requireMatterPermission(user.id, matterId, "write")
    if (!permission.ok) {
      const status =
        permission.error === PERMISSION_VERIFY_UNAVAILABLE_ERROR ? 503 : 403
      return jsonResult({ error: permission.error }, status)
    }
  } catch {
    return jsonResult({ error: "Data layer unreachable. Please try again." }, 503)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return jsonResult({ error: "Could not read upload body." }, 400)
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return jsonResult({ error: "No file provided." }, 400)
  }

  const result = await ingestUploadedDocument({
    clerkId,
    ownerUserId,
    matterId,
    file,
  })

  if (result.error && !result.success) {
    return jsonResult(result, ingestUploadHttpStatus(result))
  }
  return jsonResult(result, 200)
}
