import Link from "next/link"

import { cn } from "@/lib/utils"

type FeatureAction = {
  href: string
  label: string
}

type FeatureMetric = {
  label: string
  value: string
  detail?: string
}

type FeatureCard = {
  title: string
  description: string
  meta?: string
  status?: "live" | "ready" | "planned" | "guarded"
}

type FeatureStep = {
  label: string
  detail: string
  state: "complete" | "active" | "pending"
}

export type PlatformFeaturePageProps = {
  eyebrow: string
  title: string
  description: string
  primaryAction?: FeatureAction
  secondaryAction?: FeatureAction
  metrics: FeatureMetric[]
  cards: FeatureCard[]
  steps: FeatureStep[]
  sidebarTitle: string
  sidebarDescription: string
}

const cardStatusStyles: Record<NonNullable<FeatureCard["status"]>, string> = {
  live: "border-emerald-300/[0.16] bg-emerald-300/[0.04] text-emerald-200/70",
  ready: "border-white/[0.12] bg-white/[0.04] text-white/64",
  planned: "border-white/[0.07] bg-white/[0.015] text-white/34",
  guarded: "border-amber-300/[0.16] bg-amber-300/[0.04] text-amber-200/65",
}

const stepStateStyles: Record<FeatureStep["state"], string> = {
  complete: "border-white/[0.14] bg-white/[0.07]",
  active: "border-emerald-300/[0.24] bg-emerald-300/[0.08]",
  pending: "border-white/[0.06] bg-transparent",
}

export function PlatformFeaturePage({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  metrics,
  cards,
  steps,
  sidebarTitle,
  sidebarDescription,
}: PlatformFeaturePageProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            {eyebrow}
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/48">
            {description}
          </p>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap gap-2">
            {secondaryAction && (
              <Link
                href={secondaryAction.href}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] text-white/52 transition-colors hover:border-white/[0.14] hover:text-white/78"
              >
                {secondaryAction.label}
              </Link>
            )}
            {primaryAction && (
              <Link
                href={primaryAction.href}
                className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-[13px] text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white/92"
              >
                {primaryAction.label}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.07] bg-white/[0.02] px-5 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/34">
              {metric.label}
            </p>
            <p className="mt-2 font-light text-3xl tabular-nums text-white/[0.9]">
              {metric.value}
            </p>
            {metric.detail && (
              <p className="mt-1 text-xs leading-relaxed text-white/34">{metric.detail}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-black/25 p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
            Operating surface
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {cards.map((card) => (
              <div
                key={card.title}
                className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-base tracking-tight text-white/82">
                    {card.title}
                  </h2>
                  {card.status && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]",
                        cardStatusStyles[card.status]
                      )}
                    >
                      {card.status}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/42">{card.description}</p>
                {card.meta && (
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[11px] uppercase tracking-[0.14em] text-white/28">
                    {card.meta}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-white/[0.015] p-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/38">
            {sidebarTitle}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/42">{sidebarDescription}</p>

          <div className="mt-6 space-y-3">
            {steps.map((step, index) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1 size-3 rounded-full border",
                      stepStateStyles[step.state]
                    )}
                  />
                  {index < steps.length - 1 && (
                    <span className="mt-1 h-full min-h-8 w-px bg-white/[0.06]" />
                  )}
                </div>
                <div className="pb-3">
                  <p className="text-sm text-white/72">{step.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/34">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
