import type { ReactNode } from "react"
import Link from "next/link"
import { currentUser } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import {
  selectVerifiedClerkEmail,
  selectVerifiedClerkEmails,
  verifiedClerkEmailMatches,
} from "@/lib/auth/clerk-email"
import { ensureAppUser } from "@/lib/auth/ensure-user"
import { hashInviteToken, isInviteTokenShape } from "@/lib/auth/invite-token"
import { prisma } from "@/lib/prisma"
import { AcceptInviteClient } from "./_accept-invite-client"

export const dynamic = "force-dynamic"

function InviteShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Invitation
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/45">{description}</p>
      </div>
      {children}
    </div>
  )
}

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token || !isInviteTokenShape(token)) notFound()

  // Skip email auto-accept so Accept/Decline controls remain reachable.
  const user = await ensureAppUser({ acceptPendingInvites: false })
  if (!user) return null

  let invite: {
    email: string
    role: string
    expiresAt: Date
    acceptedAt: Date | null
    organizationName: string
  } | null = null

  try {
    const row = await prisma.organizationInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        organization: { select: { name: true } },
      },
    })
    if (row) {
      invite = {
        email: row.email,
        role: row.role,
        expiresAt: row.expiresAt,
        acceptedAt: row.acceptedAt,
        organizationName: row.organization.name,
      }
    }
  } catch {
    /* DB unavailable */
  }

  if (!invite) {
    return (
      <InviteShell
        title="Invite unavailable"
        description="This invite link is invalid or has been revoked. Ask an organization admin to send a new invitation."
      >
        <Link
          href="/app/settings"
          className="inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
        >
          Open settings
        </Link>
      </InviteShell>
    )
  }

  // Authorize against currently verified Clerk emails — never the persisted DB
  // address (placeholders / stale after verification revoke). Any verified
  // address on the account may match the invite target.
  let signedInEmails: string[] = []
  let signedInEmail: string | null = null
  try {
    const clerkUser = await currentUser()
    if (clerkUser) {
      const candidates = clerkUser.emailAddresses.map((entry) => ({
        id: entry.id,
        emailAddress: entry.emailAddress,
        verificationStatus: entry.verification?.status ?? null,
      }))
      signedInEmails = selectVerifiedClerkEmails(candidates)
      signedInEmail = selectVerifiedClerkEmail(
        candidates,
        clerkUser.primaryEmailAddressId
      )
    }
  } catch {
    signedInEmails = []
    signedInEmail = null
  }

  const emailMatches = verifiedClerkEmailMatches(signedInEmails, invite.email)

  // Do not reveal organization name, role, or invited email until the signed-in
  // account matches the invite target.
  if (!emailMatches) {
    return (
      <InviteShell
        title="Invitation"
        description="Sign in with the email address that received this invite to view and accept it."
      >
        <div className="rounded-[var(--aether-radius-panel)] border border-amber-400/15 bg-amber-400/[0.04] px-5 py-5">
          <p className="text-sm text-amber-100/70">
            Signed in as{" "}
            {signedInEmail && !signedInEmail.toLowerCase().endsWith("@users.invalid")
              ? signedInEmail
              : "an unmatched account"}
            . Switch accounts to continue.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
          >
            Switch account
          </Link>
        </div>
      </InviteShell>
    )
  }

  const expired = invite.expiresAt.getTime() <= new Date().getTime()

  return (
    <InviteShell
      title={`Join ${invite.organizationName}`}
      description={`You were invited as ${invite.role} for ${invite.email}.`}
    >
      {invite.acceptedAt ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] px-5 py-5">
          <p className="text-sm text-white/55">This invite was already accepted.</p>
          <Link
            href="/app/settings"
            className="mt-4 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
          >
            Continue to settings
          </Link>
        </div>
      ) : expired ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-amber-400/15 bg-amber-400/[0.04] px-5 py-5">
          <p className="text-sm text-amber-100/70">
            This invite expired on{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(invite.expiresAt)}
            . Ask an admin to send a fresh invite.
          </p>
        </div>
      ) : (
        <AcceptInviteClient
          token={token}
          organizationName={invite.organizationName}
          role={invite.role}
        />
      )}
    </InviteShell>
  )
}
