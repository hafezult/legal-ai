import { auth } from "@clerk/nextjs/server"
import Link from "next/link"

export const dynamic = "force-dynamic"

type ReadinessItem = {
  label: string
  configured: boolean
  description: string
}

const pillClass: Record<"ready" | "missing", string> = {
  ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200/70",
  missing: "border-amber-400/20 bg-amber-400/10 text-amber-200/70",
}

export default function SettingsPage() {
  const { userId: clerkId } = auth()
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
      description: "Embeddings, semantic search, and grounded answers.",
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
          Runtime readiness, integration status, and security posture for the Aether
          workspace.
        </p>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            label: "Authentication boundary",
            value: "Clerk-protected platform routes with user-scoped data access.",
          },
          {
            label: "Matter isolation",
            value: "Documents, chunks, and research sessions query through owned matters.",
          },
          {
            label: "Indexing controls",
            value: "Production indexing callbacks require the shared internal secret.",
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
