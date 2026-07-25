-- Matter-scoped grounded drafting outputs prepared from retrieval-ready sources.
CREATE TABLE "DraftDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "draftType" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "content" TEXT,
    "chunkIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftDocument_userId_createdAt_idx" ON "DraftDocument"("userId", "createdAt");

CREATE INDEX "DraftDocument_matterId_idx" ON "DraftDocument"("matterId");

ALTER TABLE "DraftDocument"
    ADD CONSTRAINT "DraftDocument_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftDocument"
    ADD CONSTRAINT "DraftDocument_matterId_fkey"
    FOREIGN KEY ("matterId") REFERENCES "Matter"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
