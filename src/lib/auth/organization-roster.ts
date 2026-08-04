import type { OrgRole } from "@/lib/auth/roles"

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: OrgRole
}

/** Owners first, then name — shared by unlocked and locked roster readers. */
export function sortOrganizationSummaries(
  summaries: OrganizationSummary[]
): OrganizationSummary[] {
  return [...summaries].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1
    if (b.role === "owner" && a.role !== "owner") return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Prefer the stored active workspace when it still appears in the verified
 * roster; otherwise fall back to an owned org, then the first row.
 */
export function selectActiveOrganizationId(
  organizations: OrganizationSummary[],
  preferredActiveId: string | null | undefined
): string | null {
  if (organizations.length === 0) return null
  if (
    preferredActiveId &&
    organizations.some((org) => org.id === preferredActiveId)
  ) {
    return preferredActiveId
  }
  return (
    organizations.find((org) => org.role === "owner")?.id ??
    organizations[0]?.id ??
    null
  )
}
