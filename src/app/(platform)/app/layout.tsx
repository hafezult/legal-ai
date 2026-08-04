import { PlatformShell } from "@/components/layout/platform-shell"
import { ensureAppUser } from "@/lib/auth/ensure-user"
import { listVerifiedUserOrganizationsWithActive } from "@/lib/auth/rbac"

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
      // Single transactional roster + active selection: Organization locks in
      // sorted id order, then User. No awaits after this before serialize so
      // concurrent removals cannot leave stale non-active switcher rows.
      const verified = await listVerifiedUserOrganizationsWithActive(user.id)
      organizations = verified.organizations.map((org) => ({
        id: org.id,
        name: org.name,
        role: org.role,
      }))
      activeOrganizationId = verified.activeOrganizationId
      // Provisioning always creates a personal org — an empty roster after
      // ensureAppUser means sync failed and must not look like a valid shell.
      if (organizations.length === 0 || !activeOrganizationId) {
        shellLoadFailed = true
        organizations = []
        activeOrganizationId = null
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
