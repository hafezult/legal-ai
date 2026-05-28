"use client"

import { Container, GlassPanel, Section } from "@/components/marketing/primitives"

export function DocumentStory() {
  return (
    <Section id="documents" className="border-t border-white/[0.06]">
      <Container>
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
              Document intelligence
            </div>
            <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
              Read the deal once. Remember it everywhere.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
              Structure obligations, risk, and definitions across portfolios—then route
              those signals into drafting, diligence, and matter strategy.
            </p>
          </div>

          <GlassPanel className="divide-y divide-white/[0.06] overflow-hidden p-0">
            <div className="flex items-center justify-between px-6 py-4 text-xs uppercase tracking-[0.18em] text-white/45">
              <span>Matter bundle</span>
              <span className="text-white/30">Live</span>
            </div>
            {[
              { name: "MSA — Cloud Services", meta: "12 sections · 3 deviations" },
              { name: "Data Processing Addendum", meta: "Cross-mapped to policy pack" },
              { name: "Security questionnaire", meta: "Responses drafted + cited" },
            ].map((doc) => (
              <div
                key={doc.name}
                className="flex flex-col gap-1 px-6 py-4 transition-colors duration-300 hover:bg-white/[0.04]"
              >
                <div className="text-sm text-white/88">{doc.name}</div>
                <div className="text-xs text-white/45">{doc.meta}</div>
              </div>
            ))}
          </GlassPanel>
        </div>
      </Container>
    </Section>
  )
}
