/**
 * Final registry list publish helpers.
 *
 * Cross-matter list pages gather bounded rows outside a transaction for
 * latency, then must re-confirm those ids under the same final active-org
 * membership transaction before serialize. Membership alone is not enough —
 * a concurrent deleteMatter / deleteDocument can tombstone descriptors
 * (client names, file names, matter titles) while the actor still belongs to
 * the gathered organization.
 *
 * Preserve first-gather order; omit tombstones; ship only locked field values.
 */
export function selectLiveRegistryRows<TLive>(args: {
  probedIds: readonly string[]
  lockedById: ReadonlyMap<string, TLive>
}): TLive[] {
  const out: TLive[] = []
  for (const id of args.probedIds) {
    const live = args.lockedById.get(id)
    if (live) out.push(live)
  }
  return out
}
