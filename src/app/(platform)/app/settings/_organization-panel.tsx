"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  addOrganizationMember,
  createOrganization,
  deleteOrganization,
  leaveOrganization,
  removeOrganizationMember,
  renameOrganization,
  revokeOrganizationInvite,
  switchActiveOrganization,
  transferOwnership,
  updateOrganizationMemberRole,
  type OrganizationActionState,
} from "./actions"

type MemberRow = {
  id: string
  role: string
  userId: string
  email: string
  name: string | null
  isSelf: boolean
}

type InviteRow = {
  id: string
  email: string
  role: string
  expiresAt: string
  inviteUrl: string
}

type OrganizationOption = {
  id: string
  name: string
  role: string
}

const ROLE_OPTIONS = ["viewer", "member", "admin"] as const

/** Roles the actor may assign (must be strictly below their own rank). */
function assignableRolesFor(actorRole: string): readonly (typeof ROLE_OPTIONS)[number][] {
  if (actorRole === "owner") return ROLE_OPTIONS
  if (actorRole === "admin") return ROLE_OPTIONS.filter((role) => role !== "admin")
  return []
}

function fmtExpiry(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso))
}

function buildMailto(email: string, organizationName: string, inviteUrl: string) {
  const subject = encodeURIComponent(`Join ${organizationName} on Aether`)
  const body = encodeURIComponent(
    [
      `You've been invited to join “${organizationName}” on Aether.`,
      "",
      "1. Sign in (or create an account) with this email address.",
      `2. Open the invite link: ${inviteUrl}`,
      "",
      "The link expires in 14 days.",
    ].join("\n")
  )
  return `mailto:${email}?subject=${subject}&body=${body}`
}

