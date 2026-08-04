import type { Prisma } from "@prisma/client"

type DbClient = Pick<Prisma.TransactionClient, "$queryRaw">

export type WorkProductPresence = {
  hasBody: boolean
  chunkCount: number
}

async function resolveDb(db?: DbClient): Promise<DbClient> {
  if (db) return db
  const { prisma } = await import("../prisma")
  return prisma
}

/**
 * Presence/count flags for research sessions without selecting response text or
 * chunk id arrays into Node (list surfaces only need booleans/counts).
 */
export async function researchSessionPresenceByIds(
  ids: string[],
  db?: DbClient
): Promise<Map<string, WorkProductPresence>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const client = await resolveDb(db)
  const rows = await client.$queryRaw<
    Array<{ id: string; hasBody: boolean; chunkCount: number }>
  >`
    SELECT
      id,
      (NULLIF(BTRIM(response), '') IS NOT NULL) AS "hasBody",
      COALESCE(cardinality("chunkIds"), 0)::int AS "chunkCount"
    FROM "ResearchSession"
    WHERE id = ANY(${unique}::text[])
  `

  return new Map(
    rows.map((row) => [
      row.id,
      { hasBody: row.hasBody, chunkCount: row.chunkCount },
    ])
  )
}

/**
 * Presence/count flags for drafts without selecting instruction-derived bodies
 * or chunk id arrays into Node.
 */
export async function draftDocumentPresenceByIds(
  ids: string[],
  db?: DbClient
): Promise<Map<string, WorkProductPresence>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const client = await resolveDb(db)
  const rows = await client.$queryRaw<
    Array<{ id: string; hasBody: boolean; chunkCount: number }>
  >`
    SELECT
      id,
      (NULLIF(BTRIM(content), '') IS NOT NULL) AS "hasBody",
      COALESCE(cardinality("chunkIds"), 0)::int AS "chunkCount"
    FROM "DraftDocument"
    WHERE id = ANY(${unique}::text[])
  `

  return new Map(
    rows.map((row) => [
      row.id,
      { hasBody: row.hasBody, chunkCount: row.chunkCount },
    ])
  )
}
