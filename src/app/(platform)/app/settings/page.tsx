import Link from "next/link"

import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  getActiveOrganization,
  isOrgRole,
  listUserOrganizations,
  roleAtLeast,
  roleHasPermission,
  roleStrictlyAbove,
} from "@/lib/auth/rbac"
import { isAppUrlConfigured } from "@/lib/app-url"
import { getHealthReport, type HealthReport } from "@/lib/health"
import { isIndexingSecretStrong } from "@/lib/indexing/secret"
import { prisma } from "@/lib/prisma"
import { OrganizationAccessPanel } from "./_organization-panel"

export const dynamic = "force-dynamic"

type ReadinessItem = {
  label: string
  configured: boolean
  description: string
}

type ActivityEvent = {
  id: string
  action: string
  entityType: string
  summary: string
  matterId: string | null
  createdAt: Date
}

type OrgMemberRow = {
  id: string
  role: string
  userId: string
  email: string
  name: string | null
  isSelf: boolean
}

type OrgInviteRow = {
  id: string
  email: string
  role: string
  expiresAt: string
}

const pillClass: Record<"ready" | "missing" | "degraded" | "ok", string> = {
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200/70",
  ok: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200/70",
  missing: "border-amber-400/20 bg-amber-400/10 text-amber-200/70",
  degraded: "border-red-400/20 bg-red-400/10 text-red-200/70",
}

function fmtShortDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

function actionLabel(action: string) {
  return action.replace(/\./g, " · ")
}

