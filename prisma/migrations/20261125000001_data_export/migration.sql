-- Patient-data export & scheduled report (docs/data-export.md).

-- AlterEnum
ALTER TYPE "StaffEvent" ADD VALUE 'DAILY_REPORT';

-- CreateEnum
CREATE TYPE "DataReportCoverage" AS ENUM ('TODAY', 'YESTERDAY');

-- CreateTable
CREATE TABLE "data_report_settings" (
    "clinicId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendMinute" INTEGER NOT NULL DEFAULT 1320,
    "coverage" "DataReportCoverage" NOT NULL DEFAULT 'TODAY',
    "lastRunOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_report_settings_pkey" PRIMARY KEY ("clinicId")
);

-- CreateTable
CREATE TABLE "data_report_deliveries" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "filters" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "announcedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "data_report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_report_deliveries_sentAt_createdAt_idx" ON "data_report_deliveries"("sentAt", "createdAt");

-- CreateIndex
CREATE INDEX "data_report_deliveries_clinicId_idx" ON "data_report_deliveries"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "data_report_deliveries_memberId_dedupeKey_key" ON "data_report_deliveries"("memberId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "data_report_settings" ADD CONSTRAINT "data_report_settings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_report_deliveries" ADD CONSTRAINT "data_report_deliveries_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_report_deliveries" ADD CONSTRAINT "data_report_deliveries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "clinic_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only tables: Prisma (table owner) reads them; browsers never do.
ALTER TABLE public.data_report_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.data_report_settings FROM anon, authenticated;
ALTER TABLE public.data_report_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.data_report_deliveries FROM anon, authenticated;
