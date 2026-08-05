/**
 * Same-origin path for the authenticated document byte proxy.
 * Bytes are authorized per request under the matter lock — never a
 * self-authenticating storage signed URL.
 *
 * Pure helper (no path-alias imports) so node:test can load this module.
 */
export function documentContentPath(
  matterId: string,
  documentId: string
): string {
  return `/api/matters/${matterId}/documents/${documentId}/content`
}
