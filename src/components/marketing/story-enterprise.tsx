"use client"

import { Container, Section } from "@/components/marketing/primitives"

export function EnterpriseStory() {
  return (
    <Section id="enterprise" className="border-t border-white/[0.06]">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
            Enterprise infrastructure
          </div>
          <h2 className="text-4xl font-serif leading-tight tracking-tight md:text-6xl">
            Legal intelligence that scales like the rest of your stack.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-white/[0.62]">
            Deploy behind your perimeter, align to retention and access policies, and
            connect to the systems your firm already trusts—without fragmenting the
            practice.
          </p>
        </div>
      </Container>
    </Section>
  )
}
