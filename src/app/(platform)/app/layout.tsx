import { PlatformShell } from "@/components/layout/platform-shell"
import { ensureAppUser } from "@/lib/auth/ensure-user"
import {
  listUserOrganizations,
  requireActiveOrganizationReadMembership,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let organizations: { id: string; name: string; role: string }[] = []
  let activeOrganizationId: string | null = null
  let shellLoadFailed = false

  try {
    // Membership requires explicit Accept on /app/invites/[token] — never
    // auto-join (and never switch activeOrganizationId) on general navigation.
    const user = await ensureAppUser({ acceptPendingInvites: false })
    if (user) {
      const roster = await listUserOrganizations(user.id)
      // Provisioning always creates a personal org — an empty roster after
      // ensureAppUser means sync failed and must not look like a valid shell.
      if (roster.length === 0) {
        shellLoadFailed = true
      } else {
        // Locked reauth for every switcher row before publish so concurrent
        // removals cannot leave stale org names/roles in the shell roster.
        const verified: { id: string; name: string; role: string }[] = []
        for (const org of roster) {
          const membership = await requireActiveOrganizationReadMembership(
            user.id,
            org.id
          )
          if (!membership.ok || !membership.role) continue
          verified.push({
            id: org.id,
            name: org.name,
            role: membership.role,
          })
        }
        organizations = verified
        if (organizations.length === 0) {
          shellLoadFailed = true
        } else {
          const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { activeOrganizationId: true },
          })
          let selected =
            row?.activeOrganizationId &&
            organizations.some((org) => org.id === row.activeOrganizationId)
              ? row.activeOrganizationId
              : organizations[0]?.id ?? null

          // Final locked reauth for the selected workspace immediately before
          // serialize (after roster verification and active-id read). Retry the
          // next verified row if the selection was revoked mid-flight.
          while (selected) {
            const finalMembership =
              await requireActiveOrganizationReadMembership(user.id, selected)
            if (finalMembership.ok) {
              if (finalMembership.role) {
                const lockedRole = finalMembership.role
                organizations = organizations.map((org) =>
                  org.id === selected ? { ...org, role: lockedRole } : org
                )
              }
              break
            }
            organizations = organizations.filter((org) => org.id !== selected)
            selected = organizations[0]?.id ?? null
          }
          if (!selected) {
            shellLoadFailed = true
          }
          activeOrganizationId = selected
        }
      }
    }
  } catch {
    shellLoadFailed = true
  }

  return (
    <PlatformShell
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      shellLoadFailed={shellLoadFailed}
    >
      {children}
    </PlatformShell>
  )
}
