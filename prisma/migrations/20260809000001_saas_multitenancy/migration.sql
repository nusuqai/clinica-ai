-- Multi-tenant SaaS conversion.
-- Adds clinics (tenants), per-clinic memberships, clinic-creation requests,
-- decouples doctors from auth accounts, scopes appointments/conversations by
-- clinic, and moves the user role from profiles to clinic_members.
--
-- NOTE: this migration updates the Supabase auth trigger (handle_new_user), so
-- `prisma migrate dev`'s shadow-DB replay will fail — apply it with the
-- hand-written-SQL workaround in prisma/README.md (local `.env.localdb` first).

-- ─── Enums ──────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "ClinicRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ─── New tables ──────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_members" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_requests" (
    "id" UUID NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "requestedClinicName" TEXT NOT NULL,
    "requestedSlug" TEXT,
    "note" TEXT,
    "status" "ClinicRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdClinicId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_members_userId_clinicId_key" ON "clinic_members"("userId", "clinicId");

-- CreateIndex
CREATE INDEX "clinic_members_clinicId_idx" ON "clinic_members"("clinicId");

-- CreateIndex
CREATE INDEX "clinic_requests_status_idx" ON "clinic_requests"("status");

-- AddForeignKey
ALTER TABLE "clinic_members" ADD CONSTRAINT "clinic_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_members" ADD CONSTRAINT "clinic_members_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_requests" ADD CONSTRAINT "clinic_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_requests" ADD CONSTRAINT "clinic_requests_createdClinicId_fkey" FOREIGN KEY ("createdClinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Default clinic (backfill target for all existing data) ───────────────────

INSERT INTO "clinics" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'demo', 'Clinica AI', true, NOW(), NOW());

-- ─── profiles: platform-admin flag ───────────────────────────────────────────

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- ─── doctors: decouple from auth accounts + scope to a clinic ─────────────────

-- AlterTable (nullable first, backfill, then constrain)
ALTER TABLE "doctors" ADD COLUMN "clinicId" UUID;
ALTER TABLE "doctors" ADD COLUMN "profileId" UUID;
ALTER TABLE "doctors" ADD COLUMN "fullName" TEXT;
ALTER TABLE "doctors" ADD COLUMN "phone" TEXT;

-- Backfill: existing doctors keep their linked account (doctors.id == profiles.id today)
UPDATE "doctors" d
SET "profileId" = d."id",
    "clinicId"  = '00000000-0000-0000-0000-000000000001'::uuid,
    "fullName"  = p."fullName",
    "phone"     = p."phone"
FROM "profiles" p
WHERE d."id" = p."id";

-- Enforce NOT NULL after backfill
ALTER TABLE "doctors" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "doctors" ALTER COLUMN "fullName" SET NOT NULL;

-- Drop the old id->profiles FK so a doctor can exist without an account
ALTER TABLE "doctors" DROP CONSTRAINT "doctors_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "doctors_profileId_key" ON "doctors"("profileId");

-- CreateIndex
CREATE INDEX "doctors_clinicId_idx" ON "doctors"("clinicId");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (optional account link; unlinking never deletes the doctor)
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── appointments: scope to a clinic ─────────────────────────────────────────

ALTER TABLE "appointments" ADD COLUMN "clinicId" UUID;
UPDATE "appointments" SET "clinicId" = '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE "appointments" ALTER COLUMN "clinicId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "appointments_clinicId_idx" ON "appointments"("clinicId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── conversations: scope to a clinic + per-clinic uniqueness ─────────────────

ALTER TABLE "conversations" ADD COLUMN "clinicId" UUID;
UPDATE "conversations" SET "clinicId" = '00000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE "conversations" ALTER COLUMN "clinicId" SET NOT NULL;

-- Drop old global-unique constraints
DROP INDEX "conversations_whatsappPhone_key";
DROP INDEX "conversations_userId_channel_key";

-- CreateIndex (now unique per clinic)
CREATE UNIQUE INDEX "conversations_clinicId_whatsappPhone_key" ON "conversations"("clinicId", "whatsappPhone");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_clinicId_userId_channel_key" ON "conversations"("clinicId", "userId", "channel");

-- CreateIndex
CREATE INDEX "conversations_clinicId_idx" ON "conversations"("clinicId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Move role from profiles to clinic_members ───────────────────────────────

-- Backfill a membership in the default clinic for every existing profile,
-- carrying over their current role.
INSERT INTO "clinic_members" ("id", "userId", "clinicId", "role", "createdAt")
SELECT gen_random_uuid(), p."id", '00000000-0000-0000-0000-000000000001'::uuid, p."role", NOW()
FROM "profiles" p;

-- Update the auth trigger to stop writing profiles.role (identity only now).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, "fullName", phone, "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the now-unused role column.
ALTER TABLE "profiles" DROP COLUMN "role";
