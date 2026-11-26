-- A pre-check approval no longer expires (once approved, the patient never
-- needs the pre-check for that service again), so the validity window goes.
ALTER TABLE "services" DROP COLUMN IF EXISTS "preCheckValidityDays";
