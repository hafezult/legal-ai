import assert from "node:assert/strict"
import { deflateRawSync } from "node:zlib"
import { describe, it } from "node:test"

import {
  assertSafeDocxZip,
  DOCX_MAX_ZIP_ENTRIES,
  findEndOfCentralDirectory,
} from "./docx-zip-preflight.ts"

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

type ZipEntry = {
  name: string
  data: Buffer
  /** Store (0) or deflate (8). */
  method?: 0 | 8
  /** Override declared uncompressed size (for bomb tests). */
  declaredUncompressed?: number
  /** Override declared compressed size. */
  declaredCompressed?: number
}

/** Minimal ZIP builder (single-disk, no Zip64, no encryption). */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8")
    const method = entry.method ?? 0
    const payload =
      method === 8 ? deflateRawSync(entry.data) : entry.data
    const compSize = entry.declaredCompressed ?? payload.length
    const uncompSize = entry.declaredUncompressed ?? entry.data.length
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30 + nameBuf.length + payload.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0, 12) // date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compSize, 18)
    local.writeUInt32LE(uncompSize, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra
    nameBuf.copy(local, 30)
    payload.copy(local, 30 + nameBuf.length)

    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compSize, 20)
    central.writeUInt32LE(uncompSize, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const cdOffset = offset
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, cd, eocd])
}

const minimalDocxEntries = (): ZipEntry[] => [
  { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
  { name: "word/document.xml", data: Buffer.from("<w:document/>") },
]

describe("docx zip preflight", () => {
  it("accepts a minimal OOXML package", () => {
    const zip = buildZip(minimalDocxEntries())
    const result = assertSafeDocxZip(zip)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.entryCount, 2)
      assert.ok(result.uncompressedBytes > 0)
    }
    assert.ok(findEndOfCentralDirectory(zip) != null)
  })

  it("rejects non-ZIP buffers", () => {
    const result = assertSafeDocxZip(Buffer.from("%PDF-1.4"))
    assert.equal(result.ok, false)
  })

  it("rejects archives missing word/document.xml", () => {
    const zip = buildZip([
      { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    ])
    const result = assertSafeDocxZip(zip)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /word\/document\.xml/)
    }
  })

  it("rejects path traversal entry names", () => {
    const zip = buildZip([
      ...minimalDocxEntries(),
      { name: "../evil.txt", data: Buffer.from("x") },
    ])
    const result = assertSafeDocxZip(zip)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /unsafe entry path/)
    }
  })

  it("rejects high compression-ratio bombs", () => {
    // Central-directory sizes claim a >100× expansion over a ≥1 KiB payload.
    const zip = buildZip([
      ...minimalDocxEntries(),
      {
        name: "word/bomb.bin",
        data: Buffer.alloc(2_048, 0),
        method: 8,
        declaredCompressed: 2_048,
        declaredUncompressed: 2_048 * 200,
      },
    ])
    const result = assertSafeDocxZip(zip)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /zip bomb/i)
    }
  })

  it("rejects archives with too many entries", () => {
    const entries: ZipEntry[] = [
      ...minimalDocxEntries(),
      ...Array.from({ length: DOCX_MAX_ZIP_ENTRIES }, (_, i) => ({
        name: `word/pad-${i}.xml`,
        data: Buffer.from("x"),
      })),
    ]
    const zip = buildZip(entries)
    const result = assertSafeDocxZip(zip)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.match(result.error, /too many entries/)
    }
  })
})
