import { PlatformShell } from "@/components/layout/platform-shell"
import { ensureAppUser } from "@/lib/auth/ensure-user"
import { listUserOrganizations } from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let organizations: { id: string; name: string; role: string }[] = []
  let activeOrganizationId: string | null = null

  try {
    const user = await ensureAppUser()
    if (user) {
      organizations = await listUserOrganizations(user.id)
      const row = await prisma.user.findUnique({
        where: { id: user.id },
        select: { activeOrganizationId: true },
      })
      activeOrganizationId =
        row?.activeOrganizationId &&
        organizations.some((org) => org.id === row.activeOrganizationId)
          ? row.activeOrganizationId
          : organizations[0]?.id ?? null
    }
  } catch {
    /* Prisma unavailable — layout still renders; sync retries on navigation */
  }

  return (
    <PlatformShell
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
    >
      {children}
    </PlatformShell>
  )
}
