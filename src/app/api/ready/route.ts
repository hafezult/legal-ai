import { NextResponse } from "next/server"

import { getHealthReport, type HealthReport } from "@/lib/health"
import { canRevealHealthDetails } from "@/lib/indexing/secret"
import { consumeRateLimit } from "@/lib/rate-limit"
import { clientKeyFromRequest } from "@/lib/request-ip"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const READY_RATE_LIMIT = { limit: 60, windowMs: 60_000 }
const READY_CACHE_TTL_MS = 5_000

type CachedReport = {
  expiresAt: number
  report: HealthReport
}

let cachedReport: CachedReport | null = null

async function loadHealthReport(): Promise<HealthReport> {
  const now = Date.now()
  if (cachedReport && cachedReport.expiresAt > now) {
    return cachedReport.report
  }

  const report = await getHealthReport()
  cachedReport = {
    expiresAt: now + READY_CACHE_TTL_MS,
    report,
  }
  return report
}

/**
 * Deployment readiness probe for load balancers.
 * Returns 503 when critical dependencies (database, Clerk, storage) are missing
 * or degraded. Public responses are status-only; full probe details require
 * `x-aether-health-secret` matching a strong HEALTH_DETAIL_SECRET or INDEXING_SECRET.
 */
export async function GET(request: Request) {
  const throttle = await consumeRateLimit(
    `ready:${clientKeyFromRequest(request)}`,
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

  const report = await loadHealthReport()
  const status = report.status === "ok" ? 200 : 503
  const wantsDetail = canRevealHealthDetails(
    request.headers.get("x-aether-health-secret")
  )

  if (wantsDetail) {
    return NextResponse.json(report, { status })
  }

  return NextResponse.json(
    { status: report.status, checkedAt: report.checkedAt },
    { status }
  )
}
