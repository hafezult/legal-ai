import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type WorkspaceUser = {
  email: string
  name: string | null
  createdAt: Date
  _count: {
    matters: number
    researchSessions: number
  }
}

function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function ConfigRow({
  label,
  detail,
  configured,
}: {
  label: string
  detail: string
  configured: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] py-3 first:border-t-0">
      <div>
        <p className="text-sm text-white/62">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/28">{detail}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
          configured
            ? "border-white/[0.16] bg-white/[0.04] text-white/70"
            : "border-amber-400/[0.18] bg-amber-400/[0.04] text-amber-400/58"
        }`}
      >
        {configured ? "Configured" : "Missing"}
      </span>
    </div>
  )
}

export default async function SettingsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let workspaceUser: WorkspaceUser | null = null
  let documentCount = 0
  let chunkCount = 0
  let dbReachable = false

  try {
    workspaceUser = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        email: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            matters: true,
            researchSessions: true,
          },
        },
      },
    })
    if (workspaceUser) {
      dbReachable = true
      ;[documentCount, chunkCount] = await Promise.all([
        prisma.document.count({ where: { matter: { user: { clerkId } } } }),
        prisma.documentChunk.count({ where: { matter: { user: { clerkId } } } }),
      ])
    }
  } catch {
    /* DB unavailable */
  }

  const config = [
    {
      label: "Clerk authentication",
      detail: "Required for identity, session protection, and user sync.",
      configured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    },
    {
      label: "Postgres + pgvector",
      detail: "Required for matters, documents, source chunks, and vector retrieval.",
      configured: Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL && dbReachable),
    },
    {
      label: "Supabase storage",
      detail: "Required for private source upload and document parsing.",
      configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    {
      label: "OpenAI embeddings",
      detail: "Required for semantic retrieval and grounded research generation.",
      configured: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      label: "Indexing webhook secret",
      detail: "Recommended for protecting internal document indexing triggers.",
      configured: Boolean(process.env.INDEXING_SECRET),
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Workspace administration
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Account posture, environment readiness, and data boundary checks for the
          current Aether workspace.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Account
            </p>
            {workspaceUser ? (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                    Name
                  </p>
                  <p className="mt-1 text-sm text-white/68">{workspaceUser.name ?? "Not set"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                    Email
                  </p>
                  <p className="mt-1 break-all text-sm text-white/68">{workspaceUser.email || "Not set"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">
                    Synced
                  </p>
                  <p className="mt-1 text-sm text-white/68">{fmtDate(workspaceUser.createdAt)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-amber-400/[0.14] bg-amber-400/[0.04] px-4 py-3">
                <p className="text-sm leading-relaxed text-amber-400/68">
                  User metadata is waiting for the data layer to become available.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Workspace footprint
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: "Matters", value: workspaceUser?._count.matters ?? 0 },
                { label: "Documents", value: documentCount },
                { label: "Chunks", value: chunkCount },
                { label: "Sessions", value: workspaceUser?._count.researchSessions ?? 0 },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-white/[0.05] bg-black/20 px-4 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/28">
                    {stat.label}
                  </p>
                  <p className="mt-1.5 font-light text-2xl tabular-nums text-white/78">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Integration readiness
              </p>
              <p className="mt-1 text-sm text-white/35">
                Environment variables are checked for presence only; secret values are never displayed.
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                config.every((item) => item.configured)
                  ? "border-white/[0.16] bg-white/[0.04] text-white/70"
                  : "border-amber-400/[0.18] bg-amber-400/[0.04] text-amber-400/58"
              }`}
            >
              {config.every((item) => item.configured) ? "Ready" : "Action needed"}
            </span>
          </div>
          <div className="mt-5">
            {config.map((item) => (
              <ConfigRow
                key={item.label}
                label={item.label}
                detail={item.detail}
                configured={item.configured}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Security boundary
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Platform routes are Clerk-protected, and all matter, document, chunk, and
          research queries are scoped through the authenticated user record.
        </p>
      </div>
    </div>
  )
}
