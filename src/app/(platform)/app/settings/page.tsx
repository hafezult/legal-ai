import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

import {
  buildInviteAcceptUrl,
  getActiveOrganization,
  isOrgRole,
  listUserOrganizations,
} from "@/lib/auth/rbac"
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
  inviteUrl: string
}

const pillClass: Record<"ready" | "missing", string> = {
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200/70",
  missing: "border-amber-400/20 bg-amber-400/10 text-amber-200/70",
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
  const { userId: clerkId } = await auth()
  if (!clerkId) return null

  const readiness: ReadinessItem[] = [
    {
      label: "Postgres",
      configured: Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL),
      description: "Prisma runtime and migration connections.",
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
      configured: Boolean(process.env.INDEXING_SECRET),
      description: "Internal document indexing endpoint protection.",
    },
    {
      label: "App URL",
      configured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      description: "Absolute callback URL for upload-triggered indexing.",
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

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (user) {
      activity = await prisma.auditEvent.findMany({
        where: { userId: user.id },
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

      organizations = await listUserOrganizations(user.id)
      const active = await getActiveOrganization(user.id)
      if (active) {
        const [memberRows, inviteRows] = await Promise.all([
          prisma.organizationMember.findMany({
            where: { organizationId: active.id },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              role: true,
              userId: true,
              user: { select: { email: true, name: true } },
            },
          }),
          prisma.organizationInvite.findMany({
            where: {
              organizationId: active.id,
              acceptedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              email: true,
              role: true,
              expiresAt: true,
              token: true,
            },
          }),
        ])
        organization = {
          id: active.id,
          name: active.name,
          role: isOrgRole(active.role) ? active.role : "viewer",
          members: memberRows.map((member) => ({
            id: member.id,
            role: member.role,
            userId: member.userId,
            email: member.user.email,
            name: member.user.name,
            isSelf: member.userId === user.id,
          })),
          invites: inviteRows.map((invite) => ({
            id: invite.id,
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            inviteUrl: buildInviteAcceptUrl(invite.token),
          })),
        }
      }
    }
  } catch {
    /* DB unavailable */
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
          Runtime readiness, organization creation, roles, invite delivery,
          integration status, and security posture for the Aether workspace.
        </p>
      </div>

      {organization ? (
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
              Secret values are never displayed. Configure missing services in the
              deployment environment or local `.env.local`.
            </p>
          </div>
          <Link
            href="/app"
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Dashboard
          </Link>
        </div>

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
                    <p className="font-serif text-base text-white/76">{item.label}</p>
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
      </div>

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
              "Owner / admin / member / viewer roles gate write, delete, and membership management. Create additional organizations, switch the active workspace, leave non-owned orgs, and deliver pending invites via copyable links or mailto.",
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
