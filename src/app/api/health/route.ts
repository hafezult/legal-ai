import { NextResponse } from "next/server"

import { getHealthReport } from "@/lib/health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const payload = await getHealthReport()
  return NextResponse.json(payload, {
    status: payload.status === "ok" ? 200 : 503,
  })
}
