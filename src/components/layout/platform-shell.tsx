"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppTopbar } from "@/components/layout/app-topbar"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "aether-shell-sidebar-collapsed"

const exactTitles: Record<string, { title: string; subtitle?: string }> = {
  "/app": { title: "Dashboard", subtitle: "Operational overview" },
  "/app/matters": { title: "Matters", subtitle: "Matter registry" },
  "/app/matters/new": { title: "Matter intake", subtitle: "Governed initialization" },
  "/app/research": { title: "Research", subtitle: "Authority and retrieval" },
  "/app/drafting": { title: "Drafting", subtitle: "Controlled drafting surface" },
  "/app/documents": { title: "Documents", subtitle: "Intelligence and lineage" },
  "/app/workflows": { title: "Workflows", subtitle: "Orchestration status" },
  "/app/memory": { title: "Memory", subtitle: "Firm and matter memory" },
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

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") {
        setCollapsed(true)
      }
    } catch {
      /* ignore */
    }
    setHydrated(true)
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

  const meta = resolveMeta(pathname)

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
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <AppTopbar
          title={meta.title}
          subtitle={meta.subtitle}
          onOpenSidebar={() => setMobileOpen(true)}
        />
        <main
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
