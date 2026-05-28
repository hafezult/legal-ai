"use client"

import { Container, Section } from "@/components/marketing/primitives"

const steps = [
  { id: "01", label: "Intake", detail: "Matters, documents, and signals" },
  { id: "02", label: "Orchestrate", detail: "Policies, roles, and approvals" },
  { id: "03", label: "Execute", detail: "Agents, tools, and firm memory" },
  { id: "04", label: "Observe", detail: "Audit trails and lineage" },
]

export function OrchestrationStory() {
  return (
    <Section id="orchestration" className="border-t border-white/[0.06]">
      <Container>
        <div className="mb-16 max-w-2xl">
          <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
            Workflow orchestration
          </div>
          <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
            One calm spine across every legal motion.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
            Route work through the right people, models, and systems without losing
            context—governed steps instead of ad hoc prompts.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className="group relative rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.02] px-5 py-6 transition-colors duration-300 hover:bg-white/[0.04]"
            >
              {i < steps.length - 1 ? (
                <div
                  className="absolute top-1/2 right-0 hidden h-px w-4 -translate-y-1/2 translate-x-full bg-gradient-to-r from-white/25 to-transparent md:block"
                  aria-hidden
                />
              ) : null}
              <div className="font-mono text-xs text-white/35">{s.id}</div>
              <div className="mt-3 text-lg text-white/88">{s.label}</div>
              <div className="mt-2 text-sm leading-relaxed text-white/50">{s.detail}</div>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}
