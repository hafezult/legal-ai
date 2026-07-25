"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2 } from "lucide-react"

import { switchActiveOrganization } from "@/app/(platform)/app/settings/actions"
import { cn } from "@/lib/utils"

export type ShellOrganization = {
  id: string
  name: string
  role: string
}

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  collapsed,
}: {
  organizations: ShellOrganization[]
  activeOrganizationId: string | null
  collapsed?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (organizations.length === 0) return null

  const active =
    organizations.find((org) => org.id === activeOrganizationId) ?? organizations[0]

  if (organizations.length === 1) {
    return (
      <div className={cn("px-1", collapsed && "lg:px-0 lg:text-center")}>
        <p
          className={cn(
            "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35",
            collapsed && "lg:justify-center"
          )}
        >
          <Building2 className="size-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
          <span className={cn(collapsed && "lg:hidden")}>Workspace</span>
        </p>
        <p
          className={cn(
            "mt-1 truncate text-[11px] leading-relaxed text-white/45",
            collapsed && "lg:hidden"
          )}
          title={active.name}
        >
          {active.name}
        </p>
      </div>
    )
  }

  return (
    <div className={cn("px-1", collapsed && "lg:px-0")}>
      <p
        className={cn(
          "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35",
          collapsed && "lg:justify-center"
        )}
      >
        <Building2 className="size-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
        <span className={cn(collapsed && "lg:hidden")}>Workspace</span>
      </p>
      <select
        value={active.id}
        disabled={isPending}
        aria-label="Switch active organization"
        title={collapsed ? active.name : undefined}
        onChange={(e) => {
          const nextId = e.target.value
          if (nextId === active.id) return
          startTransition(async () => {
            const result = await switchActiveOrganization(nextId)
            if (!result.error) router.refresh()
          })
        }}
        className={cn(
          "mt-1.5 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-[11px] text-white/70 outline-none transition-colors hover:border-white/[0.14] focus:border-white/[0.18] disabled:opacity-50",
          collapsed && "lg:px-1 lg:text-[10px]"
        )}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  )
}
