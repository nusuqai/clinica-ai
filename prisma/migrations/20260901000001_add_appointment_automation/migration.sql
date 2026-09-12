-- CreateEnum
CREATE TYPE "AppointmentTemplatePurpose" AS ENUM ('CONFIRM_REMINDER', 'FEEDBACK_REQUEST');

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "feedbackRequestedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clinic_appointment_templates" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "purpose" "AppointmentTemplatePurpose" NOT NULL,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "variableMap" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "leadMinutes" INTEGER NOT NULL DEFAULT 1440,
    "delayMinutes" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_appointment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_feedback" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_appointment_templates_clinicId_idx" ON "clinic_appointment_templates"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_appointment_templates_clinicId_purpose_key" ON "clinic_appointment_templates"("clinicId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_feedback_appointmentId_key" ON "appointment_feedback"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_feedback_clinicId_idx" ON "appointment_feedback"("clinicId");

-- CreateIndex
CREATE INDEX "appointment_feedback_patientId_idx" ON "appointment_feedback"("patientId");

-- CreateIndex
CREATE INDEX "appointments_status_reminderSentAt_idx" ON "appointments"("status", "reminderSentAt");

-- CreateIndex
CREATE INDEX "appointments_status_feedbackRequestedAt_idx" ON "appointments"("status", "feedbackRequestedAt");

-- CreateIndex
CREATE INDEX "appointments_status_completedAt_idx" ON "appointments"("status", "completedAt");

-- AddForeignKey
ALTER TABLE "clinic_appointment_templates" ADD CONSTRAINT "clinic_appointment_templates_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_feedback" ADD CONSTRAINT "appointment_feedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_feedback" ADD CONSTRAINT "appointment_feedback_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_feedback" ADD CONSTRAINT "appointment_feedback_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
