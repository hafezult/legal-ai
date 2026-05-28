export default function MatterDetailLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Header skeleton */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-white/[0.015] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-2.5 w-20 rounded bg-white/[0.06]" />
            <div className="h-7 w-72 rounded-md bg-white/[0.05]" />
          </div>
          <div className="h-5 w-14 rounded-full bg-white/[0.05]" />
        </div>
        <div className="mt-5 flex flex-wrap gap-8 border-t border-white/[0.04] pt-5">
          {[64, 80, 56, 48, 80, 72].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2 w-12 rounded bg-white/[0.05]" />
              <div className={`h-3.5 rounded bg-white/[0.04]`} style={{ width: w }} />
            </div>
          ))}
        </div>
      </div>

      {/* Research / Document skeleton */}
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-[var(--aether-radius-panel)] border border-white/[0.06] bg-black/20 p-6"
          >
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-36 rounded bg-white/[0.06]" />
              <div className="h-4 w-24 rounded-full bg-white/[0.04]" />
            </div>
            <div className="mt-5 h-4 w-48 rounded bg-white/[0.05]" />
            <div className="mt-2 h-3 w-full rounded bg-white/[0.03]" />
            <div className="mt-1 h-3 w-4/5 rounded bg-white/[0.03]" />
            <div className="mt-6 space-y-2.5">
              {[0, 1, 2].map((j) => (
                <div
                  key={j}
                  className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-3"
                >
                  <div className="h-2.5 w-24 rounded bg-white/[0.05]" />
                  <div className="mt-1.5 h-2.5 w-full rounded bg-white/[0.03]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline skeleton */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.05] bg-white/[0.01] p-6">
        <div className="h-2.5 w-32 rounded bg-white/[0.06]" />
        <div className="mt-6 space-y-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-[3px] h-2 w-2 shrink-0 rounded-full bg-white/[0.08]" />
              <div className="flex gap-3">
                <div className="h-3 w-36 rounded bg-white/[0.05]" />
                <div className="h-3 w-24 rounded bg-white/[0.03]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System state skeleton */}
      <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.04] bg-white/[0.008] p-6">
        <div className="h-2.5 w-24 rounded bg-white/[0.06]" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-white/[0.04] bg-black/20 px-4 py-3"
            >
              <div className="h-3 w-32 rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
