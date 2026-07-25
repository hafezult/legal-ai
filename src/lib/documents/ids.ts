/**
 * Prisma `@default(cuid())` ids are lowercase `c` + 24 cuid alphabet chars.
 * Accept a slightly wider length band so cuid2-style ids remain valid if the
 * generator changes, while still rejecting path junk and probe strings.
 */
const DOCUMENT_ID_RE = /^c[a-z0-9]{24,32}$/

/** True when `value` looks like a persisted Document id. */
export function isDocumentIdShape(value: string): boolean {
  return DOCUMENT_ID_RE.test(value)
}
