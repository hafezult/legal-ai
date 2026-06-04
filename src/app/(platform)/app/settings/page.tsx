import { auth } from "@clerk/nextjs/server"

import { prisma } from "@/lib/prisma"
import { isEmbeddingConfigured } from "@/lib/ai/embeddings"
import { STORAGE_BUCKET } from "@/lib/storage/client"

export const dynamic = "force-dynamic"

type HealthItem = {
  label: string
  status: "configured" | "missing" | "reachable" | "unreachable"
  detail: string
}

const statusClass: Record<HealthItem["status"], string> = {
  configured: "border-white/[0.12] bg-white/[0.04] text-white/68",
  missing: "border-amber-400/[0.18] bg-amber-400/[0.04] text-amber-300/68",
  reachable: "border-white/[0.12] bg-white/[0.04] text-white/68",
  unreachable: "border-red-400/[0.18] bg-red-400/[0.04] text-red-300/68",
}

export default async function SettingsPage() {
  const { userId: clerkId } = auth()
  if (!clerkId) return null

  let dataPlaneReachable = false
  try {
    await prisma.user.findUnique({ where: { clerkId }, select: { id: true } })
    dataPlaneReachable = true
  } catch {
    dataPlaneReachable = false
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const items: HealthItem[] = [
    {
      label: "Database",
      status: dataPlaneReachable ? "reachable" : "unreachable",
      detail: "Prisma PostgreSQL connection for matters, documents, and sessions.",
    },
    {
      label: "Clerk",
      status:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
          ? "configured"
          : "missing",
      detail: "Authentication keys used by the protected platform workspace.",
    },
    {
      label: "Supabase storage",
      status:
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "configured"
          : "missing",
      detail: `Document object storage bucket: ${STORAGE_BUCKET}.`,
    },
    {
      label: "OpenAI",
      status: isEmbeddingConfigured() ? "configured" : "missing",
      detail: "Embeddings and grounded research responses require OPENAI_API_KEY.",
    },
    {
      label: "Indexing secret",
      status: process.env.INDEXING_SECRET ? "configured" : "missing",
      detail: "Required in production for internal document indexing callbacks.",
    },
    {
      label: "App URL",
      status: process.env.NEXT_PUBLIC_APP_URL ? "configured" : "missing",
      detail: `Indexing callbacks target ${appUrl}.`,
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Settings
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
          Configuration health
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          Operational readiness for the services that power authentication,
          storage, indexing, retrieval, and grounded AI responses.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="font-serif text-base text-white/76">{item.label}</p>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${statusClass[item.status]}`}
              >
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/34">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 px-6 py-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">
          Production note
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/40">
          Keep service-role keys server-only, configure pgvector before running
          migrations, and set INDEXING_SECRET anywhere the indexing route is exposed.
        </p>
      </div>
    </div>
  )
}
