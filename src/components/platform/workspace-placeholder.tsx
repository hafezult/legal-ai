import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function WorkspacePlaceholder({
  title,
  children,
  className,
}: {
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-white/[0.02] p-8 md:p-10",
        className
      )}
    >
      <h1 className="font-serif text-2xl tracking-tight text-white/[0.94] md:text-3xl">
        {title}
      </h1>
      {children ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">{children}</p>
      ) : null}
    </div>
  )
}
