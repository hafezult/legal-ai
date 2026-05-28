"use client"

import { Container, GlassPanel, Section } from "@/components/marketing/primitives"

function DashboardMock() {
  return (
    <GlassPanel className="overflow-hidden p-0">
      <div className="flex min-h-[280px]">
        <div className="hidden w-44 shrink-0 border-r border-white/[0.06] bg-black/30 p-4 sm:block">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
            Workspace
          </div>
          {["Overview", "Matters", "Retrieval", "Policies"].map((item) => (
            <div
              key={item}
              className="mt-3 rounded-md px-2 py-1.5 text-xs text-white/55 transition-colors duration-300 hover:bg-white/[0.06] hover:text-white/85"
            >
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                Command surface
              </div>
              <div className="mt-1 text-lg text-white/90">Matter intelligence</div>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-wider text-white/50">
              Live
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { k: "Signals", v: "128" },
              { k: "Drafts", v: "14" },
              { k: "Verified", v: "96%" },
            ].map((cell) => (
              <div
                key={cell.k}
                className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-black/35 px-4 py-3 transition-colors duration-300 hover:bg-black/50"
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  {cell.k}
                </div>
                <div className="mt-1 text-2xl font-light text-white/90">{cell.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            {["Clause deviation — MSA §9.2", "Regulatory delta — EU AI Act"].map(
              (row) => (
                <div
                  key={row}
                  className="flex items-center justify-between rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-white/70 transition-colors duration-300 hover:bg-white/[0.05] hover:text-white/[0.88]"
                >
                  <span>{row}</span>
                  <span className="text-white/35">→</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}

function TimelineMock() {
  return (
    <GlassPanel className="p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        Matter timeline
      </div>
      <div className="relative mt-6 space-y-0">
        {[
          { t: "T‑6d", label: "Complaint filed", state: "done" },
          { t: "T‑2d", label: "Discovery scope agreed", state: "done" },
          { t: "Today", label: "Expert review in flight", state: "active" },
          { t: "T+5d", label: "Client readout", state: "next" },
        ].map((node, i) => (
          <div key={node.t} className="relative flex gap-4 pb-8 last:pb-0">
            <div className="flex w-14 shrink-0 flex-col items-end pt-0.5">
              <span className="font-mono text-[10px] text-white/40">{node.t}</span>
            </div>
            <div className="relative flex-1">
              {i < 3 ? (
                <div className="absolute left-[7px] top-3 bottom-0 w-px bg-white/[0.08]" />
              ) : null}
              <div
                className={`relative z-10 flex items-start gap-3 rounded-[var(--aether-radius-panel)] border px-3 py-2.5 transition-colors duration-300 ${
                  node.state === "active"
                    ? "border-white/[0.12] bg-white/[0.06] text-white/90"
                    : "border-white/[0.06] bg-black/25 text-white/65 hover:bg-black/40 hover:text-white/82"
                }`}
              >
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    node.state === "active"
                      ? "bg-white/80"
                      : node.state === "done"
                        ? "bg-white/35"
                        : "bg-white/15"
                  }`}
                />
                <div className="text-sm">{node.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function RagFlowMock() {
  const nodes = [
    { id: "Sources", sub: "DMS + matter files" },
    { id: "Index", sub: "Chunk + embed" },
    { id: "Retrieve", sub: "Scoped search" },
    { id: "Reason", sub: "Grounded output" },
  ]
  return (
    <GlassPanel className="p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
        Retrieval flow
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {nodes.map((n) => (
          <div
            key={n.id}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-center transition-colors duration-300 hover:bg-white/[0.055]"
          >
            <div className="text-xs font-medium text-white/85">{n.id}</div>
            <div className="mt-1 text-[10px] text-white/42">{n.sub}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

export function ProductShowcase() {
  return (
    <Section id="showcase" className="border-t border-white/[0.06] bg-zinc-950/40">
      <Container>
        <div className="mb-14 max-w-2xl">
          <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
            Product surface
          </div>
          <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
            Interfaces your partners can stand behind.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
            Original Aether chrome—calm glass, sparse labels, and room for judgment.
          </p>
        </div>

        <div className="flex flex-col gap-10">
          <DashboardMock />
          <div className="grid gap-10 lg:grid-cols-2">
            <TimelineMock />
            <RagFlowMock />
          </div>
        </div>
      </Container>
    </Section>
  )
}
