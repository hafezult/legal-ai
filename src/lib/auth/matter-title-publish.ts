/**
 * Pure publish helper for generation/response matter labels.
 *
 * After content reauth under Matter FOR UPDATE, only the title re-read in that
 * same transaction may be published. Pre-authorize snapshots are probes and
 * must not echo rename-stale labels after the final permission check.
 */
export function resolvePublishMatterTitle(args: {
  lockedTitle: string | null | undefined
}): string | null {
  return typeof args.lockedTitle === "string" ? args.lockedTitle : null
}
