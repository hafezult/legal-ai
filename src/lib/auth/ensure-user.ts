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
   * When false, skip email auto-accept so `/app/invites/[token]` can show
   * Accept/Decline. Defaults to true for general platform navigation.
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

  try {
    await ensurePersonalOrganization(user)
  } catch {
    /* Organization provisioning is best-effort; retries on next navigation */
  }

  if (shouldAcceptPendingInvites(options)) {
    try {
      await acceptPendingOrganizationInvites(user)
    } catch {
      /* Invite acceptance is best-effort; retries on next navigation */
    }
  }

  return user
}
