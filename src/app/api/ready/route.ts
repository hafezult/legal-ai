import { NextResponse } from "next/server"

import { getHealthReport } from "@/lib/health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Authenticated-deployment readiness probe.
 * Returns 503 when critical dependencies (database, Clerk, storage) are missing
 * or degraded. Optional OpenAI/indexing/Upstash probes stay informational.
 */
export async function GET() {
  const report = await getHealthReport()
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
  })
}