export default async function SettingsPage() {
  const session = await resolvePlatformClerkId()
  if (session.status === "unauthenticated") return null
  if (session.status === "unavailable") {
    return (
      <WorkspaceLoadError
        title="Identity service unavailable"
        description={session.error}
        homeHref="/app"
      />
    )
  }
  const { clerkId } = session


  const readiness: ReadinessItem[] = [
    {
      label: "Postgres (runtime)",
      configured: Boolean(process.env.DATABASE_URL),
      description:
        "Prisma runtime connection used by the app and /api/ready. Matches the readiness probe DATABASE_URL check.",
    },
    {
      label: "Postgres (migrations)",
      configured: Boolean(process.env.DIRECT_URL),
      description:
        "Direct PostgreSQL URL for prisma migrate deploy. Required for schema changes; not probed by /api/ready.",
    },
    {
      label: "Clerk",
      configured: Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
      ),
      description: "Authentication and server-side user sync.",
    },
    {
      label: "Supabase Storage",
      configured: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      description: "Document upload and retrieval storage.",
    },
    {
      label: "OpenAI",
      configured: Boolean(process.env.OPENAI_API_KEY),
      description: "Embeddings, semantic search, grounded answers, and drafting.",
    },
    {
      label: "Indexing secret",
      configured: isIndexingSecretStrong(process.env.INDEXING_SECRET),
      description:
        "Optional HTTP indexing route protection (upload/reindex run in-process). Secrets shorter than 32 characters, with fewer than 10 distinct characters, or placeholders such as change-me do not count as configured.",
    },
    {
      label: "Health detail secret",
      configured: isIndexingSecretStrong(process.env.HEALTH_DETAIL_SECRET),
      description:
        "Optional preferred secret for full /api/ready probe details via x-aether-health-secret. Same strength rules as INDEXING_SECRET; when unset, a strong INDEXING_SECRET remains an accepted fallback.",
    },
    {
      label: "App URL",
      configured: isAppUrlConfigured(),
      description:
        "Absolute origin for invite acceptance links and email copy. Outside development, localhost / loopback / private network hosts do not count as configured.",
    },
    {
      label: "Invite email (Resend)",
      configured: Boolean(process.env.RESEND_API_KEY),
      description:
        "Optional outbound invite delivery. Without it, invites still work via copyable links and mailto.",
    },
    {
      label: "Upstash Redis",
      configured: Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() &&
          process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
      ),
      description:
        "Optional shared rate limits across instances. Without it, expensive actions use in-process limits.",
    },
  ]

  let activity: ActivityEvent[] = []
  let organization: {
    id: string
    name: string
    role: string
    members: OrgMemberRow[]
    invites: OrgInviteRow[]
  } | null = null
  let organizations: { id: string; name: string; role: string }[] = []
  let health: HealthReport | null = null
  let canViewHealthDetails = false
  let canManageMembers = false
  let loadFailed = false

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) {
      loadFailed = true
    } else {
      organizations = await listUserOrganizations(user.id)
      const active = await getActiveOrganization(user.id)
      const activeRole =
        active && isOrgRole(active.role) ? active.role : "viewer"
      canManageMembers = roleHasPermission(activeRole, "manage_members")
      // Dependency probe details are admin/owner-only (not every signed-in role).
      canViewHealthDetails = roleAtLeast(activeRole, "admin")

      if (canViewHealthDetails) {
        try {
          health = await getHealthReport()
        } catch {
          health = null
        }
      }

      // Membership/invite events include emails — only owners/admins see them.
      const memberAdminActions = [
        "organization.invite_create",
        "organization.invite_revoke",
        "organization.invite_refresh",
        "organization.invite_accept",
        "organization.invite_reject",
        "organization.member_add",
        "organization.member_role",
        "organization.member_remove",
        "organization.ownership_transfer",
      ] as const

      // Scope activity via organizationId: active-org events, plus the actor's
      // personal/legacy (organizationId null) trail. Do not leak other orgs.
      activity = await prisma.auditEvent.findMany({
        where: {
          AND: [
            {
              OR: [
                ...(active ? [{ organizationId: active.id }] : []),
                {
                  userId: user.id,
                  organizationId: null,
                  OR: [
                    { matterId: null },
                    { matter: { userId: user.id, organizationId: null } },
                  ],
                },
              ],
            },
            ...(canManageMembers
              ? []
              : [{ NOT: { action: { in: [...memberAdminActions] } } }]),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          action: true,
          entityType: true,
          summary: true,
          matterId: true,
          createdAt: true,
        },
      })

      if (active) {
        const canManageInvites = canManageMembers

        const [memberRows, inviteRows] = await Promise.all([
          prisma.organizationMember.findMany({
            where: { organizationId: active.id },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            take: 200,
            select: {
              id: true,
              role: true,
              userId: true,
              user: { select: { email: true, name: true } },
            },
          }),
          // Raw invite tokens are never stored or serialized; admins mint a
          // fresh link via refreshOrganizationInviteLink when copying.
          canManageInvites
            ? prisma.organizationInvite.findMany({
                where: {
                  organizationId: active.id,
                  acceptedAt: null,
                  expiresAt: { gt: new Date() },
                },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                  id: true,
                  email: true,
                  role: true,
                  expiresAt: true,
                },
              })
            : Promise.resolve([]),
        ])
        organization = {
          id: active.id,
          name: active.name,
          role: activeRole,
          members: memberRows.map((member) => {
            const isSelf = member.userId === user.id
            return {
              id: member.id,
              role: member.role,
              userId: member.userId,
              // Member emails are admin/owner-only; others see names/roles (+ self).
              email:
                canManageMembers || isSelf
                  ? member.user.email
                  : "",
              name: member.user.name,
              isSelf,
            }
          }),
          invites: inviteRows
            .filter(
              (invite) =>
                isOrgRole(invite.role) &&
                roleStrictlyAbove(activeRole, invite.role)
            )
            .map((invite) => ({
              id: invite.id,
              email: invite.email,
              role: invite.role,
              expiresAt: invite.expiresAt.toISOString(),
            })),
        }
      }
    }
  } catch {
    loadFailed = true
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Administration
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Runtime readiness, organization creation, ownership transfer, invite
          delivery, integration status, and security posture for the Aether
          workspace.
        </p>
      </div>

      {loadFailed ? (
        <WorkspaceLoadError title="Organization settings unavailable" />
      ) : null}

      {!loadFailed && organization ? (
        <OrganizationAccessPanel
          organizationId={organization.id}
          organizationName={organization.name}
          actorRole={organization.role}
          members={organization.members}
          invites={organization.invites}
          organizations={organizations}
        />
      ) : null}

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
              Environment
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/40">
              Secret values are never displayed. Public{" "}
              <code className="text-white/55">/api/health</code> is process
              liveness only; public{" "}
              <code className="text-white/55">/api/ready</code> returns status
              without probe details. Live dependency probes and environment
              readiness below are visible to organization admins and owners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {health ? (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                  pillClass[health.status === "ok" ? "ok" : "degraded"]
                }`}
              >
                Live {health.status}
              </span>
            ) : null}
            <Link
              href="/app"
              className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {canViewHealthDetails ? (
          <>
            {health ? (
              <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(health.probes).map(([key, probe]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-base capitalize text-white/76">
                          {key}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/35">
                          {probe.detail}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${pillClass[probe.status]}`}
                      >
                        {probe.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {readiness.map((item) => {
                const state = item.configured ? "ready" : "missing"
                return (
                  <div
                    key={item.label}
                    className="rounded-lg border border-white/[0.06] bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-base text-white/76">
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/35">
                          {item.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${pillClass[state]}`}
                      >
                        {item.configured ? "Ready" : "Missing"}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm leading-relaxed text-white/35">
            Ask an organization admin or owner to review dependency readiness and
            environment configuration.
          </p>
        )}
      </div>

      {!loadFailed ? (
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                Activity trail
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/40">
                Ownership-scoped audit events for matter, document, research,
                conversation, draft, and organization mutations.
              </p>
            </div>
            <p className="text-xs tabular-nums text-white/28">
              {activity.length} recent event{activity.length === 1 ? "" : "s"}
            </p>
          </div>

          {activity.length === 0 ? (
            <div className="mt-6 rounded-lg border border-white/[0.06] bg-black/20 px-5 py-10 text-center">
              <p className="font-serif text-base text-white/45">No audit events yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-white/28">
                Create matters, upload sources, run research, or manage conversations to
                populate the workspace trail.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-white/[0.06]">
              <div className="flex items-center gap-4 border-b border-white/[0.06] bg-black/20 px-4 py-2.5">
                <span className="w-40 shrink-0 text-[10px] uppercase tracking-[0.16em] text-white/32">
                  Action
                </span>
                <span className="min-w-0 flex-1 text-[10px] uppercase tracking-[0.16em] text-white/32">
                  Summary
                </span>
                <span className="hidden w-28 shrink-0 text-right text-[10px] uppercase tracking-[0.16em] text-white/32 sm:block">
                  When
                </span>
              </div>
              {activity.map((event) => {
                const row = (
                  <div className="flex items-center gap-4 border-t border-white/[0.04] px-4 py-3 first:border-t-0">
                    <span className="w-40 shrink-0 truncate text-[11px] uppercase tracking-[0.08em] text-white/40">
                      {actionLabel(event.action)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/72">{event.summary}</p>
                      <p className="mt-0.5 text-[11px] text-white/28">{event.entityType}</p>
                    </div>
                    <span className="hidden w-28 shrink-0 text-right text-xs text-white/25 sm:block">
                      {fmtShortDate(event.createdAt)}
                    </span>
                  </div>
                )

                if (event.matterId) {
                  return (
                    <Link
                      key={event.id}
                      href={`/app/matters/${event.matterId}`}
                      className="block transition-colors duration-150 hover:bg-white/[0.025]"
                    >
                      {row}
                    </Link>
                  )
                }

                return (
                  <div key={event.id} className="block">
                    {row}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            label: "Authentication boundary",
            value: "Clerk-protected platform routes with organization-aware data access.",
          },
          {
            label: "Matter isolation",
            value:
              "Documents, chunks, and research sessions query through owned or shared organization matters.",
          },
          {
            label: "Role controls",
            value:
              "Owner / admin / member / viewer roles gate write, delete, and membership management. Create or delete organizations, transfer ownership, switch the active workspace, leave non-owned orgs, and deliver pending invites via Resend, copyable links, or mailto.",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--aether-radius-card)] border border-white/[0.07] bg-white/[0.02] p-5"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/32">
              {item.label}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
