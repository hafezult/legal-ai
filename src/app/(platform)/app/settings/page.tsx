import { PlatformFeaturePage } from "@/components/platform/platform-feature-page"

export const dynamic = "force-dynamic"

export default function SettingsPage() {
  const checks = [
    { label: "Database", configured: Boolean(process.env.DATABASE_URL) },
    { label: "Storage", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { label: "Embeddings", configured: Boolean(process.env.OPENAI_API_KEY) },
    { label: "Indexing webhook", configured: Boolean(process.env.INDEXING_SECRET) },
  ]
  const configured = checks.filter((check) => check.configured).length

  return (
    <PlatformFeaturePage
      eyebrow="Workspace administration"
      title="Settings and readiness"
      description="Review the integration posture that powers the platform: identity, database, storage, embeddings, indexing, and governance controls."
      primaryAction={{ href: "/app", label: "Return to dashboard" }}
      secondaryAction={{ href: "/app/workflows", label: "View workflows" }}
      metrics={[
        { label: "Configured systems", value: `${configured}/${checks.length}`, detail: "Server-side environment checks." },
        { label: "Identity", value: "Clerk", detail: "Authentication and sessions." },
        { label: "Storage", value: checks[1].configured ? "Ready" : "Needs config", detail: "Supabase document bucket." },
        { label: "AI layer", value: checks[2].configured ? "Ready" : "Optional", detail: "Embeddings and analysis." },
      ]}
      cards={[
        {
          title: "Identity boundary",
          description: "Platform routes are Clerk-protected and each data access path resolves the internal user before reading matter data.",
          meta: "Provider: Clerk",
          status: "live",
        },
        {
          title: "Data plane",
          description: checks[0].configured
            ? "Database connection variables are present for Prisma-backed matters, documents, chunks, and research sessions."
            : "Add DATABASE_URL and DIRECT_URL to enable Prisma-backed persistence in this environment.",
          meta: checks[0].configured ? "Status: configured" : "Status: missing database URL",
          status: checks[0].configured ? "live" : "guarded",
        },
        {
          title: "Storage plane",
          description: checks[1].configured
            ? "Supabase storage variables are present for server-side upload and document retrieval."
            : "Add Supabase URL and service role credentials before accepting document uploads.",
          meta: checks[1].configured ? "Status: configured" : "Status: missing storage credentials",
          status: checks[1].configured ? "live" : "guarded",
        },
        {
          title: "AI and indexing",
          description: checks[2].configured
            ? "OpenAI embeddings are configured; documents can progress from chunked text to semantic retrieval."
            : "The platform can still parse and chunk documents; add OPENAI_API_KEY to enable semantic retrieval.",
          meta: checks[3].configured ? "Webhook: protected" : "Webhook: add INDEXING_SECRET",
          status: checks[2].configured ? "ready" : "planned",
        },
      ]}
      sidebarTitle="Readiness checklist"
      sidebarDescription="Settings are summarized as deployment posture rather than exposing raw environment values."
      steps={checks.map((check, index) => ({
        label: check.label,
        detail: check.configured
          ? "Required configuration is present in this runtime."
          : "Configuration is not present in this runtime.",
        state: check.configured ? "complete" : index === 2 ? "active" : "pending",
      }))}
    />
  )
}
