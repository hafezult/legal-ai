/** Placeholder values rejected for INDEXING_SECRET outside development. */
const WEAK_INDEXING_SECRETS = new Set([
  "change-me",
  "changeme",
  "secret",
  "password",
  "test",
  "indexing",
  "aether",
])

/** True when the secret is non-empty and not a known placeholder. */
export function isIndexingSecretStrong(secret: string | undefined | null): boolean {
  const trimmed = secret?.trim()
  if (!trimmed) return false
  return !WEAK_INDEXING_SECRETS.has(trimmed.toLowerCase())
}

/**
 * Reason the HTTP indexing route should reject the current env, or null when ok.
 * Local development may omit the secret entirely.
 */
export function indexingSecretRejectedReason(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (env.NODE_ENV === "development") {
    return null
  }
  const secret = env.INDEXING_SECRET
  if (!secret?.trim()) {
    return "INDEXING_SECRET is not configured"
  }
  if (!isIndexingSecretStrong(secret)) {
    return "INDEXING_SECRET is too weak for production"
  }
  return null
}
