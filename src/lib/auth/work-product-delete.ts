/**
 * Pure work-product delete policy for research / drafts / conversations.
 * Mirrors requireWorkProductDelete without Prisma:
 * creators with write may delete their own rows; otherwise delete is required.
 */

export function canDeleteWorkProduct(args: {
  actorUserId: string
  createdByUserId: string | null | undefined
  matterCanWrite: boolean
  matterCanDelete: boolean
}): boolean {
  const isCreator = Boolean(
    args.createdByUserId && args.createdByUserId === args.actorUserId
  )
  if (isCreator) return args.matterCanWrite
  return args.matterCanDelete
}
