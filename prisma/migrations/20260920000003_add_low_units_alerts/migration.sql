-- Low-credit alert emails to the platform admin: dedupe stamps so each time a
-- clinic crosses its unit threshold (or runs out entirely) we mail once, not
-- once per agent reply below the line. Cleared by a top-up that lifts the
-- balance back above the threshold — see moveUnits() in aiCredit.ts.
--
-- Hand-written (not `migrate dev`) because this project's Supabase cross-schema
-- FK (public.profiles -> auth.users) breaks Prisma's shadow DB; applied via
-- `prisma migrate deploy`, which never touches a shadow database.

ALTER TABLE "clinic_ai_credits"
  ADD COLUMN "lowUnitsNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "unitsOutNotifiedAt" TIMESTAMP(3);