export function OrganizationAccessPanel({
  organizationId,
  organizationName,
  actorRole,
  members,
  invites,
  organizations,
}: {
  organizationId: string
  organizationName: string
  actorRole: string
  members: MemberRow[]
  invites: InviteRow[]
  organizations: OrganizationOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(organizationName)
  const [newOrgName, setNewOrgName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<(typeof ROLE_OPTIONS)[number]>("member")
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [transferMemberId, setTransferMemberId] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const canManage = actorRole === "owner" || actorRole === "admin"
  const isOwner = actorRole === "owner"
  const canLeave = actorRole !== "owner"
  const showSwitcher = organizations.length > 1
  const assignableRoles = assignableRolesFor(actorRole)
  const transferCandidates = members.filter(
    (member) => member.role !== "owner" && !member.isSelf
  )
  const canDeleteOrg = isOwner && organizations.filter((org) => org.role === "owner").length > 1

  const run = useCallback(
    (
      action: () => Promise<OrganizationActionState>,
      successText: string,
      onSuccess?: (result: OrganizationActionState) => void
    ) => {
      setMessage(null)
      startTransition(async () => {
        const result = await action()
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          return
        }
        if (result.inviteCreated && result.inviteUrl) {
          setLastInviteUrl(result.inviteUrl)
        }
        onSuccess?.(result)
        const text =
          result.inviteCreated
            ? result.inviteEmailSent
              ? "Invite emailed and link ready to share."
              : "Invite ready. Copy the link or open mail to deliver it."
            : successText
        setMessage({ type: "success", text })
        router.refresh()
      })
    },
    [router]
  )

  const copyInvite = useCallback(async (inviteId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedInviteId(inviteId)
      setTimeout(() => setCopiedInviteId(null), 2000)
    } catch {
      setMessage({ type: "error", text: "Unable to copy invite link." })
    }
  }, [])

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Organization access
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/40">
            Create additional workspaces, switch the active organization, manage
            role-based membership, and share invite links for colleagues who have
            not signed in yet.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
          Your role · {actorRole}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/32">
            Create organization
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Firm or practice group"
              disabled={isPending}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
            />
            <button
              type="button"
              disabled={isPending || newOrgName.trim().length < 2}
              onClick={() =>
                run(
                  async () => {
                    const result = await createOrganization(newOrgName)
                    if (!result.error) setNewOrgName("")
                    return result
                  },
                  "Organization created and set active."
                )
              }
              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 transition-colors hover:border-white/[0.16] hover:text-white/80 disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </label>

        {showSwitcher ? (
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Active workspace
            </span>
            <select
              value={organizationId}
              disabled={isPending}
              onChange={(e) =>
                run(
                  () => switchActiveOrganization(e.target.value),
                  "Active workspace updated."
                )
              }
              className="mt-2 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} · {org.role}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="self-end rounded-lg border border-white/[0.06] bg-black/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Active workspace
            </p>
            <p className="mt-1 text-sm text-white/55">{organizationName}</p>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.16em] text-white/32">
            Workspace name
          </span>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage || isPending}
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
            />
            {canManage ? (
              <button
                type="button"
                disabled={isPending || name.trim() === organizationName}
                onClick={() =>
                  run(
                    () => renameOrganization(organizationId, name),
                    "Organization renamed."
                  )
                }
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 transition-colors hover:border-white/[0.16] hover:text-white/80 disabled:opacity-40"
              >
                Save
              </button>
            ) : null}
          </div>
        </label>

        {canManage ? (
          <div>
            <span className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Add or invite by email
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@firm.com"
                disabled={isPending}
                className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as (typeof ROLE_OPTIONS)[number])
                }
                disabled={isPending}
                className="rounded-lg border border-white/[0.08] bg-black/25 px-2 py-2 text-sm text-white/70 outline-none"
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isPending || !inviteEmail.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await addOrganizationMember(
                      organizationId,
                      inviteEmail,
                      inviteRole
                    )
                    if (!result.error) setInviteEmail("")
                    return result
                  }, "Member added.")
                }
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 transition-colors hover:border-white/[0.16] hover:text-white/80 disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/28">
              Existing users join immediately. Others get a shareable invite link;
              when Resend is configured the invite is also emailed automatically.
            </p>
          </div>
        ) : (
          <p className="self-end text-sm text-white/35">
            Ask an admin to change membership or roles.
          </p>
        )}
      </div>

      {lastInviteUrl ? (
        <div className="mt-4 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/55">
            Latest invite link
          </p>
          <p className="mt-1 break-all text-xs text-white/55">{lastInviteUrl}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => copyInvite("latest", lastInviteUrl)}
              className="text-[11px] text-white/45 transition-colors hover:text-white/75"
            >
              {copiedInviteId === "latest" ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p
          className={`mt-4 text-xs ${
            message.type === "error" ? "text-amber-200/70" : "text-emerald-200/70"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-white/[0.06]">
        <div className="flex items-center gap-4 border-b border-white/[0.06] bg-black/20 px-4 py-2.5">
          <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
            Member
          </span>
          <span className="w-28 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
            Role
          </span>
          <span className="w-20 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32">
            Actions
          </span>
        </div>
        {members.map((member) => {
          const locked = member.role === "owner"
          // Admins may only manage members strictly below their rank (not peer admins).
          const canEditMember =
            canManage &&
            !locked &&
            (isOwner ||
              assignableRoles.includes(member.role as (typeof ROLE_OPTIONS)[number]))
          return (
            <div
              key={member.id}
              className="flex items-center gap-4 border-t border-white/[0.04] px-4 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/72">
                  {member.name || member.email}
                  {member.isSelf ? (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-white/30">
                      you
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/28">{member.email}</p>
              </div>
              {canEditMember ? (
                <select
                  value={member.role}
                  disabled={isPending}
                  onChange={(e) =>
                    run(
                      () =>
                        updateOrganizationMemberRole(
                          organizationId,
                          member.id,
                          e.target.value
                        ),
                      "Role updated."
                    )
                  }
                  className="w-28 shrink-0 rounded-md border border-white/[0.08] bg-black/25 px-2 py-1.5 text-xs text-white/65 outline-none"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="w-28 shrink-0 text-xs uppercase tracking-[0.08em] text-white/40">
                  {member.role}
                </span>
              )}
              <div className="w-20 shrink-0 text-right">
                {canEditMember && !member.isSelf ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      const confirmed = window.confirm(
                        `Remove ${member.name || member.email} from this organization?`
                      )
                      if (!confirmed) return
                      run(
                        () => removeOrganizationMember(organizationId, member.id),
                        "Member removed."
                      )
                    }}
                    className="text-[11px] text-white/35 transition-colors hover:text-amber-200/70 disabled:opacity-40"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-[11px] text-white/18">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {canManage ? (
        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
            Pending invites
          </p>
          {invites.length === 0 ? (
            <p className="mt-3 text-sm text-white/30">
              No outstanding invites for this workspace.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center gap-3 border-t border-white/[0.04] px-4 py-3 first:border-t-0 sm:flex-nowrap sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/72">{invite.email}</p>
                    <p className="mt-0.5 text-[11px] text-white/28">
                      {invite.role} · expires {fmtExpiry(invite.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => copyInvite(invite.id, invite.inviteUrl)}
                      className="text-[11px] text-white/35 transition-colors hover:text-white/70 disabled:opacity-40"
                    >
                      {copiedInviteId === invite.id ? "Copied" : "Copy link"}
                    </button>
                    <a
                      href={buildMailto(
                        invite.email,
                        organizationName,
                        invite.inviteUrl
                      )}
                      className="text-[11px] text-white/35 transition-colors hover:text-white/70"
                    >
                      Email
                    </a>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Revoke the invite for ${invite.email}? The acceptance link will stop working.`
                        )
                        if (!confirmed) return
                        run(
                          () => revokeOrganizationInvite(organizationId, invite.id),
                          "Invite revoked."
                        )
                      }}
                      className="text-[11px] text-white/35 transition-colors hover:text-amber-200/70 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {canLeave ? (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const confirmed = window.confirm(
                "Leave this organization? You will lose access to its shared matters until invited again."
              )
              if (!confirmed) return
              run(
                () => leaveOrganization(organizationId),
                "You left this organization."
              )
            }}
            className="text-[12px] text-white/35 transition-colors hover:text-amber-200/70 disabled:opacity-40"
          >
            Leave this organization
          </button>
        </div>
      ) : null}

      {isOwner ? (
        <div className="mt-6 space-y-5 border-t border-white/[0.06] pt-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Transfer ownership
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/28">
              Promote another member to owner. You become an admin and can leave
              afterward if needed.
            </p>
            {transferCandidates.length === 0 ? (
              <p className="mt-3 text-sm text-white/30">
                Add another member before transferring ownership.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  value={transferMemberId}
                  onChange={(e) => setTransferMemberId(e.target.value)}
                  disabled={isPending}
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
                >
                  <option value="">Select member</option>
                  {transferCandidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name || member.email} · {member.role}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending || !transferMemberId}
                  onClick={() => {
                    const candidate = transferCandidates.find(
                      (member) => member.id === transferMemberId
                    )
                    const confirmed = window.confirm(
                      `Transfer ownership to ${candidate?.name || candidate?.email || "the selected member"}? You will become an admin.`
                    )
                    if (!confirmed) return
                    run(async () => {
                      const result = await transferOwnership(
                        organizationId,
                        transferMemberId
                      )
                      if (!result.error) setTransferMemberId("")
                      return result
                    }, "Ownership transferred. You are now an admin.")
                  }}
                  className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] text-white/60 transition-colors hover:border-white/[0.16] hover:text-white/80 disabled:opacity-40"
                >
                  Transfer
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              Delete organization
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/28">
              Removes the workspace, memberships, and invites. Matter records stay
              with their creators and are detached from this organization. You must
              keep at least one owned workspace.
            </p>
            {canDeleteOrg ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={`Type “${organizationName}” to confirm`}
                  disabled={isPending}
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white/80 outline-none transition-colors focus:border-white/[0.18] disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={
                    isPending ||
                    deleteConfirmation.replace(/\s+/g, " ").trim().toLowerCase() !==
                      organizationName.toLowerCase()
                  }
                  onClick={() =>
                    run(async () => {
                      const result = await deleteOrganization(
                        organizationId,
                        deleteConfirmation
                      )
                      if (!result.error) setDeleteConfirmation("")
                      return result
                    }, "Organization deleted.")
                  }
                  className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100/70 transition-colors hover:border-amber-400/40 hover:text-amber-100 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/30">
                Create another organization first. Your last owned workspace cannot
                be deleted.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
