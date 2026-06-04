import { currentUser } from "@clerk/nextjs/server"

import { DEFAULT_CONFIG } from "@/lib/ai/embeddings"
import { STORAGE_BUCKET } from "@/lib/storage/client"

function IntegrationRow({
  label,
  detail,
  ready,
}: {
  label: string
  detail: string
  ready: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/[0.04] py-3 first:border-t-0">
      <div>
        <p className="text-sm text-white/62">{label}</p>
        <p className="mt-0.5 text-xs text-white/28">{detail}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
          ready
            ? "border-white/[0.16] text-white/62"
            : "border-amber-400/[0.18] text-amber-400/55"
        }`}
      >
        {ready ? "Configured" : "Action needed"}
      </span>
    </div>
  )
}

export default async function SettingsPage() {
  const user = await currentUser()
  const primaryEmail =
    user?.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    "No email on file"

  const integrationRows = [
    {
      label: "Postgres + pgvector",
      detail: "Backs matters, document chunks, embeddings, and research sessions.",
      ready: Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL),
    },
    {
      label: "Supabase storage",
      detail: `Stores uploaded sources in the ${STORAGE_BUCKET} bucket.`,
      ready: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    {
      label: "OpenAI intelligence",
      detail: `${DEFAULT_CONFIG.model} embeddings and grounded analysis responses.`,
      ready: Boolean(process.env.OPENAI_API_KEY),
    },
    {
      label: "Internal indexing route",
      detail: "Protects manual indexing triggers outside local development.",
      ready: Boolean(process.env.INDEXING_SECRET) || process.env.NODE_ENV !== "production",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Workspace controls
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Read-only operational posture for the current MVP. Identity remains governed
          by Clerk while Aether owns matter context, retrieval, and source intelligence.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/20 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Account
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30">Name</p>
              <p className="mt-1 text-sm text-white/68">{user?.fullName ?? "Signed-in user"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30">Email</p>
              <p className="mt-1 text-sm text-white/68">{primaryEmail}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/30">User sync</p>
              <p className="mt-1 text-sm text-white/68">
                Synced automatically when the platform shell or server actions run.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.015] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
            Integration posture
          </p>
          <div className="mt-4">
            {integrationRows.map((row) => (
              <IntegrationRow key={row.label} {...row} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
