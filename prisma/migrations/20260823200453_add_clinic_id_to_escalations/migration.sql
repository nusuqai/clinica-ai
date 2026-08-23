-- AlterTable
-- Step 1: add the column as nullable so it can be created on a table that
-- already has rows.
ALTER TABLE "escalations" ADD COLUMN "clinicId" UUID;

-- Step 2: backfill from the parent conversation, which already carries the
-- correct clinicId for every existing escalation.
UPDATE "escalations" AS e
SET "clinicId" = c."clinicId"
FROM "conversations" AS c
WHERE c."id" = e."conversationId";

-- Step 3: now that every row has a value, enforce NOT NULL.
ALTER TABLE "escalations" ALTER COLUMN "clinicId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "escalations_clinicId_idx" ON "escalations"("clinicId");

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;