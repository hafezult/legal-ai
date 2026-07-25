import { createHash, randomBytes } from "node:crypto"

/** Invite tokens are 24 random bytes encoded as 48 hex chars. */
export function isInviteTokenShape(token: string): boolean {
  return /^[a-f0-9]{48}$/i.test(token)
}

/** Generate a new opaque invite token (raw value for URLs only). */
export function generateInviteToken(): string {
  return randomBytes(24).toString("hex")
}

/** SHA-256 hex digest stored at rest; never persist the raw token. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
