import { timingSafeEqual } from "crypto"

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
 * Constant-time equality for secret strings.
 * Returns false when either side is empty or lengths differ.
 */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Secret that unlocks full `/api/ready` probe details.
 * Prefers HEALTH_DETAIL_SECRET, then INDEXING_SECRET. Weak placeholders never unlock.
 */
export function resolveHealthDetailSecret(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const preferred = env.HEALTH_DETAIL_SECRET?.trim()
  if (preferred && isIndexingSecretStrong(preferred)) return preferred
  const fallback = env.INDEXING_SECRET?.trim()
  if (fallback && isIndexingSecretStrong(fallback)) return fallback
  return null
}

/** True when the request header matches a strong health-detail secret. */
export function canRevealHealthDetails(
  provided: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return secretsMatch(provided, resolveHealthDetailSecret(env))
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
