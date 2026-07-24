-- Normalize emails and enforce uniqueness for invite/member matching.
UPDATE "User"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));

-- Disambiguate any duplicate emails before the unique index lands.
WITH ranked AS (
  SELECT
    "id",
    "email",
    ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "User"
)
UPDATE "User" AS u
SET "email" = u."email" || '+dup-' || u."id"
FROM ranked
WHERE u."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
