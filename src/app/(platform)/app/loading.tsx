export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div>
        <div className="h-3 w-16 rounded bg-white/[0.06]" />
        <div className="mt-3 h-9 w-64 rounded-md bg-white/[0.05]" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-white/[0.04]" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.02] px-5 py-4"
          >
            <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
            <div className="mt-3 h-8 w-12 rounded bg-white/[0.04]" />
          </div>
        ))}
      </div>

      {/* Operational panels skeleton */}
      <div className="grid gap-4 border-t border-white/[0.04] pt-8 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-[var(--aether-radius-card)] border border-white/[0.06] bg-black/20 p-6"
          >
            <div className="h-2.5 w-32 rounded bg-white/[0.05]" />
            <div className="mt-4 h-4 w-40 rounded bg-white/[0.04]" />
            <div className="mt-2 h-3 w-full rounded bg-white/[0.03]" />
            <div className="mt-1.5 h-3 w-4/5 rounded bg-white/[0.03]" />
          </div>
        ))}
      </div>

      {/* System status skeleton */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.05] bg-white/[0.01] p-6">
        <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-white/[0.04] bg-black/20 px-4 py-3"
            >
              <div className="h-3 w-28 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
