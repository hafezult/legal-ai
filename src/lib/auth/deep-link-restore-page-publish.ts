/**
 * Page-level deep-link restore publish after active-org membership reauth.
 *
 * Error payloads (no bodies) may ship once membership is ok.
 * Body-bearing restores also require post-await work-product liveness and a
 * locked matter title (parity with decideWorkProductRestorePublish /
 * document workstation final serialize).
 *
 * Body rule matches `decideWorkProductRestorePublish` — kept inline so this
 * pure helper stays import-free under node:test.
 */
export function decideDeepLinkRestorePagePublish(args: {
  membershipOk: boolean
  focusedMatterId: string | null | undefined
  pendingMatterId: string | null | undefined
  pendingHasError: boolean
  /** Matter permission + row liveness already verified by the caller under lock. */
  workProductPresent: boolean
  lockedTitle: string | null | undefined
}):
  | { ok: true; mode: "error" }
  | { ok: true; mode: "body"; title: string }
  | { ok: false } {
  if (!args.membershipOk) return { ok: false }

  if (args.pendingHasError) {
    return { ok: true, mode: "error" }
  }

  if (
    typeof args.focusedMatterId !== "string" ||
    args.pendingMatterId !== args.focusedMatterId
  ) {
    return { ok: false }
  }

  if (!args.workProductPresent) return { ok: false }
  if (typeof args.lockedTitle !== "string") return { ok: false }
  return { ok: true, mode: "body", title: args.lockedTitle }
}
