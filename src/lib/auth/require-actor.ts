export const AUTH_REQUIRED_ERROR = "Authentication required."
export const IDENTITY_UNAVAILABLE_ERROR =
  "Identity service unavailable. Retry in a moment."
export const SESSION_NOT_FOUND_ERROR =
  "Session not found. Please sign in again."
export const DATA_LAYER_UNREACHABLE_ERROR =
  "Data layer unreachable. Please try again."

export type RequireClerkIdResult =
  | { ok: true; clerkId: string }
  | { ok: false; error: string }

export type RequireActorResult =
  | {
      ok: true
      clerkId: string
      user: { id: string; email: string; name: string | null }
    }
  | { ok: false; error: string }

export type RequireClerkIdDeps = {
  auth: () => Promise<{ userId: string | null }>
}

export type RequireActorDeps = RequireClerkIdDeps & {
  findUserByClerkId: (clerkId: string) => Promise<{
    id: string
    email: string
    name: string | null
  } | null>
}

function defaultClerkIdDeps(): RequireClerkIdDeps {
  return {
    // Lazy imports keep unit tests from loading Clerk/Prisma under node:test.
    auth: async () => {
      const { auth } = await import("@clerk/nextjs/server")
      const session = await auth()
      return { userId: session.userId ?? null }
    },
  }
}

function defaultActorDeps(): RequireActorDeps {
  return {
    ...defaultClerkIdDeps(),
    findUserByClerkId: async (clerkId) => {
      const { prisma } = await import("@/lib/prisma")
      return prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, email: true, name: true },
      })
    },
  }
}

/** True when the caller is simply signed out (not an identity outage). */
export function isAuthRequiredError(error: string): boolean {
  return error === AUTH_REQUIRED_ERROR
}

/**
 * Resolve the signed-in Clerk user id without throwing when identity is down.
 * Server Actions and platform pages should prefer this over bare `auth()` so
 * clients receive structured `{ error }` / WorkspaceLoadError instead of an
 * uncaught failure.
 */
export async function requireClerkId(
  deps: RequireClerkIdDeps = defaultClerkIdDeps()
): Promise<RequireClerkIdResult> {
  try {
    const { userId } = await deps.auth()
    if (!userId) return { ok: false, error: AUTH_REQUIRED_ERROR }
    return { ok: true, clerkId: userId }
  } catch {
    return {
      ok: false,
      error: IDENTITY_UNAVAILABLE_ERROR,
    }
  }
}

/**
 * Resolve Clerk id + persisted app user for mutation entrypoints.
 */
export async function requireActor(
  deps: RequireActorDeps = defaultActorDeps()
): Promise<RequireActorResult> {
  const clerk = await requireClerkId(deps)
  if (!clerk.ok) return clerk

  try {
    const user = await deps.findUserByClerkId(clerk.clerkId)
    if (!user) {
      return { ok: false, error: SESSION_NOT_FOUND_ERROR }
    }
    return { ok: true, clerkId: clerk.clerkId, user }
  } catch {
    return { ok: false, error: DATA_LAYER_UNREACHABLE_ERROR }
  }
}

export type PlatformClerkGate =
  | { status: "ok"; clerkId: string }
  | { status: "unauthenticated" }
  | { status: "unavailable"; error: string }

/**
 * Platform page gate: signed-out vs identity outage vs ready clerk id.
 * Prefer this over bare `auth()` so Clerk failures render WorkspaceLoadError.
 */
export async function resolvePlatformClerkId(
  deps: RequireClerkIdDeps = defaultClerkIdDeps()
): Promise<PlatformClerkGate> {
  const clerk = await requireClerkId(deps)
  if (clerk.ok) return { status: "ok", clerkId: clerk.clerkId }
  if (isAuthRequiredError(clerk.error)) return { status: "unauthenticated" }
  return { status: "unavailable", error: clerk.error }
}
