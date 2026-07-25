-- Persist ordered messages inside matter conversation threads.
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationMessage_conversationId_idx" ON "ConversationMessage"("conversationId");

ALTER TABLE "ConversationMessage"
    ADD CONSTRAINT "ConversationMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
