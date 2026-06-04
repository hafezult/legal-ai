import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0)
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
        active
          ? "border-white/[0.14] text-white/62"
          : "border-amber-400/[0.2] text-amber-400/62"
      }`}
    >
      {active ? "Configured" : "Missing"}
    </span>
  )
}

export default async function SettingsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  type WorkspaceUser = {
    email: string
    name: string | null
    createdAt: Date
    _count: {
      matters: number
      researchSessions: number
    }
  }

  let user: WorkspaceUser | null = null
  let documentCount = 0
  let databaseAvailable = false

  try {
    user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        email: true,
        name: true,
        createdAt: true,
        _count: { select: { matters: true, researchSessions: true } },
      },
    })

    if (user) {
      databaseAvailable = true
      documentCount = await prisma.document.count({
        where: { matter: { user: { clerkId } } },
      })
    }
  } catch {
    /* Database unavailable */
  }

  const integrations = [
    {
      label: "Clerk authentication",
      description: "Identity, sessions, and protected platform routes.",
      active:
        configured(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
        configured(process.env.CLERK_SECRET_KEY),
    },
    {
      label: "Postgres data plane",
      description: "Prisma models for users, matters, documents, chunks, and sessions.",
      active: databaseAvailable,
    },
    {
      label: "Supabase storage",
      description: "Private source document upload and signed access URLs.",
      active:
        configured(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
        configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    {
      label: "OpenAI intelligence",
      description: "Embedding generation and grounded answer synthesis.",
      active: configured(process.env.OPENAI_API_KEY),
    },
    {
      label: "Indexing trigger",
      description: "Internal callback used after document upload.",
      active:
        configured(process.env.NEXT_PUBLIC_APP_URL) ||
        process.env.NODE_ENV === "development" ||
        configured(process.env.VERCEL_URL),
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Workspace settings
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Operational posture
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
          Readiness checks for identity, storage, data, and AI integrations that power
          the Aether workspace.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <aside className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Signed-in user
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/28">
                Name
              </p>
              <p className="mt-1 text-sm text-white/70">{user?.name ?? "Not set"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/28">
                Email
              </p>
              <p className="mt-1 break-all text-sm text-white/70">
                {user?.email ?? "Unavailable"}
              </p>
            </div>
          </div>
        </aside>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Matters", value: String(user?._count.matters ?? 0) },
            { label: "Documents", value: String(documentCount) },
            { label: "Research sessions", value: String(user?._count.researchSessions ?? 0) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-5 py-4"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                {stat.label}
              </p>
              <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.92]">
                {stat.value}
              </p>
            </div>
          ))}
        </section>
      </div>

      <section className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015]">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Integration readiness
          </p>
        </div>
        <div>
          {integrations.map((integration) => (
            <div
              key={integration.label}
              className="flex items-center justify-between gap-4 border-t border-white/[0.04] px-5 py-4 first:border-t-0"
            >
              <div>
                <p className="text-sm text-white/70">{integration.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/30">
                  {integration.description}
                </p>
              </div>
              <StatusBadge active={integration.active} />
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Configuration note
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Secret values are intentionally not displayed. Update environment variables in
          the deployment platform or local `.env.local`, then restart the app.
        </p>
      </div>
    </div>
  )
}
