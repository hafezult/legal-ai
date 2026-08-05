/**
 * Pure publish gate for Settings access payloads after the combined roster +
 * access-detail transaction returns.
 *
 * The switcher roster and active-org member/invite detail must come from one
 * locked snapshot. If the verified active workspace is missing or access
 * failed closed, withhold the admin panel (members/invites/name) even when a
 * provisional earlier gather existed.
 */
export function decideSettingsAccessPublish(args: {
  activeOrganizationId: string | null
  accessOk: boolean
}): boolean {
  return Boolean(args.activeOrganizationId && args.accessOk)
}
