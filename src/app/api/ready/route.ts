import { NextResponse } from "next/server"

import { getHealthReport } from "@/lib/health"
import { consumeRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const READY_RATE_LIMIT = { limit: 60, windowMs: 60_000 }

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

/**
 * Deployment readiness probe for load balancers.
 * Returns 503 when critical dependencies (database, Clerk, storage) are missing
 * or degraded. Public responses are status-only; full probe details require
 * `x-aether-health-secret` matching INDEXING_SECRET (or HEALTH_DETAIL_SECRET).
 */
export async function GET(request: Request) {
  const throttle = await consumeRateLimit(
    `ready:${clientKey(request)}`,
    READY_RATE_LIMIT
  )
  if (!throttle.ok) {
    return NextResponse.json(
      { status: "degraded", error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(throttle.retryAfterMs / 1000)),
        },
      }
    )
  }

  const report = await getHealthReport()
  const status = report.status === "ok" ? 200 : 503

  const detailSecret =
    process.env.HEALTH_DETAIL_SECRET?.trim() ||
    process.env.INDEXING_SECRET?.trim()
  const provided = request.headers.get("x-aether-health-secret")
  const wantsDetail = Boolean(detailSecret && provided && provided === detailSecret)

  if (wantsDetail) {
    return NextResponse.json(report, { status })
  }

  return NextResponse.json(
    { status: report.status, checkedAt: report.checkedAt },
    { status }
  )
}
