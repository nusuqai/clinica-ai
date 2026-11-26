-- Operations (العمليات): surgeries run as team-managed CASES, never booked by
-- patients. The patient AI may only open a REQUESTED case; the team prepares,
-- schedules and follows it up (dashboard + team assistant). See docs/operations.md.
--
-- Applied by hand with `prisma migrate deploy` because `migrate dev` breaks on
-- this project's cross-schema FK (public.profiles -> auth.users) shadow DB.
-- Enum ADD VALUEs are not used in this same migration, so the transaction is safe.

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('REQUESTED', 'PREPARING', 'SCHEDULED', 'DONE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationSource" AS ENUM ('PATIENT_AI', 'STAFF');

-- AlterEnum


ALTER TYPE "AppointmentTemplatePurpose" ADD VALUE IF NOT EXISTS 'OPERATION_REMINDER';
ALTER TYPE "AppointmentTemplatePurpose" ADD VALUE IF NOT EXISTS 'OPERATION_FOLLOWUP';

-- AlterEnum
ALTER TYPE "ServiceKind" ADD VALUE IF NOT EXISTS 'OPERATION';

-- AlterEnum
ALTER TYPE "StaffEvent" ADD VALUE IF NOT EXISTS 'OPERATION_REQUEST';

-- AlterTable
ALTER TABLE "slots" ADD COLUMN     "blockedByOperationId" UUID;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "operationChecklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "postOpInstructions" TEXT;

-- CreateTable
CREATE TABLE "operations" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "serviceId" UUID,
    "name" TEXT NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'REQUESTED',
    "source" "OperationSource" NOT NULL DEFAULT 'STAFF',
    "doctorId" UUID,
    "branchId" UUID,
    "hospitalName" TEXT,
    "scheduledDate" DATE,
    "startTime" TEXT,
    "durationMin" INTEGER,
    "blockSchedule" BOOLEAN NOT NULL DEFAULT true,
    "anesthesia" TEXT,
    "price" DECIMAL(10,2),
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "preOpInstructions" TEXT,
    "postOpInstructions" TEXT,
    "requestNote" TEXT,
    "notes" TEXT,
    "coordinatorId" UUID,
    "conversationId" UUID,
    "cancelReason" TEXT,
    "doneAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "followUpSentAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_checklist_items" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_payments" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_events" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "actorId" UUID,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_attachments" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operations_clinicId_status_idx" ON "operations"("clinicId", "status");

-- CreateIndex
CREATE INDEX "operations_clinicId_scheduledDate_idx" ON "operations"("clinicId", "scheduledDate");

-- CreateIndex
CREATE INDEX "operations_patientId_idx" ON "operations"("patientId");

-- CreateIndex
CREATE INDEX "operations_doctorId_scheduledDate_idx" ON "operations"("doctorId", "scheduledDate");

-- CreateIndex
CREATE INDEX "operations_branchId_idx" ON "operations"("branchId");

-- CreateIndex
CREATE INDEX "operations_serviceId_idx" ON "operations"("serviceId");

-- CreateIndex
CREATE INDEX "operations_coordinatorId_idx" ON "operations"("coordinatorId");

-- CreateIndex
CREATE INDEX "operations_status_reminderSentAt_idx" ON "operations"("status", "reminderSentAt");

-- CreateIndex
CREATE INDEX "operations_status_followUpSentAt_idx" ON "operations"("status", "followUpSentAt");

-- CreateIndex
CREATE INDEX "operation_checklist_items_operationId_idx" ON "operation_checklist_items"("operationId");

-- CreateIndex
CREATE INDEX "operation_checklist_items_clinicId_idx" ON "operation_checklist_items"("clinicId");

-- CreateIndex
CREATE INDEX "operation_payments_operationId_idx" ON "operation_payments"("operationId");

-- CreateIndex
CREATE INDEX "operation_payments_clinicId_idx" ON "operation_payments"("clinicId");

-- CreateIndex
CREATE INDEX "operation_events_operationId_createdAt_idx" ON "operation_events"("operationId", "createdAt");

-- CreateIndex
CREATE INDEX "operation_events_clinicId_idx" ON "operation_events"("clinicId");

-- CreateIndex
CREATE INDEX "operation_events_actorId_idx" ON "operation_events"("actorId");

-- CreateIndex
CREATE INDEX "operation_attachments_operationId_idx" ON "operation_attachments"("operationId");

-- CreateIndex
CREATE INDEX "operation_attachments_clinicId_idx" ON "operation_attachments"("clinicId");

-- CreateIndex
CREATE INDEX "operation_attachments_uploadedById_idx" ON "operation_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "slots_blockedByOperationId_idx" ON "slots"("blockedByOperationId");

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_blockedByOperationId_fkey" FOREIGN KEY ("blockedByOperationId") REFERENCES "operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_checklist_items" ADD CONSTRAINT "operation_checklist_items_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_checklist_items" ADD CONSTRAINT "operation_checklist_items_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_payments" ADD CONSTRAINT "operation_payments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_payments" ADD CONSTRAINT "operation_payments_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_attachments" ADD CONSTRAINT "operation_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Server-only tables: the app reaches them through Prisma (service role), never
-- through PostgREST — lock them away from the anon/authenticated API roles.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operations',
    'operation_checklist_items',
    'operation_payments',
    'operation_events',
    'operation_attachments'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
