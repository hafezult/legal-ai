export type IngestUploadStatusInput = {
  error?: string
  success?: boolean
  unavailable?: boolean
}

/** Map ingest failures to HTTP status (infra outages → 503, validation → 400). */
export function ingestUploadHttpStatus(result: IngestUploadStatusInput): number {
  if (!result.error || result.success) return 200
  return result.unavailable ? 503 : 400
}
