import { STORAGE_BUCKET, getSupabaseAdmin } from "./client"
import { normalizeStoragePaths, STORAGE_REMOVE_BATCH_SIZE } from "./paths"

export type StorageCleanupResult = {
  ok: boolean
  paths: string[]
  error?: string
}

export { normalizeStoragePaths, STORAGE_REMOVE_BATCH_SIZE }

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
  const removed: { name: string }[] = []
  const failed: string[] = []
  let firstError: { message: string } | null = null

  // Continue independent batches after a failure so one bad path cannot leave
  // every subsequent object unattempted after the DB references are gone.
  for (let i = 0; i < uniquePaths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
    const batch = uniquePaths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE)
    try {
      const { data, error } = await client.storage
        .from(STORAGE_BUCKET)
        .remove(batch)
      if (error) {
        failed.push(...batch)
        firstError ??= { message: error.message }
        continue
      }
      if (data?.length) removed.push(...data)
    } catch (error) {
      failed.push(...batch)
      firstError ??= {
        message:
          error instanceof Error ? error.message : "Storage remove failed",
      }
    }
  }

  if (failed.length > 0) {
    return {
      data: removed,
      error: firstError ?? { message: "Storage remove failed" },
      failedPaths: failed,
    }
  }

  return { data: removed, error: null, failedPaths: [] as string[] }
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
    const { error, failedPaths } = await removeManyFromStorage(uniquePaths)
    if (error) {
      const unresolved =
        failedPaths.length > 0 ? failedPaths : uniquePaths
      console.error(
        "[storage] cleanup failed:",
        error.message,
        unresolved.join(", ")
      )
      return { ok: false, paths: unresolved, error: error.message }
    }
    return { ok: true, paths: uniquePaths }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Storage cleanup failed"
    console.error("[storage] cleanup failed:", message, uniquePaths.join(", "))
    return { ok: false, paths: uniquePaths, error: message }
  }
}

/**
 * Download a private storage object for the authenticated app-route byte proxy.
 * Prefer this over long-lived signed URLs so each byte fetch re-checks matter
 * permission under lock instead of remaining valid after membership revoke.
 */
export async function downloadFromStorage(path: string) {
  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).download(path)
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
