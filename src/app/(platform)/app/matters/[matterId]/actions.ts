"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { ensureAppUser } from "@/lib/auth/ensure-user"
import { prisma } from "@/lib/prisma"
import { ensureBucket, removeFromStorage, uploadToStorage } from "@/lib/storage/documents"
import { runIndexingPipeline } from "@/lib/workflows/indexing"

export type DocumentUploadState = {
  error?: string
  success?: boolean
}

const ALLOWED_MIME: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "text/plain": true,
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
}

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120)
}

function inferMimeType(file: File): string | null {
  if (ALLOWED_MIME[file.type]) return file.type

  const ext = file.name.toLowerCase().split(".").pop()
  return ext ? MIME_BY_EXTENSION[ext] ?? null : null
}

export async function uploadDocument(
  matterId: string,
  _prev: DocumentUploadState,
  formData: FormData
): Promise<DocumentUploadState> {
  const { userId: clerkId } = auth()
  if (!clerkId) return { error: "Authentication required." }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) return { error: "No file provided." }

  const mimeType = inferMimeType(file)
  if (!mimeType) {
    return { error: "Unsupported format. Accepted: PDF, DOCX, TXT." }
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the 50 MB ingestion limit." }
  }

  // Validate matter ownership — no client-side trust
  try {
    const user = await ensureAppUser()
    if (!user) return { error: "Session not found. Please sign in again." }

    const matter = await prisma.matter.findFirst({
      where: { id: matterId, userId: user.id },
      select: { id: true },
    })
    if (!matter) return { error: "Matter not found or access denied." }
  } catch {
    return { error: "Data layer unreachable. Please try again." }
  }

  // Ensure storage bucket exists
  try {
    await ensureBucket()
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Storage not configured."
    return { error: msg }
  }

  const storagePath = `${clerkId}/${matterId}/${Date.now()}-${sanitizeName(file.name)}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: storageErr } = await uploadToStorage(storagePath, buffer, mimeType)
  if (storageErr) {
    return { error: `Ingestion failed: ${storageErr.message}` }
  }

  let documentId: string
  try {
    const created = await prisma.document.create({
      data: {
        matterId,
        fileName: file.name,
        storagePath,
        mimeType,
        fileSize: file.size,
        uploadStatus: "uploaded",
        indexingStatus: "pending",
        retrievalStatus: "pending",
      },
    })
    documentId = created.id
  } catch {
    await removeFromStorage(storagePath).catch(() => null)
    return { error: "Document registration failed. Storage entry removed." }
  }

  // Fire-and-forget local pipeline keeps uploads responsive without relying on an app URL.
  void runIndexingPipeline(documentId).catch((error) => {
    console.error(`[indexing:${documentId}]`, error)
  })

  revalidatePath(`/app/matters/${matterId}`)
  return { success: true }
}
