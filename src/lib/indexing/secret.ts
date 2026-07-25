import { createHash, timingSafeEqual } from "crypto"

/** Minimum entropy length for production indexing / health-detail secrets. */
export const MIN_SECRET_LENGTH = 32

/** Placeholder values rejected for INDEXING_SECRET outside development. */
const WEAK_INDEXING_SECRETS = new Set([
  "change-me",
  "changeme",
  "secret",
  "password",
  "password1",
  "admin",
  "test",
  "indexing",
  "aether",
  "ci-indexing-secret",
])

/** True when the secret is long enough and not a known placeholder. */
export function isIndexingSecretStrong(secret: string | undefined | null): boolean {
  const trimmed = secret?.trim()
  if (!trimmed) return false
  if (trimmed.length < MIN_SECRET_LENGTH) return false
  return !WEAK_INDEXING_SECRETS.has(trimmed.toLowerCase())
}

function secretDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest()
}

/**
 * Constant-time equality for secret strings.
 * Digests both sides before compare so length differences do not short-circuit.
 * Returns false when either side is empty.
 */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false
  return timingSafeEqual(secretDigest(provided), secretDigest(expected))
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
