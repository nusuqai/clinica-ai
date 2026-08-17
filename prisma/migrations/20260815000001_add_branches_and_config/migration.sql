-- Clinic branches, contact/config info, and doctor attributes.
-- Adds:
--   * branches — physical locations of a clinic (address, maps, parking,
--     landmark, directions). Every clinic gets a default main branch.
--   * branch_phones / branch_hours — per-branch typed phones and weekday hours
--     (one interval/day; day off = isClosed).
--   * clinic_phones / clinic_socials — clinic-level contact info. The main
--     number is the clinic_phones row with isPrimary = true.
--   * doctor_branches — many-to-many: which branches a doctor works at.
--   * new doctor columns: yearsOfExperience, examinationFee (سعر الكشف),
--     requiresAdvanceBooking, acceptsChildren. Existing consultationFee now
--     means سعر الاستشارة.
--   * branchId on availability_rules / slots / appointments — the branch flows
--     down the booking chain. Nullable for a safe backfill; clinicId stays.
-- Backfill (bottom of file): a main branch per existing clinic, then
-- doctor_branches, then branchId down the rule → slot → appointment chain.

-- ─── Enums ──────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "PhoneType" AS ENUM ('LANDLINE', 'MOBILE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'X', 'TIKTOK', 'YOUTUBE', 'WEBSITE', 'OTHER');

-- ─── New columns on existing tables ──────────────────────────────────────────

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN "description" TEXT;

-- AlterTable
ALTER TABLE "doctors"
    ADD COLUMN "yearsOfExperience" INTEGER,
    ADD COLUMN "examinationFee" DECIMAL(10,2),
    ADD COLUMN "requiresAdvanceBooking" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "acceptsChildren" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "availability_rules" ADD COLUMN "branchId" UUID;

-- AlterTable
ALTER TABLE "slots" ADD COLUMN "branchId" UUID;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "branchId" UUID;

-- ─── New tables ──────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "address" TEXT,
    "mapsUrl" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "parkingInfo" TEXT,
    "nearestLandmark" TEXT,
    "directions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_phones" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" "PhoneType" NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branch_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_hours" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,

    CONSTRAINT "branch_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_phones" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "type" "PhoneType" NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "clinic_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_socials" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "clinic_socials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_branches" (
    "doctorId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "doctor_branches_pkey" PRIMARY KEY ("doctorId", "branchId")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "branches_clinicId_idx" ON "branches"("clinicId");

-- CreateIndex
CREATE INDEX "branch_phones_branchId_idx" ON "branch_phones"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_hours_branchId_dayOfWeek_key" ON "branch_hours"("branchId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "clinic_phones_clinicId_idx" ON "clinic_phones"("clinicId");

-- CreateIndex
CREATE INDEX "clinic_socials_clinicId_idx" ON "clinic_socials"("clinicId");

-- CreateIndex
CREATE INDEX "doctor_branches_branchId_idx" ON "doctor_branches"("branchId");

-- CreateIndex
CREATE INDEX "availability_rules_branchId_idx" ON "availability_rules"("branchId");

-- CreateIndex
CREATE INDEX "slots_branchId_idx" ON "slots"("branchId");

-- CreateIndex
CREATE INDEX "appointments_branchId_idx" ON "appointments"("branchId");

-- ─── Foreign keys ────────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_phones" ADD CONSTRAINT "branch_phones_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_phones" ADD CONSTRAINT "clinic_phones_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_socials" ADD CONSTRAINT "clinic_socials_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_branches" ADD CONSTRAINT "doctor_branches_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_branches" ADD CONSTRAINT "doctor_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Backfill ────────────────────────────────────────────────────────────────

-- 1) A default main branch for every existing clinic (idempotent: only when the
--    clinic has no branch yet).
INSERT INTO "branches" ("id", "clinicId", "name", "isMain", "isActive", "updatedAt")
SELECT gen_random_uuid(), c."id", 'الفرع الرئيسي', true, true, CURRENT_TIMESTAMP
FROM "clinics" c
WHERE NOT EXISTS (SELECT 1 FROM "branches" b WHERE b."clinicId" = c."id");

-- 2) Assign every existing doctor to its clinic's main branch.
INSERT INTO "doctor_branches" ("doctorId", "branchId")
SELECT d."id", b."id"
FROM "doctors" d
JOIN "branches" b ON b."clinicId" = d."clinicId" AND b."isMain" = true
ON CONFLICT DO NOTHING;

-- 3) availability_rules → the doctor's clinic main branch.
UPDATE "availability_rules" r
SET "branchId" = b."id"
FROM "doctors" d
JOIN "branches" b ON b."clinicId" = d."clinicId" AND b."isMain" = true
WHERE r."doctorId" = d."id" AND r."branchId" IS NULL;

-- 4) slots → the branch of their rule (fallback: doctor's clinic main branch).
UPDATE "slots" s
SET "branchId" = r."branchId"
FROM "availability_rules" r
WHERE s."ruleId" = r."id" AND s."branchId" IS NULL AND r."branchId" IS NOT NULL;

UPDATE "slots" s
SET "branchId" = b."id"
FROM "doctors" d
JOIN "branches" b ON b."clinicId" = d."clinicId" AND b."isMain" = true
WHERE s."doctorId" = d."id" AND s."branchId" IS NULL;

-- 5) appointments → the branch of their slot.
UPDATE "appointments" a
SET "branchId" = s."branchId"
FROM "slots" s
WHERE a."slotId" = s."id" AND a."branchId" IS NULL AND s."branchId" IS NOT NULL;
