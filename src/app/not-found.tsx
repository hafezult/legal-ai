import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
        404
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-tight text-white/[0.96]">
        Page not found
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-white/45">
        That route is not part of this Aether workspace. Check the URL or return
        to the dashboard.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/app"
          className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 transition-colors hover:border-white/[0.2] hover:bg-white/[0.09]"
        >
          Open dashboard
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/75"
        >
          Marketing home
        </Link>
      </div>
    </div>
  )
}
