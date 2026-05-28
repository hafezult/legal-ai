"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { ensureBucket, removeFromStorage, uploadToStorage } from "@/lib/storage/documents"

export type DocumentUploadState = {
  error?: string
  success?: boolean
}

const ALLOWED_MIME: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "text/plain": true,
}

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120)
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

  if (!ALLOWED_MIME[file.type]) {
    return { error: "Unsupported format. Accepted: PDF, DOCX, TXT." }
  }
  if (file.size > MAX_BYTES) {
    return { error: "File exceeds the 50 MB ingestion limit." }
  }

  // Validate matter ownership — no client-side trust
  let userId: string
  try {
    const user = await prisma.user.findUnique({ where: { clerkId } })
    if (!user) return { error: "Session not found. Please sign in again." }

    const matter = await prisma.matter.findFirst({
      where: { id: matterId, userId: user.id },
      select: { id: true },
    })
    if (!matter) return { error: "Matter not found or access denied." }

    userId = user.id
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

  const { error: storageErr } = await uploadToStorage(storagePath, buffer, file.type)
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
        mimeType: file.type,
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

  void userId // available for future audit log

  // Fire-and-forget: trigger async indexing pipeline
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3001}`
  void fetch(`${appUrl}/api/index-document/${documentId}`, {
    method: "POST",
    headers: { "x-aether-secret": process.env.INDEXING_SECRET ?? "" },
  }).catch(() => null)

  revalidatePath(`/app/matters/${matterId}`)
  return { success: true }
}
