-- Dynamic roles & permissions for clinic staff (with an optional per-branch
-- scope), plus "who did it" attribution in the inbox.
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Everything here is additive +
-- idempotent.
--
-- NOTE: the new 'STAFF' enum value is only ADDED here, never used — Postgres
-- forbids using a new enum value in the transaction that created it.

-- ── Role: the STAFF value (a member whose access comes from a ClinicRole) ────
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';

-- ── ClinicRole: admin-defined role = name + permission keys ──────────────────
CREATE TABLE IF NOT EXISTS "clinic_roles" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"    UUID NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinic_roles_clinicId_name_key"
  ON "clinic_roles"("clinicId", "name");

DO $$ BEGIN
  ALTER TABLE "clinic_roles"
    ADD CONSTRAINT "clinic_roles_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── ClinicMember: the custom role a STAFF member holds ───────────────────────
ALTER TABLE "clinic_members"
  ADD COLUMN IF NOT EXISTS "clinicRoleId" UUID;

CREATE INDEX IF NOT EXISTS "clinic_members_clinicRoleId_idx"
  ON "clinic_members"("clinicRoleId");

DO $$ BEGIN
  ALTER TABLE "clinic_members"
    ADD CONSTRAINT "clinic_members_clinicRoleId_fkey"
    FOREIGN KEY ("clinicRoleId") REFERENCES "clinic_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Branch scope for staff (GitHub #52) ──────────────────────────────────────
-- allBranches = true → the member works across every branch (the default, so
-- nothing changes for existing members). false → only the branches listed in
-- clinic_member_branches. An explicit flag, not "empty list = all": deleting a
-- member's last branch must leave them with none, never widen them to all.
ALTER TABLE "clinic_members"
  ADD COLUMN IF NOT EXISTS "allBranches" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "clinic_member_branches" (
  "memberId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  CONSTRAINT "clinic_member_branches_pkey" PRIMARY KEY ("memberId", "branchId")
);

CREATE INDEX IF NOT EXISTS "clinic_member_branches_branchId_idx"
  ON "clinic_member_branches"("branchId");

DO $$ BEGIN
  ALTER TABLE "clinic_member_branches"
    ADD CONSTRAINT "clinic_member_branches_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "clinic_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "clinic_member_branches"
    ADD CONSTRAINT "clinic_member_branches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Escalation: who resolved it ──────────────────────────────────────────────
ALTER TABLE "escalations"
  ADD COLUMN IF NOT EXISTS "resolvedById" UUID;

DO $$ BEGIN
  ALTER TABLE "escalations"
    ADD CONSTRAINT "escalations_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── ChatSession: who last paused / resumed the AI by hand ────────────────────
ALTER TABLE "chat_sessions"
  ADD COLUMN IF NOT EXISTS "aiToggledById" UUID,
  ADD COLUMN IF NOT EXISTS "aiToggledAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "chat_sessions"
    ADD CONSTRAINT "chat_sessions_aiToggledById_fkey"
    FOREIGN KEY ("aiToggledById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Starter roles for every existing clinic (editable / deletable) ───────────
-- New clinics get the same two from seedDefaultClinicRoles (server/services/team.ts).
INSERT INTO "clinic_roles" ("clinicId", "name", "description", "permissions")
SELECT c."id", 'استقبال', 'حجز المواعيد ومتابعة المرضى والرد على الرسائل',
       ARRAY['appointments', 'patients', 'messages']
FROM "clinics" c
ON CONFLICT ("clinicId", "name") DO NOTHING;

INSERT INTO "clinic_roles" ("clinicId", "name", "description", "permissions")
SELECT c."id", 'خدمة العملاء', 'الرد على رسائل العملاء فقط',
       ARRAY['messages']
FROM "clinics" c
ON CONFLICT ("clinicId", "name") DO NOTHING;
