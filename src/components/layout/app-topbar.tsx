"use client"

import { UserButton } from "@clerk/nextjs"
import { Menu } from "lucide-react"

type AppTopbarProps = {
  title: string
  subtitle?: string
  onOpenSidebar?: () => void
}

export function AppTopbar({ title, subtitle, onOpenSidebar }: AppTopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-black/40 px-4 backdrop-blur-md sm:px-6 lg:h-[3.25rem]">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="inline-flex rounded-md border border-white/[0.08] p-2 text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white/85 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <Menu className="size-4" strokeWidth={1.5} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-serif text-sm text-white/[0.88] sm:text-base">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] text-white/40">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "h-8 w-8 ring-1 ring-white/10",
            },
          }}
        />
      </div>
    </header>
  )
}
