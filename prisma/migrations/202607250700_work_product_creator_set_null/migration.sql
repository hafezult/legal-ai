-- Preserve research/draft work product on User deletion (org matters retain
-- matter-scoped history; delete policy already treats null creator as
-- requiring matter delete permission).

ALTER TABLE "ResearchSession" DROP CONSTRAINT IF EXISTS "ResearchSession_userId_fkey";
ALTER TABLE "ResearchSession" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ResearchSession"
  ADD CONSTRAINT "ResearchSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DraftDocument" DROP CONSTRAINT IF EXISTS "DraftDocument_userId_fkey";
ALTER TABLE "DraftDocument" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "DraftDocument"
  ADD CONSTRAINT "DraftDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
