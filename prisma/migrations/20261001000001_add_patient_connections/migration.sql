-- Guardian → dependent links. An account holder (guardian) may book for, and
-- receive messages about, another patient Profile (dependent) in one clinic —
-- e.g. a son booking for his mother. Dependents with no phone of their own are
-- synthetic-email Profiles with phone = null; their automation messages route to
-- an active guardian's WhatsApp thread.
--
-- Directional and per clinic. Revoked via revokedAt rather than deleted, so
-- who-acted-for-whom stays auditable.

-- CreateEnum
CREATE TYPE "ConnectionRelation" AS ENUM ('PARENT', 'CHILD', 'SPOUSE', 'SIBLING', 'RELATIVE', 'OTHER');

-- CreateTable
CREATE TABLE "patient_connections" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "dependentId" UUID NOT NULL,
    "relation" "ConnectionRelation" NOT NULL,
    "canBook" BOOLEAN NOT NULL DEFAULT true,
    "canViewRecords" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_connections_pkey" PRIMARY KEY ("id"),
    -- Not expressible in Prisma: a profile cannot be its own guardian.
    CONSTRAINT "patient_connections_not_self_check" CHECK ("guardianId" <> "dependentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_connections_clinicId_guardianId_dependentId_key" ON "patient_connections"("clinicId", "guardianId", "dependentId");

-- CreateIndex
CREATE INDEX "patient_connections_guardianId_idx" ON "patient_connections"("guardianId");

-- CreateIndex
CREATE INDEX "patient_connections_dependentId_idx" ON "patient_connections"("dependentId");

-- AddForeignKey
ALTER TABLE "patient_connections" ADD CONSTRAINT "patient_connections_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_connections" ADD CONSTRAINT "patient_connections_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_connections" ADD CONSTRAINT "patient_connections_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
