import { NextResponse } from "next/server"

import { getHealthReport } from "@/lib/health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const payload = await getHealthReport()
  // Public probe returns aggregate status only — detailed probes stay on Settings.
  return NextResponse.json(
    { status: payload.status, checkedAt: payload.checkedAt },
    {
      status: payload.status === "ok" ? 200 : 503,
    }
  )
}
