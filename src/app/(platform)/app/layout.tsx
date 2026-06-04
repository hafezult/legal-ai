import { PlatformShell } from "@/components/layout/platform-shell"
import { AetherClerkProvider } from "@/components/providers/aether-clerk-provider"
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

  return (
    <AetherClerkProvider>
      <PlatformShell>{children}</PlatformShell>
    </AetherClerkProvider>
  )
}
