import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"
import { STORAGE_BUCKET } from "@/lib/storage/client"

export const dynamic = "force-dynamic"

type HealthState = "operational" | "pending" | "degraded"

const stateStyle: Record<HealthState, string> = {
  operational: "border-white/[0.16] bg-white/[0.05] text-white/72",
  pending: "border-amber-400/[0.18] bg-amber-400/[0.04] text-amber-300/70",
  degraded: "border-red-400/[0.18] bg-red-400/[0.04] text-red-300/70",
}

const stateLabel: Record<HealthState, string> = {
  operational: "Operational",
  pending: "Pending",
  degraded: "Degraded",
}

function configured(value: string | undefined) {
  return Boolean(value && value.trim().length > 0)
}

export default async function SettingsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let databaseState: HealthState = "degraded"
  try {
    await prisma.$queryRaw`SELECT 1`
    databaseState = "operational"
  } catch {
    databaseState = "degraded"
  }

  const envChecks = [
    {
      label: "DATABASE_URL",
      configured: configured(process.env.DATABASE_URL),
      note: "Prisma pooled connection string",
    },
    {
      label: "DIRECT_URL",
      configured: configured(process.env.DIRECT_URL),
      note: "Direct database URL for migrations",
    },
    {
      label: "Clerk publishable key",
      configured: configured(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      note: "Browser auth configuration",
    },
    {
      label: "Clerk secret key",
      configured: configured(process.env.CLERK_SECRET_KEY),
      note: "Server auth validation",
    },
    {
      label: "Supabase URL",
      configured: configured(process.env.NEXT_PUBLIC_SUPABASE_URL),
      note: "Document storage endpoint",
    },
    {
      label: "Supabase service role",
      configured: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
      note: "Private storage administration",
    },
    {
      label: "OpenAI API key",
      configured: configured(process.env.OPENAI_API_KEY),
      note: "Embeddings and grounded responses",
    },
    {
      label: "Indexing secret",
      configured: configured(process.env.INDEXING_SECRET),
      note: "Internal indexing route protection",
    },
    {
      label: "App URL",
      configured: configured(process.env.NEXT_PUBLIC_APP_URL),
      note: "Async indexing callback origin",
    },
  ]

  const storageConfigured =
    configured(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    configured(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const clerkConfigured =
    configured(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    configured(process.env.CLERK_SECRET_KEY)
  const openAiConfigured = configured(process.env.OPENAI_API_KEY)

  const healthCards = [
    {
      label: "Database",
      state: databaseState,
      note:
        databaseState === "operational"
          ? "Prisma can reach Postgres."
          : "Check DATABASE_URL, DIRECT_URL, and network access.",
    },
    {
      label: "Authentication",
      state: clerkConfigured ? "operational" as HealthState : "pending" as HealthState,
      note: clerkConfigured ? "Clerk keys are present." : "Add Clerk keys before deployment.",
    },
    {
      label: "Document storage",
      state: storageConfigured ? "operational" as HealthState : "pending" as HealthState,
      note: storageConfigured
        ? `Supabase bucket target: ${STORAGE_BUCKET}.`
        : "Add Supabase URL and service role key.",
    },
    {
      label: "AI retrieval",
      state: openAiConfigured ? "operational" as HealthState : "pending" as HealthState,
      note: openAiConfigured
        ? "OpenAI key present for embeddings and answers."
        : "Research remains disabled until OPENAI_API_KEY is set.",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Operations
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Deployment readiness, integration health, and safe configuration checks
          for the Aether Phase 1 workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {healthCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.02] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                {card.label}
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${stateStyle[card.state]}`}
              >
                {stateLabel[card.state]}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/45">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Environment checklist
          </p>
          <div className="mt-5 divide-y divide-white/[0.05]">
            {envChecks.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm text-white/65">{item.label}</p>
                  <p className="mt-0.5 text-xs text-white/28">{item.note}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                    item.configured
                      ? "border-white/[0.14] text-white/60"
                      : "border-amber-400/[0.18] text-amber-300/62"
                  }`}
                >
                  {item.configured ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Storage contract
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/42">
              Uploaded legal sources are stored in the private Supabase bucket{" "}
              <span className="font-mono text-white/62">{STORAGE_BUCKET}</span>.
              The server creates signed URLs only after matter ownership is
              verified.
            </p>
          </div>

          <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Indexing route
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/42">
              Document uploads trigger <span className="font-mono text-white/62">POST /api/index-document/:id</span>.
              Set <span className="font-mono text-white/62">INDEXING_SECRET</span> in
              shared environments to protect that internal route.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
