import { NextResponse } from "next/server"

import { getLivenessReport } from "@/lib/health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  // Public probe is process liveness only — no DB/service fan-out.
  // Detailed dependency probes remain on Settings via getHealthReport().
  // No rate limit: load balancers must not receive 429 on a static ok payload.
  // Readiness (/api/ready) remains locally rate-limited + cached.
  const payload = getLivenessReport()
  return NextResponse.json(payload, { status: 200 })
}
