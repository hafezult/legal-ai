/**
 * Absolute public origin for invite links and outbound email copy.
 * Development may fall back to localhost; deployed environments must set
 * NEXT_PUBLIC_APP_URL so invites never mint broken localhost URLs.
 */

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
    const host = parsed.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
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
        "NEXT_PUBLIC_APP_URL must be an absolute http(s) origin (non-localhost outside development)"
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
 * Outside development, localhost / loopback hosts do not count as ready.
 */
export function isAppUrlConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configured) return false
  return parseAppOrigin(configured, env) !== null
}
