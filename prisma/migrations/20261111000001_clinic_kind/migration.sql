-- Solo-doctor clinics: Clinic.kind = CENTER | SOLO_DOCTOR.
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent; every
-- existing clinic stays CENTER via the default.

DO $$ BEGIN
  CREATE TYPE "ClinicKind" AS ENUM ('CENTER', 'SOLO_DOCTOR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "clinics"
  ADD COLUMN IF NOT EXISTS "kind" "ClinicKind" NOT NULL DEFAULT 'CENTER';
