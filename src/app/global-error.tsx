"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app/global-error]", error.digest ?? error.message)
  }, [error])

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-black text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Critical error
          </p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight text-white/[0.96]">
            Aether could not render this page
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/45">
            A root-level failure interrupted the workspace shell. Try again, or
            reload the app. If this persists, check deployment readiness probes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09]"
            >
              Try again
            </button>
            <a
              href="/app"
              className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/75"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
