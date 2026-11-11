-- Patient intake file: the questionnaire a patient answers before their first
-- booking at a clinic. One row per (clinic, patient); free-text columns for now.
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent.

CREATE TABLE IF NOT EXISTS "patient_intakes" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"          UUID         NOT NULL,
  "patientId"         UUID         NOT NULL,
  "fullName"          TEXT,
  "age"               TEXT,
  "weight"            TEXT,
  "address"           TEXT,
  "medicalConditions" TEXT,
  "smokingStatus"     TEXT,
  "previousSurgeries" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patient_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "patient_intakes_clinicId_patientId_key"
  ON "patient_intakes"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "patient_intakes_patientId_idx"
  ON "patient_intakes"("patientId");

DO $$ BEGIN
  ALTER TABLE "patient_intakes"
    ADD CONSTRAINT "patient_intakes_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "patient_intakes"
    ADD CONSTRAINT "patient_intakes_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

