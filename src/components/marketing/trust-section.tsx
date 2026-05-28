"use client"

import { Container, Section } from "@/components/marketing/primitives"

function ArchitectureDiagram() {
  return (
    <div
      className="relative mx-auto aspect-[16/10] max-w-3xl rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-black/40 p-6 md:p-10"
      aria-hidden
    >
      <svg
        className="h-full w-full text-white/25"
        viewBox="0 0 400 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M60 120 L140 120 M260 120 L340 120 M200 40 L200 90 M200 150 L200 200"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M140 120 Q200 80 260 120"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle cx="60" cy="120" r="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" />
        <circle cx="200" cy="40" r="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" />
        <circle cx="200" cy="200" r="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" />
        <circle cx="340" cy="120" r="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" />
        <rect
          x="150"
          y="100"
          width="100"
          height="40"
          rx="8"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/45">
          Control plane
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-6 left-6 text-[10px] uppercase tracking-[0.18em] text-white/35 md:bottom-10 md:left-10">
        Clients
      </div>
      <div className="pointer-events-none absolute left-6 top-6 text-[10px] uppercase tracking-[0.18em] text-white/35 md:left-10 md:top-10">
        Identity
      </div>
      <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.18em] text-white/35 md:right-10">
        Data plane
      </div>
      <div className="pointer-events-none absolute bottom-6 right-6 text-[10px] uppercase tracking-[0.18em] text-white/35 md:bottom-10 md:right-10">
        Models
      </div>
    </div>
  )
}

export function TrustSection() {
  return (
    <Section id="trust" className="border-t border-white/[0.06]">
      <Container>
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
              Security & compliance
            </div>
            <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
              Architecture you can explain in the boardroom.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
              Segregated environments, least-privilege access, and encrypted data paths
              are baseline expectations—not marketing footnotes. Aether is designed for
              teams that need clear ownership of prompts, documents, and outcomes.
            </p>
            <ul className="mt-8 space-y-4 text-sm leading-relaxed text-white/[0.58]">
              <li className="border-l border-white/[0.12] pl-4">
                Tenant isolation and customer-controlled retention policies where
                supported by deployment model.
              </li>
              <li className="border-l border-white/[0.12] pl-4">
                Audit-friendly logging of human and automated actions across workflows.
              </li>
              <li className="border-l border-white/[0.12] pl-4">
                Compliance posture should be validated against your program—use this
                narrative as a starting point for review, not a certification claim.
              </li>
            </ul>
          </div>
          <ArchitectureDiagram />
        </div>
      </Container>
    </Section>
  )
}
