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
      organizations = await listUserOrganizations(user.id)
      // Provisioning always creates a personal org — an empty roster after
      // ensureAppUser means sync failed and must not look like a valid shell.
      if (organizations.length === 0) {
        shellLoadFailed = true
      } else {
        const row = await prisma.user.findUnique({
          where: { id: user.id },
          select: { activeOrganizationId: true },
        })
        activeOrganizationId =
          row?.activeOrganizationId &&
          organizations.some((org) => org.id === row.activeOrganizationId)
            ? row.activeOrganizationId
            : organizations[0]?.id ?? null

        // Final locked reauth for the active workspace before publishing
        // switcher labels/role so a concurrent removal cannot leave a stale
        // selected org in the shell. Other roster rows remain best-effort.
        if (activeOrganizationId) {
          const finalMembership = await requireActiveOrganizationReadMembership(
            user.id,
            activeOrganizationId
          )
          if (!finalMembership.ok) {
            organizations = organizations.filter(
              (org) => org.id !== activeOrganizationId
            )
            activeOrganizationId = organizations[0]?.id ?? null
            if (!activeOrganizationId) {
              shellLoadFailed = true
            }
          } else if (finalMembership.role) {
            organizations = organizations.map((org) =>
              org.id === activeOrganizationId
                ? { ...org, role: finalMembership.role }
                : org
            )
          }
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
