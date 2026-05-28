import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "border-white/[0.14] bg-white/[0.04] text-white/72",
  },
  on_hold: {
    label: "On hold",
    className: "border-amber-400/[0.22] bg-amber-400/[0.05] text-amber-400/68",
  },
  closed: {
    label: "Closed",
    className: "border-white/[0.08] bg-white/[0.02] text-white/38",
  },
  archived: {
    label: "Archived",
    className: "border-white/[0.05] bg-transparent text-white/25",
  },
}

export function MatterStatusPill({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const config = statusConfig[status] ?? statusConfig.active
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
