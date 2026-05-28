"use client"

import { EnterpriseEcosystemSection } from "@/components/marketing/ecosystem-section"
import { Hero } from "@/components/marketing/hero"
import { ProductShowcase } from "@/components/marketing/product-showcase"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"
import { DocumentStory } from "@/components/marketing/story-documents"
import { EnterpriseStory } from "@/components/marketing/story-enterprise"
import { IntelligenceNarrative } from "@/components/marketing/story-intelligence"
import { OrchestrationStory } from "@/components/marketing/story-orchestration"
import { ReasoningStory } from "@/components/marketing/story-reasoning"
import { TrustSection } from "@/components/marketing/trust-section"

export default function MarketingHome() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <SiteHeader />
      <Hero />
      <IntelligenceNarrative />
      <OrchestrationStory />
      <ReasoningStory />
      <EnterpriseStory />
      <EnterpriseEcosystemSection />
      <DocumentStory />
      <ProductShowcase />
      <TrustSection />
      <SiteFooter />
    </main>
  )
}
