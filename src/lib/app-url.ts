/**
 * Absolute public origin for invite links and outbound email copy.
 * Development may fall back to localhost; deployed environments must set
 * NEXT_PUBLIC_APP_URL so invites never mint broken localhost / private URLs.
 */

function isIpv4Literal(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
}

function parseIpv4Octets(host: string): number[] | null {
  if (!isIpv4Literal(host)) return null
  const octets = host.split(".").map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return octets
}

/** True for loopback, RFC1918, link-local, and common metadata ranges. */
export function isNonPublicAppHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "0:0:0:0:0:0:0:1") {
      return true
    }

    // Unique-local (fc00::/7) / link-local (fe80::/10) IPv6
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    ) {
      return true
    }

    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    const mapped = host.match(/^(?:0:)*:?ffff:((?:\d{1,3}\.){3}\d{1,3})$/i)
    if (mapped) {
      return isNonPublicAppHostname(mapped[1])
    }

    return false
  }

  const octets = parseIpv4Octets(host)
  if (!octets) return false

  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function parseAppOrigin(
  configured: string,
  env: NodeJS.ProcessEnv
): string | null {
  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    return null
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null
  }

  if (env.NODE_ENV !== "development") {
    if (isNonPublicAppHostname(parsed.hostname)) {
      return null
    }
  }

  return parsed.origin
}

export function resolveAppBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    const origin = parseAppOrigin(configured, env)
    if (!origin) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be an absolute http(s) origin (non-localhost / non-private outside development)"
      )
    }
    return origin
  }
  if (env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }
  throw new Error("NEXT_PUBLIC_APP_URL is not configured")
}

/**
 * True when NEXT_PUBLIC_APP_URL is set to a usable absolute origin.
 * Outside development, localhost / loopback / private hosts do not count as ready.
 */
export function isAppUrlConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configured) return false
  return parseAppOrigin(configured, env) !== null
}
