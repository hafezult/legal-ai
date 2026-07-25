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

function expandIpv6(host: string): number[] | null {
  const raw = host.toLowerCase()
  if (!raw.includes(":")) return null

  // IPv4-mapped dotted form handled by callers before expansion.
  const sides = raw.split("::")
  if (sides.length > 2) return null

  const parseSide = (side: string): number[] | null => {
    if (!side) return []
    const parts = side.split(":")
    const out: number[] = []
    for (const part of parts) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
      out.push(parseInt(part, 16))
    }
    return out
  }

  if (sides.length === 1) {
    const parts = parseSide(sides[0])
    if (!parts || parts.length !== 8) return null
    return parts
  }

  const left = parseSide(sides[0])
  const right = parseSide(sides[1])
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if (missing < 0) return null
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function ipv4FromMappedHex(hextets: number[]): string | null {
  // ::ffff:x.x.x.x stored as 0:0:0:0:0:ffff:HHHH:LLLL
  if (hextets.length !== 8) return null
  const prefixZero = hextets.slice(0, 5).every((part) => part === 0)
  if (!prefixZero || hextets[5] !== 0xffff) return null
  const hi = hextets[6]
  const lo = hextets[7]
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
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
    // IPv4-mapped IPv6 (::ffff:x.x.x.x dotted)
    const mappedDotted = host.match(
      /^(?:0:)*:?ffff:((?:\d{1,3}\.){3}\d{1,3})$/i
    )
    if (mappedDotted) {
      return isNonPublicAppHostname(mappedDotted[1])
    }

    const hextets = expandIpv6(host)
    if (!hextets) {
      // Unparseable IPv6 literals are unsafe as a public app origin.
      return true
    }

    // Unspecified :: and loopback ::1
    if (hextets.every((part) => part === 0)) return true
    if (
      hextets[0] === 0 &&
      hextets[1] === 0 &&
      hextets[2] === 0 &&
      hextets[3] === 0 &&
      hextets[4] === 0 &&
      hextets[5] === 0 &&
      hextets[6] === 0 &&
      hextets[7] === 1
    ) {
      return true
    }

    const mapped = ipv4FromMappedHex(hextets)
    if (mapped) return isNonPublicAppHostname(mapped)

    const first = hextets[0]
    // Unique-local fc00::/7
    if ((first & 0xfe00) === 0xfc00) return true
    // Link-local fe80::/10
    if ((first & 0xffc0) === 0xfe80) return true
    // Deprecated site-local fec0::/10
    if ((first & 0xffc0) === 0xfec0) return true
    // Multicast ff00::/8
    if ((first & 0xff00) === 0xff00) return true

    return false
  }

  const octets = parseIpv4Octets(host)
  if (!octets) return false

  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  // CGNAT shared address space (RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true
  // TEST-NET documentation ranges (RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
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
