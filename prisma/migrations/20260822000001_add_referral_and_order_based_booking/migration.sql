-- Referral-only availability rules + order-based (queue / نظام الدور) scheduling.
-- Bundles: per-rule referralOnly flag & free-text note, referral traceability on
-- appointments, and a full order-based booking mode (AvailabilityMode, per-rule
-- estimate/cap, nullable appointment.slotId, order-number fields, and the
-- doctor_day_queues table). Backward compatible: existing rows stay slot-based.

-- CreateEnum
CREATE TYPE "AvailabilityMode" AS ENUM ('SLOT_BASED', 'ORDER_BASED');

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_slotId_fkey";

-- AlterTable
ALTER TABLE "availability_rules" ADD COLUMN     "dailyCap" INTEGER,
ADD COLUMN     "estimatedDurationMin" INTEGER,
ADD COLUMN     "mode" "AvailabilityMode" NOT NULL DEFAULT 'SLOT_BASED',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "referralOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "slots" ADD COLUMN     "referralOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "bookingDate" DATE,
ADD COLUMN     "estimatedDurationMin" INTEGER,
ADD COLUMN     "orderNumber" INTEGER,
ADD COLUMN     "queueId" UUID,
ADD COLUMN     "referredByDoctorId" UUID,
ADD COLUMN     "ruleId" UUID,
ALTER COLUMN "slotId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "doctor_day_queues" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "branchId" UUID,
    "ruleId" UUID,
    "date" DATE NOT NULL,
    "nextOrder" INTEGER NOT NULL DEFAULT 1,
    "currentOrder" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER,
    "estimatedDurationMin" INTEGER,
    "trackCurrentOrder" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_day_queues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_day_queues_clinicId_idx" ON "doctor_day_queues"("clinicId");

-- CreateIndex
CREATE INDEX "doctor_day_queues_branchId_idx" ON "doctor_day_queues"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_day_queues_doctorId_branchId_date_key" ON "doctor_day_queues"("doctorId", "branchId", "date");

-- CreateIndex
CREATE INDEX "appointments_referredByDoctorId_idx" ON "appointments"("referredByDoctorId");

-- CreateIndex
CREATE INDEX "appointments_queueId_idx" ON "appointments"("queueId");

-- CreateIndex
CREATE INDEX "appointments_doctorId_bookingDate_idx" ON "appointments"("doctorId", "bookingDate");

-- AddForeignKey
ALTER TABLE "doctor_day_queues" ADD CONSTRAINT "doctor_day_queues_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_day_queues" ADD CONSTRAINT "doctor_day_queues_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_day_queues" ADD CONSTRAINT "doctor_day_queues_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_day_queues" ADD CONSTRAINT "doctor_day_queues_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "availability_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_referredByDoctorId_fkey" FOREIGN KEY ("referredByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "availability_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "doctor_day_queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
