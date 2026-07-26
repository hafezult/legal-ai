/**
 * Derive a rate-limit client key from platform-provided request metadata.
 *
 * Prefer `x-real-ip` only when it looks like a real IP. Garbage or
 * attacker-supplied values fall back to a shared anonymous bucket so they
 * cannot fan out unlimited in-process rate-limit keys.
 */

const MAX_IP_LENGTH = 64

/** Loose IPv4 (decimal octets; rejects obvious non-IP text). */
const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

/** Loose IPv6 (hex groups / compressed forms; brackets optional). */
const IPV6_RE =
  /^(?:\[)?(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?::[0-9a-f]{1,4}){1,6}|:(?::[0-9a-f]{1,4}){1,7}|::|(?:[0-9a-f]{1,4}:){6}(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)|::(?:ffff(?::0{1,4})?:)?(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d))(?:\])?$/i

export function isPlausibleClientIp(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_IP_LENGTH) return false
  if (IPV4_RE.test(trimmed)) return true
  // Strip optional zone id (fe80::1%eth0) before IPv6 check.
  const withoutZone = trimmed.replace(/%[0-9a-z._-]+$/i, "")
  return IPV6_RE.test(withoutZone)
}

/**
 * Rate-limit key for public HTTP routes.
 * Never trusts `x-forwarded-for` chains (client-controllable when untrusted).
 */
export function clientKeyFromRequest(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp && isPlausibleClientIp(realIp)) return realIp
  return "anonymous"
}
