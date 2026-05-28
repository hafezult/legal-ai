"use client"

import {
  BookOpen,
  Brain,
  Briefcase,
  FileEdit,
  FolderOpen,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Workflow,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const items = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/matters", label: "Matters", icon: Briefcase },
  { href: "/app/research", label: "Research", icon: BookOpen },
  { href: "/app/drafting", label: "Drafting", icon: FileEdit },
  { href: "/app/documents", label: "Documents", icon: FolderOpen },
  { href: "/app/workflows", label: "Workflows", icon: Workflow },
  { href: "/app/memory", label: "Memory", icon: Brain },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const

type AppSidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onNavigate?: () => void
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl transition-transform duration-300 ease-out lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        collapsed ? "lg:w-[4.5rem]" : "lg:w-64"
      )}
      style={{
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div className="flex h-14 items-center justify-between border-b border-white/[0.06] px-3 lg:h-[3.25rem]">
        <Link
          href="/app"
          className="font-serif text-lg tracking-tight text-white/90 transition-opacity hover:text-white"
          onClick={onNavigate}
        >
          <span className={cn(collapsed && "lg:hidden")}>Aether</span>
          <span
            className={cn(
              "hidden font-serif text-lg text-white/85 lg:inline",
              !collapsed && "lg:hidden"
            )}
            aria-hidden
          >
            A
          </span>
        </Link>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-md border border-white/[0.08] p-1.5 text-white/45 transition-colors hover:border-white/[0.12] hover:bg-white/[0.04] hover:text-white/75 lg:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app"
              ? pathname === "/app"
              : pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-200",
                active
                  ? "border border-white/[0.1] bg-white/[0.06] text-white/[0.92]"
                  : "border border-transparent text-white/50 hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-white/75",
                collapsed && "lg:justify-center lg:gap-0"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="size-4 shrink-0 opacity-80" strokeWidth={1.5} />
              <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <p
          className={cn(
            "text-[10px] uppercase tracking-[0.18em] text-white/35",
            collapsed && "lg:hidden"
          )}
        >
          Platform
        </p>
        <p className={cn("mt-1 text-[11px] leading-relaxed text-white/40", collapsed && "lg:hidden")}>
          Phase 1 · operational shell
        </p>
      </div>
    </aside>
  )
}
