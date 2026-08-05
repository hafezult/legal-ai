/// <reference types="react/canary" />
/**
 * React `cache` wiring for the active-org request snapshot.
 *
 * Kept separate from the pure helper module so `node:test` can import
 * `active-org-request-snapshot.ts` without resolving React's CJS `cache` export.
 */
import { cache } from "react"

import {
  createVerifiedOrganizationsSnapshotLoader,
  type VerifiedOrganizationsSnapshot,
  type VerifiedOrganizationsSnapshotLoader,
} from "@/lib/auth/active-org-request-snapshot"

const requestSnapshotStore = cache(
  () => new Map<string, Promise<VerifiedOrganizationsSnapshot>>()
)

/** Request-deduped loader for shell + page active-org roster snapshots. */
export function createRequestScopedOrganizationsSnapshotLoader(
  load: VerifiedOrganizationsSnapshotLoader
): VerifiedOrganizationsSnapshotLoader {
  return createVerifiedOrganizationsSnapshotLoader(requestSnapshotStore, load)
}
