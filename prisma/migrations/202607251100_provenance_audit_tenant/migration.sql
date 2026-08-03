-- Finalization: durable citation snapshots, audit actor retention, and
-- document/chunk matter-tenant composite foreign key.

-- 1) Immutable citation snapshots on research/draft work product
ALTER TABLE "ResearchSession" ADD COLUMN IF NOT EXISTS "citationSnapshot" TEXT;
ALTER TABLE "DraftDocument" ADD COLUMN IF NOT EXISTS "citationSnapshot" TEXT;

-- 2) Audit trail survives user deletion; snapshot actor identity at write time
ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_userId_fkey";
ALTER TABLE "AuditEvent" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AuditEvent" ADD COLUMN IF NOT EXISTS "actorClerkId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN IF NOT EXISTS "actorEmail" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN IF NOT EXISTS "actorName" TEXT;
ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill actor snapshots from current User rows where possible
UPDATE "AuditEvent" AS a
SET
  "actorClerkId" = u."clerkId",
  "actorEmail" = u.email,
  "actorName" = u.name
FROM "User" AS u
WHERE a."userId" = u.id
  AND a."actorClerkId" IS NULL;

-- 3) Tenant invariant: DocumentChunk.matterId must match Document.matterId
CREATE UNIQUE INDEX IF NOT EXISTS "Document_id_matterId_key"
  ON "Document" ("id", "matterId");

-- Drop the document-only FK so we can replace it with the composite FK.
ALTER TABLE "DocumentChunk" DROP CONSTRAINT IF EXISTS "DocumentChunk_documentId_fkey";

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "DocumentChunk_documentId_matterId_fkey"
  FOREIGN KEY ("documentId", "matterId")
  REFERENCES "Document" ("id", "matterId")
  ON DELETE CASCADE ON UPDATE CASCADE;
