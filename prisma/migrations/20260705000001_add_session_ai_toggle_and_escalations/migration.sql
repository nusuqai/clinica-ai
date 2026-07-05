-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escalations_conversationId_idx" ON "escalations"("conversationId");

-- CreateIndex
CREATE INDEX "escalations_sessionId_idx" ON "escalations"("sessionId");

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
