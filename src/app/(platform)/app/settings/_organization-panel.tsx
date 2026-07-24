"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  addOrganizationMember,
  removeOrganizationMember,
  renameOrganization,
  revokeOrganizationInvite,
  switchActiveOrganization,
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
}

type OrganizationOption = {
  id: string
  name: string
  role: string
}

const ROLE_OPTIONS = ["viewer", "member", "admin"] as const

function fmtExpiry(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso))
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
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<(typeof ROLE_OPTIONS)[number]>("member")
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const canManage = actorRole === "owner" || actorRole === "admin"
  const showSwitcher = organizations.length > 1

  const run = useCallback(
    (action: () => Promise<OrganizationActionState>, successText: string) => {
      setMessage(null)
      startTransition(async () => {
        const result = await action()
        if (result.error) {
          setMessage({ type: "error", text: result.error })
          return
        }
        const text =
          result.inviteCreated
            ? "Invite created. Membership activates when they sign in."
            : successText
        setMessage({ type: "success", text })
        router.refresh()
      })
    },
    [router]
  )

  return (
    <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Organization access
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/40">
            Switch the active workspace, manage role-based membership, and invite
            colleagues before they sign in. Owners and admins manage the roster;
            members can write; viewers are read-only.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
          Your role · {actorRole}
        </span>
      </div>

      {showSwitcher ? (
        <label className="mt-6 block max-w-md">
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
      ) : null}

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
                {ROLE_OPTIONS.map((role) => (
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
              Existing users join immediately. Others receive a pending invite that
              activates on first sign-in.
            </p>
          </div>
        ) : (
          <p className="self-end text-sm text-white/35">
            Ask an admin to change membership or roles.
          </p>
        )}
      </div>

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
              {canManage && !locked ? (
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
                  {ROLE_OPTIONS.map((role) => (
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
                {canManage && !locked && !member.isSelf ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => removeOrganizationMember(organizationId, member.id),
                        "Member removed."
                      )
                    }
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
                  className="flex items-center gap-4 border-t border-white/[0.04] px-4 py-3 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/72">{invite.email}</p>
                    <p className="mt-0.5 text-[11px] text-white/28">
                      {invite.role} · expires {fmtExpiry(invite.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => revokeOrganizationInvite(organizationId, invite.id),
                        "Invite revoked."
                      )
                    }
                    className="text-[11px] text-white/35 transition-colors hover:text-amber-200/70 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
