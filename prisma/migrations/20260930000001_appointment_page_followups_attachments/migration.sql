-- Appointment detail page + follow-up reminders + visit attachments.
--
-- 1) A new automation purpose: FOLLOWUP_REMINDER — the "time to book your
--    follow-up" message a clinic sends ahead of a TreatmentRecord.followUpDate.
-- 2) A dedupe flag on treatment_records so that reminder is sent at most once.
-- 3) appointment_attachments — files (labs, x-rays, documents) staff attach to a
--    visit. Bytes live in the private patient-media bucket; this row is a pointer.

-- AlterEnum
ALTER TYPE "AppointmentTemplatePurpose" ADD VALUE IF NOT EXISTS 'FOLLOWUP_REMINDER';

-- AlterTable
ALTER TABLE "treatment_records"
  ADD COLUMN IF NOT EXISTS "followUpReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "treatment_records_followUpReminderSentAt_followUpDate_idx"
  ON "treatment_records"("followUpReminderSentAt", "followUpDate");

-- CreateTable
CREATE TABLE "appointment_attachments" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_attachments_clinicId_appointmentId_idx" ON "appointment_attachments"("clinicId", "appointmentId");

-- CreateIndex
CREATE INDEX "appointment_attachments_appointmentId_idx" ON "appointment_attachments"("appointmentId");

-- AddForeignKey
ALTER TABLE "appointment_attachments" ADD CONSTRAINT "appointment_attachments_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attachments" ADD CONSTRAINT "appointment_attachments_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attachments" ADD CONSTRAINT "appointment_attachments_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
