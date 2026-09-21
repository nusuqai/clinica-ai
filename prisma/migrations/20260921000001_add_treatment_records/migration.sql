-- Structured medical history. Appointment records SCHEDULING state only; these
-- tables record what actually happened clinically during a visit, so a patient
-- has a real timeline (diagnosis, notes, procedures, prescriptions).
--
-- Every table carries clinicId and is read through a clinic-scoped query, so a
-- patient's history at one clinic is invisible on another clinic's subdomain.
-- Records stay editable, but each edit appends a revision snapshot.

-- CreateEnum
CREATE TYPE "ProcedureKind" AS ENUM ('EXAMINATION', 'LAB', 'IMAGING', 'SURGERY', 'THERAPY', 'OTHER');

-- CreateTable
CREATE TABLE "treatment_records" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "branchId" UUID,
    "appointmentId" UUID,
    "visitDate" DATE NOT NULL,
    "chiefComplaint" TEXT,
    "diagnosis" TEXT,
    "clinicalNotes" TEXT,
    "followUpDate" DATE,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_procedures" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "kind" "ProcedureKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "note" TEXT,
    "cost" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "drugName" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_record_revisions" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "editedById" UUID NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "treatment_record_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_records_appointmentId_key" ON "treatment_records"("appointmentId");

-- CreateIndex
CREATE INDEX "treatment_records_clinicId_patientId_visitDate_idx" ON "treatment_records"("clinicId", "patientId", "visitDate");

-- CreateIndex
CREATE INDEX "treatment_records_clinicId_doctorId_idx" ON "treatment_records"("clinicId", "doctorId");

-- CreateIndex
CREATE INDEX "treatment_records_branchId_idx" ON "treatment_records"("branchId");

-- CreateIndex
CREATE INDEX "treatment_procedures_recordId_idx" ON "treatment_procedures"("recordId");

-- CreateIndex
CREATE INDEX "treatment_procedures_clinicId_idx" ON "treatment_procedures"("clinicId");

-- CreateIndex
CREATE INDEX "prescriptions_recordId_idx" ON "prescriptions"("recordId");

-- CreateIndex
CREATE INDEX "prescriptions_clinicId_idx" ON "prescriptions"("clinicId");

-- CreateIndex
CREATE INDEX "treatment_record_revisions_recordId_editedAt_idx" ON "treatment_record_revisions"("recordId", "editedAt");

-- CreateIndex
CREATE INDEX "treatment_record_revisions_clinicId_idx" ON "treatment_record_revisions"("clinicId");

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_procedures" ADD CONSTRAINT "treatment_procedures_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "treatment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "treatment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_record_revisions" ADD CONSTRAINT "treatment_record_revisions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_record_revisions" ADD CONSTRAINT "treatment_record_revisions_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "treatment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_record_revisions" ADD CONSTRAINT "treatment_record_revisions_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
