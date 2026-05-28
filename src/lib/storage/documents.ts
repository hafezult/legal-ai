import { STORAGE_BUCKET, getSupabaseAdmin } from "./client"

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

export async function createSignedUrl(path: string, expiresIn = 3600) {
  const client = getSupabaseAdmin()
  return client.storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn)
}

export async function ensureBucket() {
  const client = getSupabaseAdmin()
  const { data: buckets } = await client.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === STORAGE_BUCKET)
  if (!exists) {
    await client.storage.createBucket(STORAGE_BUCKET, {
      public: false,
      allowedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
      ],
      fileSizeLimit: 52428800,
    })
  }
}
