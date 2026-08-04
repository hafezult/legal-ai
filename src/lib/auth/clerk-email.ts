/**
 * Pure helpers for selecting a Clerk-backed email that is safe for invite
 * matching. Only verified addresses are persisted / matched so an unverified
 * signup cannot claim an organization invite.
 */

export type ClerkEmailCandidate = {
  id: string
  emailAddress: string
  verificationStatus?: string | null
}

function verifiedClerkEmailEntries(
  emails: ClerkEmailCandidate[]
): ClerkEmailCandidate[] {
  return emails.filter(
    (entry) =>
      entry.verificationStatus === "verified" &&
      Boolean(entry.emailAddress?.trim())
  )
}

/**
 * Returns every distinct lowercased verified Clerk email.
 * Used for invite Accept/Decline authorization when an account has multiple
 * verified addresses.
 */
export function selectVerifiedClerkEmails(
  emails: ClerkEmailCandidate[]
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of verifiedClerkEmailEntries(emails)) {
    const normalized = entry.emailAddress.trim().toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

/** True when the invite target matches any verified Clerk email on the actor. */
export function verifiedClerkEmailMatches(
  verifiedEmails: readonly string[],
  inviteEmail: string | null | undefined
): boolean {
  const target = inviteEmail?.trim().toLowerCase()
  if (!target || verifiedEmails.length === 0) return false
  return verifiedEmails.some((email) => email === target)
}

/**
 * Returns the lowercased verified primary email when available, otherwise the
 * first verified address. Unverified addresses are ignored.
 */
export function selectVerifiedClerkEmail(
  emails: ClerkEmailCandidate[],
  primaryEmailAddressId?: string | null
): string | null {
  const verified = verifiedClerkEmailEntries(emails)
  if (verified.length === 0) return null

  const primary = primaryEmailAddressId
    ? verified.find((entry) => entry.id === primaryEmailAddressId)
    : undefined

  const chosen = primary ?? verified[0]
  return chosen.emailAddress.trim().toLowerCase()
}

/** Stable placeholder used when Clerk has no verified email yet. */
export function unverifiedClerkEmailPlaceholder(clerkId: string): string {
  return `unverified+${clerkId}@users.invalid`
}

/**
 * True when the stored/user-facing email is a placeholder, not a real invite
 * matching address.
 */
export function isUnverifiedClerkEmailPlaceholder(email: string | null | undefined): boolean {
  if (!email) return true
  return email.toLowerCase().endsWith("@users.invalid")
}
