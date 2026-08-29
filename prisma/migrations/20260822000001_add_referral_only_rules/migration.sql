-- Referral-only availability rules: slots reserved for doctor referrals, not
-- directly bookable by patients. Plus a free-text note on the rule and
-- referral traceability on the appointment.

ALTER TABLE "availability_rules" ADD COLUMN "referralOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "availability_rules" ADD COLUMN "note" TEXT;

ALTER TABLE "slots" ADD COLUMN "referralOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "appointments" ADD COLUMN "referredByDoctorId" UUID;

CREATE INDEX "appointments_referredByDoctorId_idx" ON "appointments"("referredByDoctorId");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_referredByDoctorId_fkey"
  FOREIGN KEY ("referredByDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
