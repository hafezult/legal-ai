import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

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

/**
 * Resolve the signed-in Clerk user id without throwing when identity is down.
 * Server Actions should prefer this over bare `auth()` so clients receive
 * structured `{ error }` instead of an uncaught action failure.
 */
export async function requireClerkId(): Promise<RequireClerkIdResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, error: "Authentication required." }
    return { ok: true, clerkId: userId }
  } catch {
    return {
      ok: false,
      error: "Identity service unavailable. Retry in a moment.",
    }
  }
}

/**
 * Resolve Clerk id + persisted app user for mutation entrypoints.
 */
export async function requireActor(): Promise<RequireActorResult> {
  const clerk = await requireClerkId()
  if (!clerk.ok) return clerk

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: clerk.clerkId },
      select: { id: true, email: true, name: true },
    })
    if (!user) {
      return { ok: false, error: "Session not found. Please sign in again." }
    }
    return { ok: true, clerkId: clerk.clerkId, user }
  } catch {
    return { ok: false, error: "Data layer unreachable. Please try again." }
  }
}
