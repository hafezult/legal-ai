import { cn } from "@/lib/utils"

const config: Record<string, { label: string; cls: string }> = {
  pending:          { label: "Pending",         cls: "border-white/[0.07] text-white/28" },
  uploaded:         { label: "Uploaded",        cls: "border-white/[0.12] text-white/52" },
  parsing:          { label: "Parsing",         cls: "border-amber-400/[0.22] text-amber-400/58" },
  indexing:         { label: "Indexing",        cls: "border-amber-400/[0.22] text-amber-400/58" },
  indexed:          { label: "Indexed",         cls: "border-white/[0.16] text-white/68" },
  "retrieval-ready":{ label: "Retrieval ready", cls: "border-white/[0.2] text-white/75" },
  failed:           { label: "Failed",          cls: "border-red-400/[0.2] text-red-400/58" },
}

export function DocumentStatusPill({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const { label, cls } = config[status] ?? config.pending
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        cls,
        className
      )}
    >
      {label}
    </span>
  )
}
