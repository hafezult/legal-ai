import Link from "next/link"

import { WorkspaceLoadError } from "@/components/platform/workspace-load-error"
import { resolvePlatformClerkId } from "@/lib/auth/require-actor"
import {
  getActiveOrganization,
  roleHasPermission,
} from "@/lib/auth/rbac"
import { prisma } from "@/lib/prisma"
import { NewMatterForm } from "./_new-matter-form"

export const dynamic = "force-dynamic"

export default async function NewMatterPage() {
  const session = await resolvePlatformClerkId()
  if (session.status === "unauthenticated") return null
  if (session.status === "unavailable") {
    return (
      <WorkspaceLoadError
        title="Identity service unavailable"
        description={session.error}
        homeHref="/app/matters"
      />
    )
  }
  const { clerkId } = session

  let canWrite = false
  let loadFailed = false

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    })
    if (!user) {
      // Authenticated Clerk session without a provisioned app user — surface
      // WorkspaceLoadError (same invariant as other platform pages).
      loadFailed = true
    } else {
      const activeOrg = await getActiveOrganization(user.id)
      // Fail closed without an active organization — createMatter refuses
      // legacy organizationId:null inserts; surface intake unavailable here.
      canWrite = activeOrg
        ? roleHasPermission(activeOrg.role, "write")
        : false
      if (!activeOrg) {
        loadFailed = true
      }
    }
  } catch {
    loadFailed = true
  }

  if (loadFailed) {
    return (
      <WorkspaceLoadError
        title="Matter intake unavailable"
        description="Aether could not verify organization permissions for matter creation. Retry in a moment, or check Settings readiness probes if this persists."
        homeHref="/app/matters"
      />
    )
  }

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-white/40">
            Matter intake
          </p>
          <h1 className="mt-2 font-serif text-3xl tracking-tight text-white/[0.96] md:text-4xl">
            Initialize matter
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/45">
            Your organization role is read-only. Ask an admin to grant write access
            before creating new matter workspaces.
          </p>
        </div>
        <div className="rounded-[var(--aether-radius-panel)] border border-white/[0.08] bg-white/[0.015] px-6 py-10 text-center sm:px-8">
          <p className="text-sm text-white/40">
            Matter creation is unavailable for viewer roles in the active organization.
          </p>
          <Link
            href="/app/matters"
            className="mt-6 inline-flex rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm text-white/55 transition-colors duration-200 hover:border-white/[0.16] hover:text-white/78"
          >
            Back to matters
          </Link>
        </div>
      </div>
    )
  }

  return <NewMatterForm />
}
