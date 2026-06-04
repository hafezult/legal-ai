import { PlatformFeaturePage } from "@/components/platform/platform-feature-page"

export default function DraftingPage() {
  return (
    <PlatformFeaturePage
      eyebrow="Drafting operations"
      title="Drafting workbench"
      description="A partner-grade drafting surface for turning governed matter context, retrieved excerpts, and firm playbooks into reviewable work product."
      primaryAction={{ href: "/app/matters", label: "Select matter" }}
      secondaryAction={{ href: "/app/research", label: "Gather authorities" }}
      metrics={[
        { label: "Modes", value: "4", detail: "Draft, revise, compare, and verify." },
        { label: "Inputs", value: "3", detail: "Matter facts, source excerpts, playbooks." },
        { label: "Review gates", value: "5", detail: "Scope, privilege, citations, style, risk." },
        { label: "Output state", value: "Ready", detail: "Prepared for workflow routing." },
      ]}
      cards={[
        {
          title: "Matter-grounded generation",
          description: "Drafting starts from selected matter metadata and document excerpts instead of an unscoped blank prompt.",
          meta: "Dependency: active matter context",
          status: "ready",
        },
        {
          title: "Clause lineage",
          description: "Every suggested section can be connected back to source passages, extracted authorities, and requested changes.",
          meta: "Trace: source excerpt to clause",
          status: "ready",
        },
        {
          title: "Playbook enforcement",
          description: "Firm-specific style, risk appetite, and jurisdiction rules can be represented as approval criteria before release.",
          meta: "Guardrail: configurable policy",
          status: "planned",
        },
        {
          title: "Verification packet",
          description: "The workbench is designed to send drafts into workflow review with citations, assumptions, and unresolved issues visible.",
          meta: "Handoff: workflows",
          status: "guarded",
        },
      ]}
      sidebarTitle="Draft lifecycle"
      sidebarDescription="Drafting is intentionally staged around evidence and review gates so generated text remains inspectable."
      steps={[
        { label: "Scope selected", detail: "Choose the matter, document set, target audience, and requested work product.", state: "complete" },
        { label: "Grounding assembled", detail: "Research excerpts and matter metadata become the drafting context packet.", state: "active" },
        { label: "Draft generated", detail: "The drafting engine can produce sections with assumptions and source references.", state: "pending" },
        { label: "Review routed", detail: "Human approval and issue escalation move through the workflow queue.", state: "pending" },
      ]}
    />
  )
}
