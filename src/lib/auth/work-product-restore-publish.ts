import { resolvePublishMatterTitle } from "@/lib/auth/matter-title-publish"

/**
 * Final publish gate for research/draft restore after unlocked probes.
 *
 * Membership alone is insufficient: the work-product row must still be live,
 * and response matter labels must come from the title re-read under the same
 * lock (parity with generate + content-proxy liveness).
 */
export function decideWorkProductRestorePublish(args: {
  permissionOk: boolean
  workProductPresent: boolean
  lockedTitle: string | null | undefined
}): { ok: true; title: string } | { ok: false } {
  if (!args.permissionOk || !args.workProductPresent) return { ok: false }
  const title = resolvePublishMatterTitle({ lockedTitle: args.lockedTitle })
  if (title === null) return { ok: false }
  return { ok: true, title }
}
