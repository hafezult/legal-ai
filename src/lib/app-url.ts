/**
 * Absolute public origin for invite links and outbound email copy.
 * Development may fall back to localhost; deployed environments must set
 * NEXT_PUBLIC_APP_URL so invites never mint broken localhost URLs.
 */
export function resolveAppBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, "")
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

  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    return false
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false
  }

  if (env.NODE_ENV === "development") return true

  const host = parsed.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return false
  }
  return true
}
