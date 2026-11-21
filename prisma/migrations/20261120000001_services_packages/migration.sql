-- Services, packages & offers (docs/services-and-packages.md).
--
-- 1) Schema (generated with `prisma migrate diff`, hand-checked).
-- 2) Data: كشف / استشارة services from the old doctor fees, one AppointmentItem
--    per existing appointment, slot occupancy (heldById), queue cap types and
--    booked minutes.
-- 3) Lock the new tables away from the Supabase API roles (Prisma only).
--
-- Applied with `prisma db execute` + `migrate resolve` locally (shadow DB
-- workaround, see prisma/README.md); production via `prisma migrate deploy`.
-- The old Doctor.examinationFee / consultationFee columns are dropped in a later
-- migration, once every reader has moved to services.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Schema
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'SESSION', 'TEST');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FIXED', 'PER_UNIT', 'STARTING_FROM', 'TIERED', 'AFTER_CONSULTATION', 'FREE');

-- CreateEnum
CREATE TYPE "QueueCapType" AS ENUM ('NONE', 'PATIENTS', 'MINUTES');

-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('UNITS', 'SESSIONS');

-- CreateEnum
CREATE TYPE "PatientPackageStatus" AS ENUM ('ACTIVE', 'USED_UP', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PackagePaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "PatientPackageSource" AS ENUM ('PURCHASE', 'OFFER');

-- CreateEnum
CREATE TYPE "PackageLedgerType" AS ENUM ('PURCHASE', 'RESERVE', 'RELEASE', 'CONSUME', 'ADJUST', 'EXTEND', 'EXPIRE', 'CANCEL');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('PERCENT_OFF', 'AMOUNT_OFF', 'FIXED_PRICE', 'BUY_X_GET_Y', 'BONUS_UNITS');

-- AlterEnum


ALTER TYPE "DoctorTitle" ADD VALUE 'NURSE';
ALTER TYPE "DoctorTitle" ADD VALUE 'TECHNICIAN';
ALTER TYPE "DoctorTitle" ADD VALUE 'SPECIALIST_THERAPIST';

-- DropIndex
DROP INDEX "appointments_slotId_key";

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "maxServicesPerAppointment" INTEGER;

-- AlterTable
ALTER TABLE "availability_rules" ADD COLUMN     "capType" "QueueCapType" NOT NULL DEFAULT 'PATIENTS',
ADD COLUMN     "dailyCapMinutes" INTEGER;

-- AlterTable
ALTER TABLE "doctor_day_queues" ADD COLUMN     "bookedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "capType" "QueueCapType" NOT NULL DEFAULT 'PATIENTS',
ADD COLUMN     "dailyCapMinutes" INTEGER;

-- AlterTable
ALTER TABLE "slots" ADD COLUMN     "heldById" UUID;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "estimatedTotal" DECIMAL(10,2),
ADD COLUMN     "finalTotal" DECIMAL(10,2),
ADD COLUMN     "totalDurationMin" INTEGER;

-- CreateTable
CREATE TABLE "catalog_categories" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prepInstructions" TEXT,
    "agentNotes" TEXT,
    "kind" "ServiceKind" NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "price" DECIMAL(10,2),
    "unitLabel" TEXT,
    "durationMin" INTEGER,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_branches" (
    "serviceId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "price" DECIMAL(10,2),

    CONSTRAINT "service_branches_pkey" PRIMARY KEY ("serviceId","branchId")
);

-- CreateTable
CREATE TABLE "service_price_tiers" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "minQty" INTEGER NOT NULL,
    "maxQty" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "service_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_services" (
    "doctorId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "price" DECIMAL(10,2),
    "durationMin" INTEGER,

    CONSTRAINT "doctor_services_pkey" PRIMARY KEY ("doctorId","serviceId")
);

-- CreateTable
CREATE TABLE "rule_services" (
    "ruleId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "rule_services_pkey" PRIMARY KEY ("ruleId","serviceId")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "terms" TEXT,
    "agentNotes" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_branches" (
    "packageId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "price" DECIMAL(10,2),

    CONSTRAINT "package_branches_pkey" PRIMARY KEY ("packageId","branchId")
);

