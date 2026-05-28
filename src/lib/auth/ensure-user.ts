import { currentUser } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

/**
 * Upserts the signed-in Clerk user into Postgres (idempotent).
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

  return prisma.user.upsert({
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
}
