"use client"

import { Container, Section } from "@/components/marketing/primitives"
import { cn } from "@/lib/utils"

const layers = [
  { title: "Grounding", body: "Firm precedent, clauses, and matter facts" },
  { title: "Reasoning", body: "Structured chains with verifiable steps" },
  { title: "Synthesis", body: "Drafts, memos, and research briefs" },
]

export function ReasoningStory() {
  return (
    <Section id="reasoning" className="border-t border-white/[0.06]">
      <Container>
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
              AI reasoning
            </div>
            <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
              Layered cognition—not a single black box.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
              Aether separates retrieval, reasoning, and output so teams can inspect,
              correct, and reuse legal judgment with discipline.
            </p>
          </div>

          <div className="relative space-y-3">
            <div className="absolute left-6 top-8 bottom-8 w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent md:left-8" />
            {layers.map((layer, i) => (
              <div
                key={layer.title}
                className={cn(
                  "relative rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.025] py-5 pl-14 pr-6 transition-colors duration-300 hover:bg-white/[0.045] md:pl-16",
                  i === 1 && "md:ml-4",
                  i === 2 && "md:ml-8"
                )}
              >
                <div className="absolute left-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black md:left-6" />
                <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                  {layer.title}
                </div>
                <div className="mt-2 text-base text-white/[0.72]">{layer.body}</div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}
