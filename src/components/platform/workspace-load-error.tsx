"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

type WorkspaceLoadErrorProps = {
  title?: string
  description?: string
  homeHref?: string
}

/**
 * Distinguishes infrastructure/DB outages from empty registries or 404s.
 */
export function WorkspaceLoadError({
  title = "Workspace data unavailable",
  description = "Aether could not reach the data plane for this view. Retry in a moment, or check Settings readiness probes if this persists.",
  homeHref = "/app",
}: WorkspaceLoadErrorProps) {
  const router = useRouter()

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-[var(--aether-radius-panel)] border border-amber-400/20 bg-amber-400/[0.04] px-8 py-16 text-center"
    >
      <p className="font-serif text-xl text-amber-100/70">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/40">
        {description}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => router.refresh()}
          className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-5 py-2.5 text-sm text-white/70 transition-colors hover:border-white/[0.2] hover:text-white/90"
        >
          Retry
        </button>
        <Link
          href={homeHref}
          className="rounded-lg border border-white/[0.08] px-5 py-2.5 text-sm text-white/45 transition-colors hover:border-white/[0.14] hover:text-white/70"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
