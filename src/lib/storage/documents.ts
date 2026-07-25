import { STORAGE_BUCKET, getSupabaseAdmin } from "./client"
import { normalizeStoragePaths } from "./paths"

export type StorageCleanupResult = {
  ok: boolean
  paths: string[]
  error?: string
}

export { normalizeStoragePaths }

export async function uploadToStorage(
  path: string,
  buffer: Buffer,
  mimeType: string
) {
  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  })
}

export async function removeFromStorage(path: string) {
  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).remove([path])
}

export async function removeManyFromStorage(paths: string[]) {
  const uniquePaths = normalizeStoragePaths(paths)
  if (uniquePaths.length === 0) return { data: [], error: null }

  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).remove(uniquePaths)
}

/**
 * Best-effort storage object removal that never throws. Callers should surface
 * `error` when deletion/registration already succeeded in the database so
 * orphaned objects are not silently retained.
 */
export async function cleanupStoragePaths(
  paths: string[]
): Promise<StorageCleanupResult> {
  const uniquePaths = normalizeStoragePaths(paths)
  if (uniquePaths.length === 0) return { ok: true, paths: [] }

  try {
    const { error } = await removeManyFromStorage(uniquePaths)
    if (error) {
      console.error(
        "[storage] cleanup failed:",
        error.message,
        uniquePaths.join(", ")
      )
      return { ok: false, paths: uniquePaths, error: error.message }
    }
    return { ok: true, paths: uniquePaths }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storage cleanup failed"
    console.error("[storage] cleanup failed:", message, uniquePaths.join(", "))
    return { ok: false, paths: uniquePaths, error: message }
  }
}

export async function createSignedUrl(path: string, expiresIn = 3600) {
  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn)
}

function isBucketAlreadyExistsError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? ""
  return (
    message.includes("already exists") ||
    message.includes("duplicate") ||
    message.includes("resource already exists")
  )
}

export async function ensureBucket() {
  const client = getSupabaseAdmin()
  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) {
    throw new Error(`Unable to list storage buckets: ${listError.message}`)
  }

  const exists = buckets?.some((b) => b.name === STORAGE_BUCKET)
  if (exists) return

  const { error: createError } = await client.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    fileSizeLimit: 52428800,
  })

  // Concurrent first uploads can race createBucket; treat exists as success.
  if (createError && !isBucketAlreadyExistsError(createError)) {
    throw new Error(`Unable to create storage bucket: ${createError.message}`)
  }
}
