-- Day-only booking ("حجز يوم فقط"): a fourth availability mode. The patient books
-- a DAY (optionally capped per day, like the queue modes); the clinic team then
-- contacts them and sets the exact time on the appointment. There are no slots,
-- no order numbers and no overlap checks — the clinic owns the timing.
--
-- Applied by hand with `prisma migrate deploy` because `migrate dev` breaks on
-- this project's cross-schema FK (public.profiles -> auth.users) shadow DB.

ALTER TYPE "AvailabilityMode" ADD VALUE IF NOT EXISTS 'DAY_ONLY';

-- The time the team agreed with the patient: clinic wall-clock "HH:MM" on the
-- appointment's bookingDate. Null = still waiting for the team to set it.
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "scheduledTime" TEXT;
