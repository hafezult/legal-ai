import { isDocumentIdShape } from "@/lib/documents/ids"

/**
 * Same-origin path for the authenticated document byte proxy.
 * Bytes are authorized per request under the matter lock — never a
 * self-authenticating storage signed URL.
 */
export function documentContentPath(
  matterId: string,
  documentId: string
): string {
  return `/api/matters/${matterId}/documents/${documentId}/content`
}

/** True when both ids look like persisted cuid-shaped primary keys. */
export function isDocumentContentPathIds(
  matterId: string,
  documentId: string
): boolean {
  return isDocumentIdShape(matterId) && isDocumentIdShape(documentId)
}
