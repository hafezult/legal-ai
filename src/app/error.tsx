"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app/error]", error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
        Something went wrong
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight text-white/[0.96]">
        Aether hit an unexpected error
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-white/45">
        The workspace could not finish this request. Try again, or return to the
        dashboard. If this persists, check Settings readiness probes.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09]"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/75"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
