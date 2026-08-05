-- Constrain organization membership and invite roles at the database layer.
CREATE TYPE "OrganizationRole" AS ENUM ('viewer', 'member', 'admin', 'owner');

-- Normalize any unexpected legacy values before the typed cast.
UPDATE "OrganizationMember"
SET "role" = 'member'
WHERE "role" NOT IN ('viewer', 'member', 'admin', 'owner');

UPDATE "OrganizationInvite"
SET "role" = 'member'
WHERE "role" NOT IN ('viewer', 'member', 'admin', 'owner');

ALTER TABLE "OrganizationMember"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "OrganizationRole" USING ("role"::"OrganizationRole"),
  ALTER COLUMN "role" SET DEFAULT 'member'::"OrganizationRole";

ALTER TABLE "OrganizationInvite"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "OrganizationRole" USING ("role"::"OrganizationRole"),
  ALTER COLUMN "role" SET DEFAULT 'member'::"OrganizationRole";
