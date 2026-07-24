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

  const email = primary ?? ""

  const name =
    clerkUser.fullName ||
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    null

  const user = await prisma.user.upsert({
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
