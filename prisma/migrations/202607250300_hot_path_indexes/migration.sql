-- Hot-path indexes for matter-scoped list/access queries
CREATE INDEX IF NOT EXISTS "Matter_userId_idx" ON "Matter"("userId");
CREATE INDEX IF NOT EXISTS "Conversation_matterId_idx" ON "Conversation"("matterId");
CREATE INDEX IF NOT EXISTS "Document_matterId_idx" ON "Document"("matterId");
CREATE INDEX IF NOT EXISTS "ResearchSession_matterId_idx" ON "ResearchSession"("matterId");
CREATE INDEX IF NOT EXISTS "ResearchSession_userId_createdAt_idx" ON "ResearchSession"("userId", "createdAt");
