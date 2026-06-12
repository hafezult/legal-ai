function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "")
  }

  return `http://localhost:${process.env.PORT ?? 3000}`
}

export async function triggerDocumentIndexing(documentId: string): Promise<void> {
  const secret = process.env.INDEXING_SECRET
  const response = await fetch(`${appBaseUrl()}/api/index-document/${documentId}`, {
    method: "POST",
    headers: secret ? { "x-aether-secret": secret } : {},
    cache: "no-store",
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { error?: string }
      detail = body.error ?? detail
    } catch {
      /* response was not JSON */
    }

    throw new Error(`Indexing trigger failed (${response.status}): ${detail}`)
  }
}

export function queueDocumentIndexing(documentId: string): void {
  void triggerDocumentIndexing(documentId).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown indexing trigger failure"
    console.error(`[indexing-trigger] ${documentId}: ${message}`)
  })
}
