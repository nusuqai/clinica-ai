-- Arrival-priority booking ("أسبقية الحضور"): a third availability mode alongside
-- SLOT_BASED and ORDER_BASED. The patient reserves a spot for the day (capped by
-- dailyCap) but gets NO order number at booking; reception hands out the order
-- number at check-in, by physical arrival order. Serving then reuses the existing
-- ORDER_BASED queue machinery (currentOrder / serveNextOrder / skip / recall).
--
-- Applied by hand with `prisma migrate deploy` because `migrate dev` breaks on
-- this project's cross-schema FK (public.profiles -> auth.users) shadow DB.

-- New scheduling mode. IF NOT EXISTS keeps the migration idempotent.
ALTER TYPE "AvailabilityMode" ADD VALUE IF NOT EXISTS 'ARRIVAL_BASED';

-- Per-day queue: a dedicated counter for the arrival/serving order handed out at
-- check-in (ARRIVAL_BASED). nextOrder stays the reservation/booking counter.
ALTER TABLE "doctor_day_queues"
  ADD COLUMN IF NOT EXISTS "nextArrival" INTEGER NOT NULL DEFAULT 1;

-- Appointment: check-in timestamp. Set (with orderNumber) when reception marks an
-- ARRIVAL_BASED patient as arrived. Null = reserved but not yet arrived.
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
