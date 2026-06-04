import { NextResponse } from "next/server"

import { runIndexingPipeline } from "@/lib/workflows/indexing"

// Allow up to 5 minutes for large documents
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  // Validate internal secret. Development can omit it for local testing, but
  // production must fail closed if the secret has not been configured.
  const secret = process.env.INDEXING_SECRET
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "INDEXING_SECRET is not configured." },
      { status: 500 }
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
