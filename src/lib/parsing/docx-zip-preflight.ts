/**
 * Structural DOCX (ZIP/OOXML) preflight before mammoth expansion.
 * Rejects zip bombs, path traversal, Zip64, and non-document archives.
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const EOCD_MIN_SIZE = 22
const CENTRAL_DIRECTORY_HEADER_SIZE = 46

/** Typical DOCX packages are small; hard-cap entry count against zip bombs. */
export const DOCX_MAX_ZIP_ENTRIES = 2_000

/**
 * Uncompressed payload budget (~4× the 50 MB upload cap). Real briefs stay
 * well under this; zip bombs inflate far beyond it.
 */
export const DOCX_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024

/** Single-entry uncompressed ceiling. */
export const DOCX_MAX_ENTRY_UNCOMPRESSED_BYTES = 100 * 1024 * 1024

/**
 * Reject highly compressible large entries (classic zip-bomb ratio).
 * Small entries are exempt — OOXML has tiny highly-compressed XML stubs.
 */
export const DOCX_MAX_COMPRESSION_RATIO = 100
export const DOCX_RATIO_CHECK_MIN_COMPRESSED_BYTES = 1_024

const REQUIRED_ENTRIES = ["[content_types].xml", "word/document.xml"] as const

export type DocxZipPreflightOk = { ok: true; entryCount: number; uncompressedBytes: number }
export type DocxZipPreflightErr = { ok: false; error: string }
export type DocxZipPreflightResult = DocxZipPreflightOk | DocxZipPreflightErr

function readUInt32LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset)
}

function readUInt16LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset)
}

/** Locate the end-of-central-directory record (supports short comments). */
export function findEndOfCentralDirectory(buffer: Buffer): number | null {
  if (buffer.length < EOCD_MIN_SIZE) return null
  const maxComment = 0xffff
  const start = Math.max(0, buffer.length - (EOCD_MIN_SIZE + maxComment))
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= start; i -= 1) {
    if (readUInt32LE(buffer, i) === EOCD_SIGNATURE) {
      const commentLength = readUInt16LE(buffer, i + 20)
      if (i + EOCD_MIN_SIZE + commentLength === buffer.length) {
        return i
      }
    }
  }
  return null
}

function isUnsafeEntryName(name: string): boolean {
  if (!name || name.includes("\0")) return true
  const normalized = name.replace(/\\/g, "/")
  if (normalized.startsWith("/") || normalized.startsWith("../")) return true
  if (normalized.split("/").some((part) => part === "..")) return true
  return false
}

/**
 * Validate DOCX ZIP structure without decompressing entry payloads.
 */
export function assertSafeDocxZip(buffer: Buffer): DocxZipPreflightResult {
  // Local PK magic (also checked at upload) — fail closed before EOCD walk.
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    ![0x03, 0x05, 0x07].includes(buffer[2] ?? -1)
  ) {
    return { ok: false, error: "DOCX archive signature is invalid." }
  }

  const eocdOffset = findEndOfCentralDirectory(buffer)
  if (eocdOffset == null) {
    return { ok: false, error: "DOCX archive is missing an end-of-central-directory record." }
  }

  const diskNumber = readUInt16LE(buffer, eocdOffset + 4)
  const cdDisk = readUInt16LE(buffer, eocdOffset + 6)
  const entriesOnDisk = readUInt16LE(buffer, eocdOffset + 8)
  const totalEntries = readUInt16LE(buffer, eocdOffset + 10)
  const cdSize = readUInt32LE(buffer, eocdOffset + 12)
  const cdOffset = readUInt32LE(buffer, eocdOffset + 16)

  if (diskNumber !== 0 || cdDisk !== 0) {
    return { ok: false, error: "Multi-disk DOCX archives are not supported." }
  }
  if (entriesOnDisk !== totalEntries) {
    return { ok: false, error: "DOCX central directory entry counts disagree." }
  }
  if (totalEntries === 0) {
    return { ok: false, error: "DOCX archive has no entries." }
  }
  if (totalEntries > DOCX_MAX_ZIP_ENTRIES) {
    return {
      ok: false,
      error: `DOCX archive has too many entries (${totalEntries}).`,
    }
  }
  if (cdOffset + cdSize > buffer.length) {
    return { ok: false, error: "DOCX central directory is truncated." }
  }
  // Zip64 uses 0xffffffff markers — reject rather than parse extended records.
  if (cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return { ok: false, error: "Zip64 DOCX archives are not supported." }
  }

  let cursor = cdOffset
  const cdEnd = cdOffset + cdSize
  let uncompressedTotal = 0
  const names = new Set<string>()

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + CENTRAL_DIRECTORY_HEADER_SIZE > cdEnd) {
      return { ok: false, error: "DOCX central directory is truncated." }
    }
    if (readUInt32LE(buffer, cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      return { ok: false, error: "DOCX central directory entry signature is invalid." }
    }

    const compressedSize = readUInt32LE(buffer, cursor + 20)
    const uncompressedSize = readUInt32LE(buffer, cursor + 24)
    const nameLength = readUInt16LE(buffer, cursor + 28)
    const extraLength = readUInt16LE(buffer, cursor + 30)
    const commentLength = readUInt16LE(buffer, cursor + 32)

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff
    ) {
      return { ok: false, error: "Zip64 DOCX entries are not supported." }
    }

    const nameStart = cursor + CENTRAL_DIRECTORY_HEADER_SIZE
    const nameEnd = nameStart + nameLength
    const recordEnd = nameEnd + extraLength + commentLength
    if (recordEnd > cdEnd) {
      return { ok: false, error: "DOCX central directory entry is truncated." }
    }

    const name = buffer.subarray(nameStart, nameEnd).toString("utf8")
    if (isUnsafeEntryName(name)) {
      return { ok: false, error: "DOCX archive contains an unsafe entry path." }
    }

    if (uncompressedSize > DOCX_MAX_ENTRY_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        error: "DOCX entry exceeds the uncompressed size limit.",
      }
    }

    uncompressedTotal += uncompressedSize
    if (uncompressedTotal > DOCX_MAX_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        error: "DOCX archive exceeds the total uncompressed size limit.",
      }
    }

    if (
      compressedSize >= DOCX_RATIO_CHECK_MIN_COMPRESSED_BYTES &&
      uncompressedSize / compressedSize > DOCX_MAX_COMPRESSION_RATIO
    ) {
      return {
        ok: false,
        error: "DOCX entry compression ratio looks like a zip bomb.",
      }
    }

    names.add(name.replace(/\\/g, "/").toLowerCase())
    cursor = recordEnd
  }

  if (cursor !== cdEnd) {
    return { ok: false, error: "DOCX central directory size does not match entries." }
  }

  for (const required of REQUIRED_ENTRIES) {
    if (!names.has(required)) {
      return {
        ok: false,
        error: `DOCX archive is missing required entry ${required}.`,
      }
    }
  }

  return {
    ok: true,
    entryCount: totalEntries,
    uncompressedBytes: uncompressedTotal,
  }
}
