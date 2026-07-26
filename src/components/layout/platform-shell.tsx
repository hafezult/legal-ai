"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppTopbar } from "@/components/layout/app-topbar"
import type { ShellOrganization } from "@/components/layout/organization-switcher"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "aether-shell-sidebar-collapsed"

const exactTitles: Record<string, { title: string; subtitle?: string }> = {
  "/app": { title: "Dashboard", subtitle: "Operational overview" },
  "/app/matters": { title: "Matters", subtitle: "Matter registry" },
  "/app/matters/new": { title: "Matter intake", subtitle: "Governed initialization" },
  "/app/research": { title: "Research", subtitle: "Authority and retrieval" },
  "/app/drafting": { title: "Drafting", subtitle: "Grounded draft generation" },
  "/app/documents": { title: "Documents", subtitle: "Intelligence and lineage" },
  "/app/workflows": { title: "Workflows", subtitle: "Indexing pipeline status" },
  "/app/memory": { title: "Memory", subtitle: "Matter-scoped memory" },
  "/app/settings": { title: "Settings", subtitle: "Account and workspace" },
}

function resolveMeta(pathname: string): { title: string; subtitle?: string } {
  if (exactTitles[pathname]) return exactTitles[pathname]
  if (pathname.includes("/documents/")) {
    return { title: "Document", subtitle: "Intelligence workstation" }
  }
  if (pathname === "/app/matters/new") {
    return { title: "Matter intake", subtitle: "Governed initialisation" }
  }
  if (pathname.startsWith("/app/matters/")) {
    return { title: "Matter", subtitle: "Intelligence workspace" }
  }
  return { title: "Workspace", subtitle: "Aether" }
}

export function PlatformShell({
  children,
  organizations = [],
  activeOrganizationId = null,
}: {
  children: React.ReactNode
  organizations?: ShellOrganization[]
  activeOrganizationId?: string | null
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(STORAGE_KEY) === "1") {
          setCollapsed(true)
        }
      } catch {
        /* ignore */
      }
      setHydrated(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  useEffect(() => {
    if (!mobileOpen) return

    const desktopQuery = window.matchMedia("(min-width: 1024px)")
    if (desktopQuery.matches) {
      closeMobile()
      return
    }

    const onViewportChange = () => {
      if (desktopQuery.matches) closeMobile()
    }
    desktopQuery.addEventListener("change", onViewportChange)

    const sidebar = document.getElementById("app-sidebar-nav")
    const main = document.getElementById("app-main")
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    if (main) main.inert = true

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",")

    const focusables = () =>
      sidebar
        ? Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
          )
        : []

    const initial = focusables()[0]
    initial?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeMobile()
        return
      }
      if (event.key !== "Tab" || !sidebar) return

      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !sidebar.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !sidebar.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      desktopQuery.removeEventListener("change", onViewportChange)
      window.removeEventListener("keydown", onKeyDown)
      if (main) main.inert = false
      previouslyFocused?.focus()
    }
  }, [mobileOpen, closeMobile])

  const meta = resolveMeta(pathname)
  const activeName = organizations.find((org) => org.id === activeOrganizationId)?.name
  const subtitle = activeName
    ? `${meta.subtitle ?? "Aether"} · ${activeName}`
    : meta.subtitle

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation"
          onClick={closeMobile}
        />
      ) : null}

      <AppSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onNavigate={closeMobile}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <AppTopbar
          title={meta.title}
          subtitle={subtitle}
          mobileNavOpen={mobileOpen}
          onOpenSidebar={() => setMobileOpen((open) => !open)}
        />
        <main
          id="app-main"
          className={cn(
            "flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8",
            "bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.04),transparent)]"
          )}
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
