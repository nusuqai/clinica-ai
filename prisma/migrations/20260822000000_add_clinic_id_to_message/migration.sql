-- Add as nullable first (existing rows need backfill)
ALTER TABLE "messages" ADD COLUMN "clinicId" UUID;

-- Backfill from the parent conversation
UPDATE "messages" m
SET "clinicId" = c."clinicId"
FROM "conversations" c
WHERE m."conversationId" = c.id;

-- Now enforce NOT NULL
ALTER TABLE "messages" ALTER COLUMN "clinicId" SET NOT NULL;

-- FK + index
ALTER TABLE "messages" ADD CONSTRAINT "messages_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"(id) ON DELETE CASCADE;

CREATE INDEX "messages_clinicId_idx" ON "messages"("clinicId");