-- Normalize doctor specialty from a free-text column into a per-clinic
-- `specialties` table (issue #20). Names are unique per clinic; the same name
-- can exist across clinics. Doctors reference a specialty by FK.
--
-- Flow: create table + doctors.specialtyId, backfill one specialty per distinct
-- (case-insensitive) existing value per clinic, link each doctor, then drop the
-- old free-text `specialty` column. Nullable FK + SetNull keeps doctors intact.

-- ─── New table + column ──────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN "specialtyId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "specialties_clinicId_name_key" ON "specialties"("clinicId", "name");

-- CreateIndex
CREATE INDEX "specialties_clinicId_idx" ON "specialties"("clinicId");

-- CreateIndex
CREATE INDEX "doctors_specialtyId_idx" ON "doctors"("specialtyId");

-- AddForeignKey
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Backfill ────────────────────────────────────────────────────────────────

-- 1) One specialty per clinic per distinct (case-insensitive, trimmed) value.
--    Canonical display name = the alphabetically-first trimmed variant.
INSERT INTO "specialties" ("id", "clinicId", "name", "updatedAt")
SELECT gen_random_uuid(), "clinicId", name, CURRENT_TIMESTAMP
FROM (
  SELECT "clinicId", min(trim("specialty")) AS name
  FROM "doctors"
  WHERE "specialty" IS NOT NULL AND trim("specialty") <> ''
  GROUP BY "clinicId", lower(trim("specialty"))
) s
ON CONFLICT ("clinicId", "name") DO NOTHING;

-- 2) Link each doctor to its clinic's matching specialty (case-insensitive).
UPDATE "doctors" d
SET "specialtyId" = s."id"
FROM "specialties" s
WHERE s."clinicId" = d."clinicId"
  AND lower(s."name") = lower(trim(d."specialty"))
  AND d."specialty" IS NOT NULL
  AND trim(d."specialty") <> '';

-- 3) Drop the old free-text column now that every value is linked.
ALTER TABLE "doctors" DROP COLUMN "specialty";
