import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const envChecks = [
  {
    label: "Database",
    keys: ["DATABASE_URL", "DIRECT_URL"],
    note: "Prisma application and migration connections",
  },
  {
    label: "Authentication",
    keys: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    note: "Clerk sign-in, sign-up, and protected app routes",
  },
  {
    label: "Storage",
    keys: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    note: "Supabase private document bucket",
  },
  {
    label: "AI retrieval",
    keys: ["OPENAI_API_KEY"],
    note: "Embeddings and grounded answer generation",
  },
  {
    label: "Indexing webhook",
    keys: ["INDEXING_SECRET", "NEXT_PUBLIC_APP_URL"],
    note: "Internal document indexing trigger",
  },
] as const

function configured(keys: readonly string[]) {
  return keys.every((key) => Boolean(process.env[key]))
}

function mask(value: string | undefined) {
  if (!value) return "Not configured"
  if (value.length <= 8) return "Configured"
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

export default async function SettingsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let accountEmail = "Signed in"
  let matterCount = 0
  let documentCount = 0

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: {
        email: true,
        _count: { select: { matters: true, researchSessions: true } },
      },
    })

    if (user) {
      accountEmail = user.email
      matterCount = user._count.matters
      documentCount = await prisma.document.count({
        where: { matter: { user: { clerkId } } },
      })
    }
  } catch {
    /* DB unavailable */
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Workspace settings
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Configuration health
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Operational readiness for identity, storage, database, indexing, and AI
          retrieval services.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Account", value: accountEmail },
          { label: "Matters", value: String(matterCount) },
          { label: "Documents", value: String(documentCount) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.025] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
              {card.label}
            </p>
            <p className="mt-2 truncate text-sm text-white/[0.78]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
          Integration readiness
        </p>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {envChecks.map((check) => {
            const isConfigured = configured(check.keys)
            return (
              <div
                key={check.label}
                className="rounded-lg border border-white/[0.055] bg-white/[0.012] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/72">{check.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/28">
                      {check.note}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
                      isConfigured
                        ? "border-white/[0.14] text-white/58"
                        : "border-amber-400/[0.18] text-amber-300/58"
                    }`}
                  >
                    {isConfigured ? "Ready" : "Needs env"}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {check.keys.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 rounded border border-white/[0.035] bg-black/20 px-3 py-2"
                    >
                      <code className="text-[11px] text-white/36">{key}</code>
                      <span className="text-right text-[11px] text-white/24">
                        {mask(process.env[key])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.01] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
          Security posture
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              label: "Identity",
              note: "Clerk owns authentication; app data is scoped to the synced user row.",
            },
            {
              label: "Documents",
              note: "Uploads are stored in a private Supabase bucket and registered per matter.",
            },
            {
              label: "Research",
              note: "Responses are grounded in indexed chunks and retained as matter sessions.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/[0.05] bg-black/20 p-4"
            >
              <p className="text-sm text-white/62">{item.label}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/28">{item.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
