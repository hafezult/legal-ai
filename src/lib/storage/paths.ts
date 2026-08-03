import { randomUUID } from "node:crypto"

/** Deduplicate and drop empty storage object paths. */
export function normalizeStoragePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => Boolean(path?.trim())))]
}

/** Supabase Storage remove() batch size — avoid giant single-request deletes. */
export const STORAGE_REMOVE_BATCH_SIZE = 100

/**
 * Build a collision-resistant object key for an uploaded document.
 * Includes a UUID so same-ms uploads of the same filename cannot collide.
 */
export function buildDocumentStoragePath(args: {
  clerkId: string
  matterId: string
  fileName: string
  id?: string
}): string {
  const safeName = args.fileName.trim() || "document"
  const unique = args.id?.trim() || randomUUID()
  return `${args.clerkId}/${args.matterId}/${unique}-${safeName}`
}
