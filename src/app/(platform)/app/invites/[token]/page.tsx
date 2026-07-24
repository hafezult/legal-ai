import Link from "next/link"
import { notFound } from "next/navigation"

import { ensureAppUser } from "@/lib/auth/ensure-user"
import { prisma } from "@/lib/prisma"
import { AcceptInviteClient } from "./_accept-invite-client"

export const dynamic = "force-dynamic"

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token) notFound()

  const user = await ensureAppUser()
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
      where: { token },
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
      <div className="mx-auto max-w-lg space-y-6 py-10">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Invitation
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96]">
            Invite unavailable
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            This invite link is invalid or has been revoked. Ask an organization
            admin to send a new invitation.
          </p>
        </div>
        <Link
          href="/app/settings"
          className="inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
        >
          Open settings
        </Link>
      </div>
    )
  }

  const expired = invite.expiresAt.getTime() <= Date.now()
  const emailMismatch =
    Boolean(user.email) && invite.email.toLowerCase() !== user.email.toLowerCase()

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Invitation
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96]">
          Join {invite.organizationName}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/45">
          You were invited as <span className="text-white/70">{invite.role}</span>{" "}
          for <span className="text-white/70">{invite.email}</span>.
        </p>
      </div>

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
      ) : emailMismatch ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-amber-400/15 bg-amber-400/[0.04] px-5 py-5">
          <p className="text-sm text-amber-100/70">
            Signed in as {user.email || "unknown"}. Sign in with {invite.email} to
            accept this invite.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white/55 transition-colors hover:border-white/[0.16] hover:text-white/78"
          >
            Switch account
          </Link>
        </div>
      ) : (
        <AcceptInviteClient
          token={token}
          organizationName={invite.organizationName}
          role={invite.role}
        />
      )}
    </div>
  )
}
