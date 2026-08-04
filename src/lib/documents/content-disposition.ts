/**
 * Build a safe Content-Disposition value for document byte responses.
 * Strips path segments and control characters so filenames cannot break
 * out of the header or inject unexpected download names.
 */

const CONTROL_OR_SEPARATOR = /[\x00-\x1f\x7f"\\;]/g

/** Basename-only filename safe for a quoted Content-Disposition token. */
export function sanitizeDownloadFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "").replace(CONTROL_OR_SEPARATOR, "_").trim()
  // Avoid empty or dot-only names after sanitization.
  if (!base || /^\.+$/.test(base)) return "document"
  // Cap length so pathological names cannot inflate response headers.
  return base.slice(0, 180)
}

/**
 * `inline` for workstation PDF preview; `attachment` when forcing download.
 * Includes RFC 5987 `filename*` for non-ASCII names.
 */
export function buildContentDisposition(
  fileName: string,
  disposition: "inline" | "attachment" = "inline"
): string {
  const safe = sanitizeDownloadFileName(fileName)
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_") || "document"
  const encoded = encodeURIComponent(safe)
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}
