-- Align Conversation creators with research/draft SetNull semantics, and add
-- indexes for opportunistic audit/invite purge hot paths.

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "OrganizationInvite_acceptedAt_expiresAt_idx"
  ON "OrganizationInvite"("acceptedAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx"
  ON "AuditEvent"("createdAt");
