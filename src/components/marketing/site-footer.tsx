"use client"

import { Container } from "@/components/marketing/primitives"
import { cn } from "@/lib/utils"

const labelClass =
  "text-[11px] font-medium uppercase tracking-[0.28em] text-white/38"
const linkClass =
  "text-sm text-white/[0.58] transition-colors duration-300 ease-out hover:text-white/[0.88]"

function FooterCol({
  title,
  links,
}: {
  title: string
  links: { href: string; label: string }[]
}) {
  return (
    <div className="space-y-4">
      <div className={labelClass}>{title}</div>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <a href={l.href} className={linkClass}>
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      id="resources"
      className={cn(
        "relative z-10 border-t border-white/[0.06] bg-black pb-12 pt-16 text-white md:pb-16 md:pt-20",
        className
      )}
    >
      <Container>
        <div
          id="about"
          className="grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-12"
        >
          <FooterCol
            title="Product"
            links={[
              { href: "#platform", label: "Platform" },
              { href: "#orchestration", label: "Orchestration" },
              { href: "#showcase", label: "Workspace" },
              { href: "#trust", label: "Security" },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { href: "#about", label: "About" },
              { href: "#", label: "Careers" },
              { href: "#", label: "Press" },
              { href: "#", label: "Contact" },
            ]}
          />
          <FooterCol
            title="Resources"
            links={[
              { href: "#", label: "Documentation" },
              { href: "#", label: "Trust center" },
              { href: "#", label: "Status" },
              { href: "#", label: "Blog" },
            ]}
          />
          <div className="col-span-2 space-y-4 md:col-span-1">
            <div className={labelClass}>Aether</div>
            <p className="max-w-xs text-sm leading-relaxed text-white/[0.52]">
              Operating system for modern legal intelligence—workflow orchestration,
              reasoning, and enterprise-grade document systems.
            </p>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/[0.06] pt-8 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-white/40">© {new Date().getFullYear()} Aether. All rights reserved.</div>
          <div className="flex flex-wrap gap-6">
            <a
              href="#"
              className="text-xs text-white/45 underline-offset-4 transition-colors duration-300 hover:text-white/75 hover:underline"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-xs text-white/45 underline-offset-4 transition-colors duration-300 hover:text-white/75 hover:underline"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-xs text-white/45 underline-offset-4 transition-colors duration-300 hover:text-white/75 hover:underline"
            >
              Cookies
            </a>
          </div>
        </div>
      </Container>
    </footer>
  )
}
