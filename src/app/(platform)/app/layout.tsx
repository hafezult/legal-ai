import { PlatformShell } from "@/components/layout/platform-shell"
import { ensureAppUser } from "@/lib/auth/ensure-user"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await ensureAppUser()
  } catch {
    /* Prisma unavailable — layout still renders; sync retries on navigation */
  }

  return <PlatformShell>{children}</PlatformShell>
}
