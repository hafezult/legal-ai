export const ALLOWED_DOCUMENT_MIME: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "text/plain": true,
}

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024 // 50 MB

export const DOCUMENT_TYPES = {
  pdf: {
    extension: ".pdf",
    mimeType: "application/pdf",
  },
  docx: {
    extension: ".docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  txt: {
    extension: ".txt",
    mimeType: "text/plain",
  },
} as const

export type DocumentType = keyof typeof DOCUMENT_TYPES

export type DetectedDocument = {
  type: DocumentType
  mimeType: string
}

/** Detect allowed PDF/DOCX/TXT uploads by extension and declared MIME. */
export function detectAllowedDocument(file: {
  name: string
  type: string
}): DetectedDocument | null {
  const lowerName = file.name.toLowerCase()
  const match = Object.entries(DOCUMENT_TYPES).find(([, config]) =>
    lowerName.endsWith(config.extension)
  )

  if (!match) return null

  const [type, config] = match as [DocumentType, (typeof DOCUMENT_TYPES)[DocumentType]]
  if (file.type && file.type !== config.mimeType) return null

  return { type, mimeType: config.mimeType }
}

/** Magics / content checks that reject obvious extension spoofing. */
export function hasExpectedSignature(
  type: DocumentType,
  buffer: Uint8Array
): boolean {
  switch (type) {
    case "pdf":
      return Buffer.from(buffer.subarray(0, 5)).toString("utf8") === "%PDF-"
    case "docx":
      return (
        buffer.length > 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        [0x03, 0x05, 0x07].includes(buffer[2] ?? -1)
      )
    case "txt":
      return !buffer.subarray(0, 1024).includes(0x00)
  }
}

/** Normalize upload filenames for storage object keys. */
export function sanitizeUploadName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120)
}
