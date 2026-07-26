import { currentUser } from "@clerk/nextjs/server"

import {
  selectVerifiedClerkEmail,
  unverifiedClerkEmailPlaceholder,
} from "@/lib/auth/clerk-email"
import { shouldAcceptPendingInvites } from "@/lib/auth/invite-auto-accept"
import {
  acceptPendingOrganizationInvites,
  ensurePersonalOrganization,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

export type EnsureAppUserOptions = {
  /**
   * Opt-in only. When true, verified-email invites are auto-joined without
   * switching the active workspace. Defaults to false — membership requires
   * explicit Accept on `/app/invites/[token]` so Decline cannot be bypassed.
   */
  acceptPendingInvites?: boolean
}

/**
 * Upserts the signed-in Clerk user into Postgres (idempotent), ensures a
 * personal organization workspace exists, and optionally accepts outstanding invites.
 */
export async function ensureAppUser(options: EnsureAppUserOptions = {}) {
  const clerkUser = await currentUser()
  if (!clerkUser) {
    return null
  }

  // Only verified Clerk emails are safe for invite auto-accept matching.
  const verifiedEmail = selectVerifiedClerkEmail(
    clerkUser.emailAddresses.map((entry) => ({
      id: entry.id,
      emailAddress: entry.emailAddress,
      verificationStatus: entry.verification?.status ?? null,
    })),
    clerkUser.primaryEmailAddressId
  )
  const email =
    verifiedEmail || unverifiedClerkEmailPlaceholder(clerkUser.id)

  const name =
    clerkUser.fullName ||
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    null

  let user
  try {
    user = await prisma.user.upsert({
      where: { clerkId: clerkUser.id },
      create: {
        clerkId: clerkUser.id,
        email,
        name,
      },
      update: {
        email,
        name,
      },
    })
  } catch {
    // Unique email collisions (shared Clerk email / account reuse) must not
    // block sign-in. Keep the existing row email and fall back to a stable
    // per-Clerk placeholder on first create.
    user = await prisma.user.upsert({
      where: { clerkId: clerkUser.id },
      create: {
        clerkId: clerkUser.id,
        email: unverifiedClerkEmailPlaceholder(clerkUser.id),
        name,
      },
      update: {
        name,
      },
    })
  }

  // Personal-org provisioning must not be swallowed: platform shell and invite
  // pages catch thrown failures and surface WorkspaceLoadError / shellLoadFailed
  // instead of rendering a false empty workspace.
  await ensurePersonalOrganization(user)

  // Invite matching must use the currently verified Clerk email, never a
  // collision-fallback / placeholder persisted on the User row.
  if (shouldAcceptPendingInvites(options) && verifiedEmail) {
    try {
      await acceptPendingOrganizationInvites({
        id: user.id,
        email: verifiedEmail,
      })
    } catch {
      /* Invite acceptance is best-effort; retries on next navigation */
    }
  }

  return user
}
