-- Add a direct clinicId FK to all 8 clinic-scoped tables that previously
-- reached Clinic only indirectly (via Doctor/Branch for the scheduling
-- chain, via Conversation for the conversation chain).
--
-- Idempotent by design: every ADD COLUMN / CREATE INDEX / ADD CONSTRAINT is
-- guarded so this file can be safely applied even if some of these already
-- exist (e.g. messages/escalations were added by hand before this migration
-- existed). Re-running it anywhere is a no-op for whatever's already there.

BEGIN;

-- ── branch_phones (parent: branches) ────────────────────────────────────────
ALTER TABLE "branch_phones" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "branch_phones" bp
SET "clinicId" = b."clinicId"
FROM "branches" b
WHERE bp."branchId" = b.id
  AND bp."clinicId" IS NULL;

ALTER TABLE "branch_phones" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "branch_phones_clinicId_idx" ON "branch_phones"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_phones_clinicId_fkey') THEN
    ALTER TABLE "branch_phones" ADD CONSTRAINT "branch_phones_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── branch_hours (parent: branches) ─────────────────────────────────────────
ALTER TABLE "branch_hours" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "branch_hours" bh
SET "clinicId" = b."clinicId"
FROM "branches" b
WHERE bh."branchId" = b.id
  AND bh."clinicId" IS NULL;

ALTER TABLE "branch_hours" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "branch_hours_clinicId_idx" ON "branch_hours"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_hours_clinicId_fkey') THEN
    ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── doctor_branches (parent: doctors) ───────────────────────────────────────
ALTER TABLE "doctor_branches" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "doctor_branches" db
SET "clinicId" = d."clinicId"
FROM "doctors" d
WHERE db."doctorId" = d.id
  AND db."clinicId" IS NULL;

ALTER TABLE "doctor_branches" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "doctor_branches_clinicId_idx" ON "doctor_branches"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctor_branches_clinicId_fkey') THEN
    ALTER TABLE "doctor_branches" ADD CONSTRAINT "doctor_branches_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── availability_rules (parent: doctors) ────────────────────────────────────
ALTER TABLE "availability_rules" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "availability_rules" ar
SET "clinicId" = d."clinicId"
FROM "doctors" d
WHERE ar."doctorId" = d.id
  AND ar."clinicId" IS NULL;

ALTER TABLE "availability_rules" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "availability_rules_clinicId_idx" ON "availability_rules"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_rules_clinicId_fkey') THEN
    ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── slots (parent: doctors) ──────────────────────────────────────────────────
ALTER TABLE "slots" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "slots" s
SET "clinicId" = d."clinicId"
FROM "doctors" d
WHERE s."doctorId" = d.id
  AND s."clinicId" IS NULL;

ALTER TABLE "slots" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "slots_clinicId_idx" ON "slots"("clinicId");
CREATE INDEX IF NOT EXISTS "slots_clinicId_date_idx" ON "slots"("clinicId", "date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slots_clinicId_fkey') THEN
    ALTER TABLE "slots" ADD CONSTRAINT "slots_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── chat_sessions (parent: conversations) ───────────────────────────────────
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "chat_sessions" cs
SET "clinicId" = c."clinicId"
FROM "conversations" c
WHERE cs."conversationId" = c.id
  AND cs."clinicId" IS NULL;

ALTER TABLE "chat_sessions" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "chat_sessions_clinicId_idx" ON "chat_sessions"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_clinicId_fkey') THEN
    ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── escalations (parent: conversations) ─────────────────────────────────────
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "escalations" e
SET "clinicId" = c."clinicId"
FROM "conversations" c
WHERE e."conversationId" = c.id
  AND e."clinicId" IS NULL;

ALTER TABLE "escalations" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "escalations_clinicId_idx" ON "escalations"("clinicId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalations_clinicId_fkey') THEN
    ALTER TABLE "escalations" ADD CONSTRAINT "escalations_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── messages (parent: conversations) ────────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "clinicId" UUID;

UPDATE "messages" m
SET "clinicId" = c."clinicId"
FROM "conversations" c
WHERE m."conversationId" = c.id
  AND m."clinicId" IS NULL;

ALTER TABLE "messages" ALTER COLUMN "clinicId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "messages_clinicId_idx" ON "messages"("clinicId");
CREATE INDEX IF NOT EXISTS "messages_clinicId_createdAt_idx" ON "messages"("clinicId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_clinicId_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_clinicId_fkey"
      FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;