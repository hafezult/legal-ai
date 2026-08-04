import { NextResponse } from "next/server"

import {
  AUTH_REQUIRED_ERROR,
  requireClerkId,
} from "@/lib/auth/require-actor"
import {
  PERMISSION_VERIFY_UNAVAILABLE_ERROR,
  matterAccessWhere,
  requireMatterPermissionLocked,
} from "@/lib/auth/rbac"
import { buildContentDisposition } from "@/lib/documents/content-disposition"
import { isDocumentContentPathIds } from "@/lib/documents/content-url"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"
import { clientKeyFromRequest } from "@/lib/request-ip"
import { downloadFromStorage } from "@/lib/storage/documents"

export const maxDuration = 60

/** Authenticated preview/download throttle (parity with upload bursts). */
const CONTENT_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const
/** Pre-auth IP throttle so unauthenticated floods cannot hammer Clerk/Prisma. */
const CONTENT_AUTH_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const

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

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

/**
 * Authenticated document byte proxy.
 *
 * Each request re-checks matter read permission under the matter lock, downloads
 * bytes server-side, then reauths before returning the body so a concurrent
 * revocation cannot receive privileged legal content via a long-lived signed URL.
 */
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ matterId: string; documentId: string }> }
) {
  const authThrottle = await consumeRateLimit(
    `doc-content-auth:${clientKeyFromRequest(request)}`,
    CONTENT_AUTH_RATE_LIMIT
  )
  if (!authThrottle.ok) {
    return rateLimitResponse(
      authThrottle.retryAfterMs,
      "Document download rate limit reached. Retry in about {seconds}."
    )
  }

  const clerk = await requireClerkId()
  if (!clerk.ok) {
    const status = clerk.error === AUTH_REQUIRED_ERROR ? 401 : 503
    return jsonError(clerk.error, status)
  }
  const { clerkId } = clerk

  const { matterId, documentId } = await params
  if (!isDocumentContentPathIds(matterId, documentId)) {
    return jsonError("Document not found or access denied.", 404)
  }

  let userId: string
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) {
      return jsonError("Session not found. Please sign in again.", 401)
    }
    userId = user.id

    const throttle = await consumeRateLimit(
      `doc-content:${user.id}`,
      CONTENT_RATE_LIMIT
    )
    if (!throttle.ok) {
      return rateLimitResponse(
        throttle.retryAfterMs,
        "Document download rate limit reached. Retry in about {seconds}."
      )
    }
  } catch {
    return jsonError("Data layer unreachable. Please try again.", 503)
  }

  let storagePath: string
  let mimeType: string
  let fileName: string

  try {
    const locked = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        userId,
        matterId,
        "read"
      )
      if (!permission.ok) {
        return { status: "denied" as const, error: permission.error }
      }

      const document = await tx.document.findFirst({
        where: {
          id: documentId,
          matterId,
          matter: matterAccessWhere(userId),
        },
        select: {
          storagePath: true,
          mimeType: true,
          fileName: true,
        },
      })
      if (!document?.storagePath) {
        return { status: "missing" as const }
      }

      return {
        status: "ok" as const,
        storagePath: document.storagePath,
        mimeType: document.mimeType ?? "application/octet-stream",
        fileName: document.fileName,
      }
    })

    if (locked.status === "denied") {
      const status =
        locked.error === PERMISSION_VERIFY_UNAVAILABLE_ERROR ? 503 : 404
      return jsonError(
        locked.error ?? "Document not found or access denied.",
        status
      )
    }
    if (locked.status !== "ok") {
      return jsonError("Document not found or access denied.", 404)
    }

    storagePath = locked.storagePath
    mimeType = locked.mimeType
    fileName = locked.fileName
  } catch {
    return jsonError("Data layer unreachable. Please try again.", 503)
  }

  let bytes: ArrayBuffer
  try {
    const { data, error } = await downloadFromStorage(storagePath)
    if (error || !data) {
      return jsonError("Source document unavailable.", 503)
    }
    bytes = await data.arrayBuffer()
  } catch {
    return jsonError("Source document unavailable.", 503)
  }

  // Final locked reauth after the storage download so a concurrent removal
  // cannot receive privileged bytes that were fetched after the first lock.
  try {
    const publishAllowed = await prisma.$transaction(async (tx) => {
      const permission = await requireMatterPermissionLocked(
        tx,
        userId,
        matterId,
        "read"
      )
      if (!permission.ok) return false
      const stillPresent = await tx.document.findFirst({
        where: {
          id: documentId,
          matterId,
          matter: matterAccessWhere(userId),
        },
        select: { id: true },
      })
      return Boolean(stillPresent)
    })
    if (!publishAllowed) {
      return jsonError("Document not found or access denied.", 404)
    }
  } catch {
    return jsonError("Data layer unreachable. Please try again.", 503)
  }

  const disposition =
    new URL(request.url).searchParams.get("download") === "1"
      ? "attachment"
      : "inline"

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": buildContentDisposition(fileName, disposition),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
