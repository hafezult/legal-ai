import { NextResponse } from "next/server"

import { getLivenessReport } from "@/lib/health"
import { consumeRateLimit } from "@/lib/rate-limit"
import { clientKeyFromRequest } from "@/lib/request-ip"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const HEALTH_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const

export async function GET(request: Request) {
  // Public probe is process liveness only — no DB/service fan-out.
  // Detailed dependency probes remain on Settings via getHealthReport().
  const throttle = await consumeRateLimit(
    `health:${clientKeyFromRequest(request)}`,
    HEALTH_RATE_LIMIT
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

  const payload = getLivenessReport()
  return NextResponse.json(payload, { status: 200 })
}
