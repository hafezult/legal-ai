import { NextResponse } from "next/server"

import { runIndexingPipeline } from "@/lib/workflows/indexing"

// Allow up to 5 minutes for large documents
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  // Validate internal secret. Local development may run without one, but deployed
  // environments must configure INDEXING_SECRET before accepting indexing jobs.
  const secret = process.env.INDEXING_SECRET
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "INDEXING_SECRET is required in production" },
      { status: 503 }
    )
  }

  if (secret && request.headers.get("x-aether-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { documentId } = params
  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 })
  }

  try {
    await runIndexingPipeline(documentId)
    return NextResponse.json({ ok: true, documentId })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Indexing failed"
    console.error(`[/api/index-document/${documentId}]`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
