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
