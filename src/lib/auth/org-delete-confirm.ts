/**
 * Normalize confirmation text typed for organization delete.
 * Collapses internal whitespace so accidental double spaces do not block a
 * correct name match while still requiring a non-empty confirmation.
 */
export function normalizeOrgConfirmationName(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Final gate for organization delete confirmation.
 *
 * Callers must evaluate this against the organization name read under
 * Organization FOR UPDATE — never against a pre-lock snapshot alone. A
 * concurrent rename between the unlocked probe and the locked delete must not
 * let a stale confirmation string authorize destruction of the renamed org.
 */
export function orgDeleteConfirmationMatches(
  confirmationName: string,
  lockedOrganizationName: string
): boolean {
  const confirmed = normalizeOrgConfirmationName(confirmationName)
  if (!confirmed) return false
  return confirmed.toLowerCase() === lockedOrganizationName.toLowerCase()
}
