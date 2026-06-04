import { PlatformFeaturePage } from "@/components/platform/platform-feature-page"

export default function WorkflowsPage() {
  return (
    <PlatformFeaturePage
      eyebrow="Control plane"
      title="Workflow operations"
      description="Coordinate the human and AI steps around matter intake, source ingestion, research, drafting, and approval so legal work stays accountable."
      primaryAction={{ href: "/app/matters", label: "Open matters" }}
      secondaryAction={{ href: "/app/documents", label: "Review documents" }}
      metrics={[
        { label: "Queues", value: "5", detail: "Intake, ingestion, research, drafting, review." },
        { label: "Approvals", value: "Human", detail: "Critical steps require review ownership." },
        { label: "Triggers", value: "3", detail: "Upload, research request, draft handoff." },
        { label: "Audit state", value: "Scoped", detail: "Matter ownership governs execution." },
      ]}
      cards={[
        {
          title: "Intake orchestration",
          description: "New matters establish client, jurisdiction, billing, risk, and operating scope before work enters downstream systems.",
          meta: "Entry point: matter registry",
          status: "live",
        },
        {
          title: "Document pipeline",
          description: "Uploads automatically trigger parsing, chunking, embedding when configured, and retrieval status transitions.",
          meta: "Trigger: source upload",
          status: "live",
        },
        {
          title: "Research routing",
          description: "Matter-scoped research requests combine retrieved excerpts with AI analysis and persist the session context.",
          meta: "Trigger: research query",
          status: "ready",
        },
        {
          title: "Approval handoff",
          description: "Drafting and exception paths are represented as review gates so attorney judgment remains explicit before output release.",
          meta: "Gate: human in the loop",
          status: "guarded",
        },
      ]}
      sidebarTitle="Operational sequence"
      sidebarDescription="The workflow view maps the major product loops that are already wired across the platform shell."
      steps={[
        { label: "Matter initialized", detail: "User-owned workspace is created and available to platform routes.", state: "complete" },
        { label: "Sources ingested", detail: "Document upload routes storage, registration, and indexing through server-side checks.", state: "complete" },
        { label: "Research packet built", detail: "Semantic or lexical retrieval creates source-backed excerpts for analysis.", state: "active" },
        { label: "Draft review assigned", detail: "Generated work product can be routed through approval and exception review.", state: "pending" },
      ]}
    />
  )
}
