"use client"

import { Container, GlassPanel, Section } from "@/components/marketing/primitives"

export function IntelligenceNarrative() {
  return (
    <Section id="platform">
      <Container>
        <div className="grid grid-cols-1 items-center gap-20 lg:grid-cols-2">
          <div>
            <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
              Legal Intelligence
            </div>
            <h2 className="text-5xl font-serif leading-[1] tracking-tight md:text-7xl">
              Built for
              <br />
              complex legal
              <br />
              workflows.
            </h2>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/[0.62]">
              Aether combines advanced reasoning, document intelligence, legal drafting,
              and enterprise workflow orchestration into one unified operating system for
              modern law.
            </p>
          </div>

          <div className="relative">
            <GlassPanel className="p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-white/40" />
                <div className="h-3 w-3 rounded-full bg-white/20" />
                <div className="h-3 w-3 rounded-full bg-white/10" />
              </div>
              <div className="space-y-5">
                {[
                  {
                    label: "AI Research",
                    title: "Cross-jurisdictional authority analysis",
                  },
                  {
                    label: "Drafting Intelligence",
                    title: "Automated contract and litigation workflows",
                  },
                  {
                    label: "Enterprise Orchestration",
                    title: "AI-native legal operating infrastructure",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-black/45 p-5 transition-colors duration-300 hover:bg-black/55"
                  >
                    <div className="text-sm text-white/45">{row.label}</div>
                    <div className="mt-2 text-xl text-white/90">{row.title}</div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </Container>
    </Section>
  )
}
