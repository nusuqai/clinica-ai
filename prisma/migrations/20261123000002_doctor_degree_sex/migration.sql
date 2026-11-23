-- Doctor degree "طبيب" (DOCTOR) and the practitioner's sex (for gendered
-- wording in the UI and the AI agent; a name alone can mislead).

ALTER TYPE "DoctorTitle" ADD VALUE IF NOT EXISTS 'DOCTOR' BEFORE 'SPECIALIST';

CREATE TYPE "DoctorSex" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "doctors" ADD COLUMN "sex" "DoctorSex";
