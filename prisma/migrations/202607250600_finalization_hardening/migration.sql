-- Finalization hardening:
-- 1) Hash invite tokens at rest (pgcrypto digest)
-- 2) Preserve org-shared matters when a creator user row is deleted
-- 3) Enforce a single organization owner at the database layer
-- 4) Indexing run lease id for stale-reclaim safety
-- 5) Conversation creator for work-product delete policy

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Invite tokens: migrate plaintext -> SHA-256 hex, rename column to tokenHash
ALTER TABLE "OrganizationInvite" ADD COLUMN "tokenHash" TEXT;

UPDATE "OrganizationInvite"
SET "tokenHash" = encode(digest("token", 'sha256'), 'hex')
WHERE "tokenHash" IS NULL;

ALTER TABLE "OrganizationInvite" ALTER COLUMN "tokenHash" SET NOT NULL;

DROP INDEX IF EXISTS "OrganizationInvite_token_key";
ALTER TABLE "OrganizationInvite" DROP COLUMN "token";
CREATE UNIQUE INDEX "OrganizationInvite_tokenHash_key" ON "OrganizationInvite"("tokenHash");

-- Matter creator: allow SetNull on user delete (preserve org-shared matters)
ALTER TABLE "Matter" DROP CONSTRAINT IF EXISTS "Matter_userId_fkey";
ALTER TABLE "Matter" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Matter"
  ADD CONSTRAINT "Matter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Single owner per organization (partial unique index)
CREATE UNIQUE INDEX "OrganizationMember_one_owner_per_org"
  ON "OrganizationMember" ("organizationId")
  WHERE role = 'owner';

-- Indexing lease
ALTER TABLE "Document" ADD COLUMN "indexingRunId" TEXT;
CREATE INDEX "Document_indexingRunId_idx" ON "Document"("indexingRunId");

-- Conversation creator for delete policy
ALTER TABLE "Conversation" ADD COLUMN "createdByUserId" TEXT;
CREATE INDEX "Conversation_createdByUserId_idx" ON "Conversation"("createdByUserId");