-- CreateTable
CREATE TABLE "package_items" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "creditType" "CreditType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "categoryId" UUID,

    CONSTRAINT "package_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_item_services" (
    "packageItemId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,

    CONSTRAINT "package_item_services_pkey" PRIMARY KEY ("packageItemId","serviceId")
);

-- CreateTable
CREATE TABLE "patient_packages" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "packageId" UUID,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" "PatientPackageSource" NOT NULL DEFAULT 'PURCHASE',
    "offerId" UUID,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "pricePaid" DECIMAL(10,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PatientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PackagePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "paidConfirmedById" UUID,
    "soldById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_package_balances" (
    "id" UUID NOT NULL,
    "patientPackageId" UUID NOT NULL,
    "creditType" "CreditType" NOT NULL,
    "total" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "categoryId" UUID,
    "serviceIds" UUID[],

    CONSTRAINT "patient_package_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_ledger" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "balanceId" UUID NOT NULL,
    "appointmentItemId" UUID,
    "type" "PackageLedgerType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "OfferType" NOT NULL,
    "value" DECIMAL(10,2),
    "buyQty" INTEGER,
    "getQty" INTEGER,
    "rewardValidityDays" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_branches" (
    "offerId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "offer_branches_pkey" PRIMARY KEY ("offerId","branchId")
);

-- CreateTable
CREATE TABLE "offer_targets" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "serviceId" UUID,
    "packageId" UUID,
    "categoryId" UUID,

    CONSTRAINT "offer_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_items" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "serviceName" TEXT NOT NULL,
    "doctorId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "basePrice" DECIMAL(10,2),
    "offerId" UUID,
    "discount" DECIMAL(10,2),
    "unitPrice" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "durationMin" INTEGER NOT NULL,
    "patientPackageId" UUID,
    "balanceId" UUID,
    "finalQuantity" INTEGER,
    "finalTotal" DECIMAL(10,2),
    "uncoveredQuantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_categories_clinicId_idx" ON "catalog_categories"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_categories_clinicId_name_key" ON "catalog_categories"("clinicId", "name");

-- CreateIndex
CREATE INDEX "services_clinicId_idx" ON "services"("clinicId");

-- CreateIndex
CREATE INDEX "services_categoryId_idx" ON "services"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "services_clinicId_name_key" ON "services"("clinicId", "name");

-- CreateIndex
CREATE INDEX "service_branches_branchId_idx" ON "service_branches"("branchId");

-- CreateIndex
CREATE INDEX "service_price_tiers_serviceId_idx" ON "service_price_tiers"("serviceId");

-- CreateIndex
CREATE INDEX "doctor_services_serviceId_idx" ON "doctor_services"("serviceId");

-- CreateIndex
CREATE INDEX "rule_services_serviceId_idx" ON "rule_services"("serviceId");

-- CreateIndex
CREATE INDEX "packages_clinicId_idx" ON "packages"("clinicId");

-- CreateIndex
CREATE INDEX "packages_categoryId_idx" ON "packages"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_clinicId_name_key" ON "packages"("clinicId", "name");

-- CreateIndex
CREATE INDEX "package_branches_branchId_idx" ON "package_branches"("branchId");

-- CreateIndex
CREATE INDEX "package_items_packageId_idx" ON "package_items"("packageId");

-- CreateIndex
CREATE INDEX "package_item_services_serviceId_idx" ON "package_item_services"("serviceId");

-- CreateIndex
CREATE INDEX "patient_packages_clinicId_patientId_idx" ON "patient_packages"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "patient_packages_branchId_idx" ON "patient_packages"("branchId");

-- CreateIndex
CREATE INDEX "patient_packages_status_expiresAt_idx" ON "patient_packages"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "patient_package_balances_patientPackageId_idx" ON "patient_package_balances"("patientPackageId");

-- CreateIndex
CREATE INDEX "package_ledger_balanceId_createdAt_idx" ON "package_ledger"("balanceId", "createdAt");

-- CreateIndex
CREATE INDEX "package_ledger_appointmentItemId_idx" ON "package_ledger"("appointmentItemId");

-- CreateIndex
CREATE INDEX "package_ledger_clinicId_idx" ON "package_ledger"("clinicId");

-- CreateIndex
CREATE INDEX "offers_clinicId_idx" ON "offers"("clinicId");

-- CreateIndex
CREATE INDEX "offer_branches_branchId_idx" ON "offer_branches"("branchId");

-- CreateIndex
CREATE INDEX "offer_targets_offerId_idx" ON "offer_targets"("offerId");

-- CreateIndex
CREATE INDEX "offer_targets_serviceId_idx" ON "offer_targets"("serviceId");

-- CreateIndex
CREATE INDEX "offer_targets_packageId_idx" ON "offer_targets"("packageId");

-- CreateIndex
CREATE INDEX "offer_targets_categoryId_idx" ON "offer_targets"("categoryId");

-- CreateIndex
CREATE INDEX "appointment_items_appointmentId_idx" ON "appointment_items"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_items_serviceId_idx" ON "appointment_items"("serviceId");

-- CreateIndex
CREATE INDEX "appointment_items_patientPackageId_idx" ON "appointment_items"("patientPackageId");

-- CreateIndex
CREATE INDEX "appointment_items_clinicId_idx" ON "appointment_items"("clinicId");

-- CreateIndex
CREATE INDEX "slots_heldById_idx" ON "slots"("heldById");

-- CreateIndex
CREATE INDEX "appointments_slotId_idx" ON "appointments"("slotId");

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_heldById_fkey" FOREIGN KEY ("heldById") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_branches" ADD CONSTRAINT "service_branches_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_branches" ADD CONSTRAINT "service_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_price_tiers" ADD CONSTRAINT "service_price_tiers_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_services" ADD CONSTRAINT "doctor_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_services" ADD CONSTRAINT "rule_services_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "availability_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_services" ADD CONSTRAINT "rule_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_branches" ADD CONSTRAINT "package_branches_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_branches" ADD CONSTRAINT "package_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_item_services" ADD CONSTRAINT "package_item_services_packageItemId_fkey" FOREIGN KEY ("packageItemId") REFERENCES "package_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_item_services" ADD CONSTRAINT "package_item_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_package_balances" ADD CONSTRAINT "patient_package_balances_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "patient_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_ledger" ADD CONSTRAINT "package_ledger_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_ledger" ADD CONSTRAINT "package_ledger_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "patient_package_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_ledger" ADD CONSTRAINT "package_ledger_appointmentItemId_fkey" FOREIGN KEY ("appointmentItemId") REFERENCES "appointment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_branches" ADD CONSTRAINT "offer_branches_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_branches" ADD CONSTRAINT "offer_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_targets" ADD CONSTRAINT "offer_targets_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_targets" ADD CONSTRAINT "offer_targets_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_targets" ADD CONSTRAINT "offer_targets_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_targets" ADD CONSTRAINT "offer_targets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "catalog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "patient_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "patient_package_balances"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- 2) Data
-- ════════════════════════════════════════════════════════════════════════════

