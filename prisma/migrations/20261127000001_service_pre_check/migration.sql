-- Service pre-check: a service (e.g. a كشف) that must be done first; the
-- practitioner then approves or declines the service at the visit.

-- CreateEnum
CREATE TYPE "PreCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "services"
  ADD COLUMN "preCheckServiceId" UUID,
  ADD COLUMN "preCheckValidityDays" INTEGER,
  ADD COLUMN "preCheckFeeDeducted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointment_items"
  ADD COLUMN "isPreCheck" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preCheckStatus" "PreCheckStatus",
  ADD COLUMN "preCheckNote" TEXT,
  ADD COLUMN "preCheckDecidedAt" TIMESTAMP(3),
  ADD COLUMN "preCheckDecidedById" UUID;

-- AddForeignKey
ALTER TABLE "services"
  ADD CONSTRAINT "services_preCheckServiceId_fkey"
  FOREIGN KEY ("preCheckServiceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: clearance lookups (a patient's approved lines for a service).
CREATE INDEX "appointment_items_serviceId_preCheckStatus_idx"
  ON "appointment_items"("serviceId", "preCheckStatus");
