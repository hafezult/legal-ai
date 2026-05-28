"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLink =
  "text-[14px] font-medium tracking-[-0.01em] text-white/[0.52] antialiased transition-colors duration-300 ease-out hover:text-white/[0.92]"

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "fixed top-5 left-1/2 z-50 w-full -translate-x-1/2 px-4 sm:px-6 md:top-6",
        className
      )}
    >
      <div
        className="relative mx-auto flex max-w-6xl items-center justify-between rounded-[var(--aether-radius-pill)] border border-[color:var(--aether-glass-border)] bg-[color:var(--aether-glass-surface-deep)] px-4 py-2 pl-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-md md:px-5 md:py-2.5"
        style={{
          backdropFilter: "blur(var(--aether-glass-blur))",
          WebkitBackdropFilter: "blur(var(--aether-glass-blur))",
        }}
      >
        <div className="text-lg font-serif tracking-tight text-white/90 md:text-xl">
          Aether
        </div>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          <a href="#platform" className={navLink}>
            Platform
          </a>
          <a href="#ecosystem" className={navLink}>
            Solutions
          </a>
          <a href="#trust" className={navLink}>
            Security
          </a>
          <a href="#resources" className={navLink}>
            Resources
          </a>
          <a href="#about" className={navLink}>
            About
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-white/[0.52] transition-colors duration-300 ease-out hover:bg-white/[0.06] hover:text-white/[0.92]"
            asChild
          >
            <Link href="/sign-in">Login</Link>
          </Button>
          <Button
            size="sm"
            className="rounded-full bg-white/95 px-3.5 text-black hover:bg-white"
            asChild
          >
            <Link href="/sign-up">Request Demo</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
