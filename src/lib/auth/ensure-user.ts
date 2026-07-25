import { currentUser } from "@clerk/nextjs/server"

import {
  acceptPendingOrganizationInvites,
  ensurePersonalOrganization,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

/**
 * Upserts the signed-in Clerk user into Postgres (idempotent), ensures a
 * personal organization workspace exists, and accepts outstanding invites.
 */
export async function ensureAppUser() {
  const clerkUser = await currentUser()
  if (!clerkUser) {
    return null
  }

  const primary =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress

  // Normalize for unique matching against invites / member-add lookups.
  // Clerk users without an email address get a stable per-user placeholder.
  const email = primary?.trim().toLowerCase() || `unverified+${clerkUser.id}@users.invalid`

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
        email: `unverified+${clerkUser.id}@users.invalid`,
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

  try {
    await acceptPendingOrganizationInvites(user)
  } catch {
    /* Invite acceptance is best-effort; retries on next navigation */
  }

  return user
}
