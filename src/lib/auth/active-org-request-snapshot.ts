/**
 * Request-scoped active-organization roster snapshot helpers.
 *
 * Shell layout (`listVerifiedUserOrganizationsWithActive`) and page gathers
 * (`getActiveOrganization`) must share one snapshot within a single RSC
 * request. Without dedupe, a concurrent `setActiveOrganization` can leave
 * switcher chrome on org A while list/registry pages authorize and serialize
 * org B (or the reverse after page final publish).
 *
 * Pure get-or-load lives here so node:test can cover dedupe without importing
 * React. Production wires a per-request Map via React `cache` in `rbac.ts`.
 */
import type { OrganizationSummary } from "@/lib/auth/organization-roster"

export type VerifiedOrganizationsSnapshot = {
  organizations: OrganizationSummary[]
  activeOrganizationId: string | null
}

export type VerifiedOrganizationsSnapshotLoader = (
  userId: string
) => Promise<VerifiedOrganizationsSnapshot>

/**
 * Pure get-or-create for an in-flight snapshot promise.
 * Rejected loads are removed so a later retry can succeed in the same store.
 */
export function getOrLoadVerifiedOrganizationsSnapshot<T>(
  store: Map<string, Promise<T>>,
  userId: string,
  load: () => Promise<T>
): Promise<T> {
  const existing = store.get(userId)
  if (existing) return existing

  const pending = load()
  store.set(userId, pending)
  void pending.catch(() => {
    if (store.get(userId) === pending) {
      store.delete(userId)
    }
  })
  return pending
}

/**
 * Bind a loader to a request-scoped store factory (typically `cache(() => new Map())`).
 */
export function createVerifiedOrganizationsSnapshotLoader(
  createStore: () => Map<string, Promise<VerifiedOrganizationsSnapshot>>,
  load: VerifiedOrganizationsSnapshotLoader
): VerifiedOrganizationsSnapshotLoader {
  return (userId: string) =>
    getOrLoadVerifiedOrganizationsSnapshot(createStore(), userId, () =>
      load(userId)
    )
}