-- Queue cap type: a rule/day without a cap was "unlimited".
UPDATE "availability_rules" SET "capType" = 'NONE' WHERE "dailyCap" IS NULL;
UPDATE "doctor_day_queues"  SET "capType" = 'NONE' WHERE "dailyCap" IS NULL;

-- A general category per clinic that has doctors.
INSERT INTO "catalog_categories" ("id", "clinicId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", 'عام', 0, true, now(), now()
FROM "clinics" c
WHERE EXISTS (SELECT 1 FROM "doctors" d WHERE d."clinicId" = c."id")
ON CONFLICT ("clinicId", "name") DO NOTHING;

-- كشف for every such clinic (price lives on DoctorService).
INSERT INTO "services" ("id", "clinicId", "categoryId", "name", "kind", "pricingType",
                        "bookable", "isActive", "allBranches", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), cat."clinicId", cat."id", 'كشف', 'CONSULTATION', 'FIXED',
       true, true, true, 0, now(), now()
FROM "catalog_categories" cat
WHERE cat."name" = 'عام'
ON CONFLICT ("clinicId", "name") DO NOTHING;

-- استشارة only where some doctor had a consultation fee.
INSERT INTO "services" ("id", "clinicId", "categoryId", "name", "kind", "pricingType",
                        "bookable", "isActive", "allBranches", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), cat."clinicId", cat."id", 'استشارة', 'FOLLOW_UP', 'FIXED',
       true, true, true, 1, now(), now()
FROM "catalog_categories" cat
WHERE cat."name" = 'عام'
  AND EXISTS (SELECT 1 FROM "doctors" d WHERE d."clinicId" = cat."clinicId" AND d."consultationFee" IS NOT NULL)
ON CONFLICT ("clinicId", "name") DO NOTHING;

-- Every doctor provides كشف at their old examination fee.
INSERT INTO "doctor_services" ("doctorId", "serviceId", "price")
SELECT d."id", s."id", d."examinationFee"
FROM "doctors" d
JOIN "services" s ON s."clinicId" = d."clinicId" AND s."name" = 'كشف'
ON CONFLICT DO NOTHING;

-- Doctors with a consultation fee provide استشارة at that fee.
INSERT INTO "doctor_services" ("doctorId", "serviceId", "price")
SELECT d."id", s."id", d."consultationFee"
FROM "doctors" d
JOIN "services" s ON s."clinicId" = d."clinicId" AND s."name" = 'استشارة'
WHERE d."consultationFee" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Slot occupancy: live (non-cancelled) slot bookings hold their slot. Cancelled
-- ones release it — before this change a cancelled booking kept its slot taken.
UPDATE "slots" sl
SET "heldById" = a."id"
FROM "appointments" a
WHERE a."slotId" = sl."id" AND a."status" <> 'CANCELLED';

-- One كشف line per existing appointment (history + "every visit has a service").
INSERT INTO "appointment_items" ("id", "clinicId", "appointmentId", "serviceId", "serviceName",
                                 "doctorId", "quantity", "basePrice", "unitPrice", "total",
                                 "durationMin", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), a."clinicId", a."id", s."id", 'كشف',
       a."doctorId", 1, d."examinationFee", d."examinationFee", d."examinationFee",
       COALESCE(
         a."estimatedDurationMin",
         (EXTRACT(EPOCH FROM (sl."endTime" - sl."startTime")) / 60)::int,
         r."slotDurationMin",
         30
       ),
       0, a."createdAt", now()
FROM "appointments" a
JOIN "doctors" d ON d."id" = a."doctorId"
JOIN "services" s ON s."clinicId" = a."clinicId" AND s."name" = 'كشف'
LEFT JOIN "slots" sl ON sl."id" = a."slotId"
LEFT JOIN "availability_rules" r ON r."id" = a."ruleId"
WHERE NOT EXISTS (SELECT 1 FROM "appointment_items" i WHERE i."appointmentId" = a."id");

UPDATE "appointments" a
SET "totalDurationMin" = t.dur, "estimatedTotal" = t.total
FROM (
  SELECT "appointmentId", SUM("durationMin")::int AS dur, SUM("total") AS total
  FROM "appointment_items" GROUP BY "appointmentId"
) t
WHERE t."appointmentId" = a."id";

-- Queue days: minutes already booked (non-cancelled).
UPDATE "doctor_day_queues" q
SET "bookedMinutes" = COALESCE((
  SELECT SUM(a."totalDurationMin") FROM "appointments" a
  WHERE a."queueId" = q."id" AND a."status" <> 'CANCELLED'
), 0);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Keep the new tables out of the Supabase API (read/written via Prisma only)
-- ════════════════════════════════════════════════════════════════════════════
DO $outer$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Supabase roles not found — skipping RLS for services tables';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'catalog_categories', 'services', 'service_branches', 'service_price_tiers',
    'doctor_services', 'rule_services', 'packages', 'package_branches',
    'package_items', 'package_item_services', 'patient_packages',
    'patient_package_balances', 'package_ledger', 'offers', 'offer_branches',
    'offer_targets', 'appointment_items'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $outer$;
