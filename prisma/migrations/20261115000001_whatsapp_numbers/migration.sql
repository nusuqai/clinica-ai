-- WhatsApp numbers: provider choice, several numbers per clinic (clinic-level or
-- per branch), resumable history sync, inbox row-level security, and unlinking
-- that keeps a number's conversations.
--
-- One migration for everything the feat/evolution-api branch changes in the
-- database (it replaces the branch's earlier 20261115000001_whatsapp_provider,
-- 20261117000001_whatsapp_multi_number and
-- 20261117000002_whatsapp_branch_numbers_inbox_rls, none of which was applied
-- anywhere). Sections, in order:
--
--   1) provider       — META_CLOUD (official Cloud API) or EVOLUTION (WhatsApp Web)
--   2) multi-number   — several numbers per clinic, message → number tag,
--                       per-number history-sync progress
--   3) branch + RLS   — numbers can belong to a branch; inbox tables locked
--                       down for browser roles
--   4) unlink         — unlinked numbers keep their messages; clinic-wide
--                       dedup index for the history import
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB — see prisma/README.md). Additive +
-- idempotent.

-- ════════════════════════════════════════════════════════════════════════════
-- from 20261115000001_whatsapp_provider
-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp provider per clinic: META_CLOUD (official Cloud API) or EVOLUTION
-- (unofficial WhatsApp Web through a self-hosted Evolution API).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent; every
-- existing row stays META_CLOUD via the default. The Meta-only columns become
-- nullable because an Evolution clinic has none of them.

DO $$ BEGIN
  CREATE TYPE "WhatsappProvider" AS ENUM ('META_CLOUD', 'EVOLUTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "whatsapp_configs"
  ADD COLUMN IF NOT EXISTS "provider" "WhatsappProvider" NOT NULL DEFAULT 'META_CLOUD',
  ADD COLUMN IF NOT EXISTS "evolutionInstanceName" TEXT;

ALTER TABLE "whatsapp_configs"
  ALTER COLUMN "phoneNumberId" DROP NOT NULL,
  ALTER COLUMN "wabaId" DROP NOT NULL,
  ALTER COLUMN "accessTokenCipher" DROP NOT NULL,
  ALTER COLUMN "verifyToken" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_evolutionInstanceName_key"
  ON "whatsapp_configs"("evolutionInstanceName");

-- ════════════════════════════════════════════════════════════════════════════
-- from 20261117000001_whatsapp_multi_number
-- ════════════════════════════════════════════════════════════════════════════
-- Several WhatsApp numbers per clinic, and a resumable chat-history sync per
-- number.
--
--  * whatsapp_configs: no longer one per clinic. At most one official
--    (META_CLOUD) number and exactly one main ("isPrimary") number per clinic,
--    both enforced by partial unique indexes. Every existing row was its
--    clinic's only number, so it becomes the main one.
--  * messages.whatsappConfigId: the clinic number a message came in on / went
--    out from. Backfilled for existing WhatsApp conversations (each clinic had
--    one number, so it's unambiguous).
--  * whatsapp_history_syncs: saved progress of a number's history import, so
--    staff can stop it and later resume it (or start a fresh 90 days).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent.

-- ── whatsapp_configs ─────────────────────────────────────────────────────────
ALTER TABLE "whatsapp_configs"
  ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Only on first apply: before this migration a clinic had at most one row.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'whatsapp_configs_clinicId_key') THEN
    UPDATE "whatsapp_configs" SET "isPrimary" = true;
  END IF;
END $$;

DROP INDEX IF EXISTS "whatsapp_configs_clinicId_key";
CREATE INDEX IF NOT EXISTS "whatsapp_configs_clinicId_idx" ON "whatsapp_configs"("clinicId");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_one_official_per_clinic"
  ON "whatsapp_configs"("clinicId") WHERE "provider" = 'META_CLOUD';
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_one_primary_per_clinic"
  ON "whatsapp_configs"("clinicId") WHERE "isPrimary";

-- ── messages.whatsappConfigId ────────────────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "whatsappConfigId" UUID;

DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_whatsappConfigId_fkey"
    FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "messages_conversationId_whatsappConfigId_createdAt_idx"
  ON "messages"("conversationId", "whatsappConfigId", "createdAt");

UPDATE "messages" m
SET "whatsappConfigId" = c."id"
FROM "conversations" conv, "whatsapp_configs" c
WHERE m."whatsappConfigId" IS NULL
  AND conv."id" = m."conversationId"
  AND conv."channel" = 'WHATSAPP'
  AND c."clinicId" = m."clinicId"
  AND c."isPrimary";

-- ── whatsapp_history_syncs ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "HistorySyncStatus" AS ENUM ('RUNNING', 'STOPPED', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- An earlier draft of this change (20261117000001_whatsapp_history_sync, applied
-- on some dev databases) created the table keyed by clinic. Reshape it to one row
-- per number: back then a clinic had at most one number, so the join is exact;
-- rows whose clinic has no WhatsApp Web number are just stale progress — dropped.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'whatsapp_history_syncs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'whatsapp_history_syncs'
      AND column_name = 'whatsappConfigId'
  ) THEN
    ALTER TABLE "whatsapp_history_syncs" ADD COLUMN "whatsappConfigId" UUID;
    UPDATE "whatsapp_history_syncs" s
      SET "whatsappConfigId" = c."id"
      FROM "whatsapp_configs" c
      WHERE c."clinicId" = s."clinicId" AND c."provider" = 'EVOLUTION';
    DELETE FROM "whatsapp_history_syncs" WHERE "whatsappConfigId" IS NULL;
    ALTER TABLE "whatsapp_history_syncs" ALTER COLUMN "whatsappConfigId" SET NOT NULL;
    DROP INDEX IF EXISTS "whatsapp_history_syncs_clinicId_key";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_history_syncs" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "whatsappConfigId" UUID NOT NULL,
  "status" "HistorySyncStatus" NOT NULL,
  "runId" UUID NOT NULL,
  "since" TIMESTAMP(3) NOT NULL,
  "chats" JSONB,
  "totalChats" INTEGER NOT NULL DEFAULT 0,
  "nextIndex" INTEGER NOT NULL DEFAULT 0,
  "messagesImported" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "whatsapp_history_syncs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_history_syncs_whatsappConfigId_key"
  ON "whatsapp_history_syncs"("whatsappConfigId");
CREATE INDEX IF NOT EXISTS "whatsapp_history_syncs_clinicId_idx"
  ON "whatsapp_history_syncs"("clinicId");

DO $$ BEGIN
  ALTER TABLE "whatsapp_history_syncs"
    ADD CONSTRAINT "whatsapp_history_syncs_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_history_syncs"
    ADD CONSTRAINT "whatsapp_history_syncs_whatsappConfigId_fkey"
    FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- from 20261117000002_whatsapp_branch_numbers_inbox_rls
-- ════════════════════════════════════════════════════════════════════════════
-- 1) WhatsApp numbers can belong to a branch (null = a clinic-level number).
-- 2) Lock down `messages` and `conversations` for browser roles.
--
-- Until now both tables had row-level security OFF and SELECT granted to
-- `anon`, so anyone holding the public Supabase key could read every clinic's
-- conversations over the REST API or Realtime. The app itself never reads them
-- that way — it connects as the table owner (postgres, which bypasses RLS) — the
-- browser only uses Realtime as a live "something changed" signal. From here:
--   * `anon` has no access at all;
--   * `authenticated` may only SELECT, and only rows its user may see:
--       - clinic ADMINs, platform admins, and STAFF holding "messages" with no
--         branch limit → the whole clinic;
--       - branch-limited STAFF with "messages" → only messages that went
--         through a number of one of their branches (and conversations that
--         contain such a message);
--       - anyone → their own conversation (patients, staff's own AI chat).
--
-- Applied with `prisma migrate deploy` (hand-written). Idempotent.

-- ── 1) Number → branch ───────────────────────────────────────────────────────
ALTER TABLE "whatsapp_configs" ADD COLUMN IF NOT EXISTS "branchId" UUID;
CREATE INDEX IF NOT EXISTS "whatsapp_configs_branchId_idx" ON "whatsapp_configs"("branchId");
DO $$ BEGIN
  ALTER TABLE "whatsapp_configs"
    ADD CONSTRAINT "whatsapp_configs_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2) Row-level security for the inbox tables ───────────────────────────────
-- Only on Supabase (auth.uid() and the anon/authenticated roles exist there).
DO $outer$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE NOTICE 'auth.uid() not found — skipping inbox RLS (not a Supabase database)';
    RETURN;
  END IF;

  -- What the signed-in user may see of a clinic's inbox: 'all', 'branches', or 'none'.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.inbox_access(p_clinic uuid)
    RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND "isPlatformAdmin") THEN 'all'
        ELSE COALESCE((
          SELECT CASE
            WHEN m.role = 'ADMIN' THEN 'all'
            WHEN m.role = 'STAFF' AND 'messages' = ANY (COALESCE(r.permissions, '{}')) THEN
              CASE WHEN m."allBranches" THEN 'all' ELSE 'branches' END
            ELSE 'none'
          END
          FROM clinic_members m
          LEFT JOIN clinic_roles r ON r.id = m."clinicRoleId"
          WHERE m."userId" = auth.uid() AND m."clinicId" = p_clinic
        ), 'none')
      END
    $body$
  $fn$;

  -- Is this clinic number one of the signed-in user's branches' numbers?
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.inbox_number_in_my_branches(p_clinic uuid, p_config uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT p_config IS NOT NULL AND EXISTS (
        SELECT 1
        FROM whatsapp_configs w
        JOIN clinic_member_branches mb ON mb."branchId" = w."branchId"
        JOIN clinic_members m ON m.id = mb."memberId"
        WHERE w.id = p_config AND w."clinicId" = p_clinic
          AND m."userId" = auth.uid() AND m."clinicId" = p_clinic
      )
    $body$
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.can_read_message(p_clinic uuid, p_conversation uuid, p_config uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT CASE public.inbox_access(p_clinic)
               WHEN 'all' THEN true
               WHEN 'branches' THEN public.inbox_number_in_my_branches(p_clinic, p_config)
               ELSE false
             END
          OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = p_conversation AND c."userId" = auth.uid())
    $body$
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.can_read_conversation(p_clinic uuid, p_conversation uuid, p_owner uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT COALESCE(p_owner = auth.uid(), false)
          OR CASE public.inbox_access(p_clinic)
               WHEN 'all' THEN true
               WHEN 'branches' THEN EXISTS (
                 SELECT 1 FROM messages x
                 WHERE x."conversationId" = p_conversation
                   AND public.inbox_number_in_my_branches(p_clinic, x."whatsappConfigId")
               )
               ELSE false
             END
    $body$
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_access(uuid) FROM PUBLIC, anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_number_in_my_branches(uuid, uuid) FROM PUBLIC, anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.can_read_message(uuid, uuid, uuid) FROM PUBLIC, anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.can_read_conversation(uuid, uuid, uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.inbox_access(uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.inbox_number_in_my_branches(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_read_message(uuid, uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.can_read_conversation(uuid, uuid, uuid) TO authenticated';

  EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY';

  -- The old blanket "anyone can read" policies (created by hand in the dashboard).
  EXECUTE 'DROP POLICY IF EXISTS allow_realtime_select ON public.messages';
  EXECUTE 'DROP POLICY IF EXISTS allow_realtime_select ON public.conversations';
  EXECUTE 'DROP POLICY IF EXISTS inbox_read ON public.messages';
  EXECUTE 'DROP POLICY IF EXISTS inbox_read ON public.conversations';

  EXECUTE 'CREATE POLICY inbox_read ON public.messages FOR SELECT TO authenticated
           USING (public.can_read_message("clinicId", "conversationId", "whatsappConfigId"))';
  EXECUTE 'CREATE POLICY inbox_read ON public.conversations FOR SELECT TO authenticated
           USING (public.can_read_conversation("clinicId", id, "userId"))';

  EXECUTE 'REVOKE ALL ON TABLE public.messages, public.conversations FROM anon';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
           ON TABLE public.messages, public.conversations FROM authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.messages, public.conversations TO authenticated';

  -- Realtime checks every change against these policies AS the subscriber, so
  -- signed-in users need to reach the schema (they could not before — which,
  -- with RLS off, meant Realtime skipped the check and broadcast every new
  -- message to any subscriber, even one holding only the public anon key).
  -- `authenticated` holds grants on nothing else in `public`; `anon` stays out.
  EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';
END $outer$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Unlinking keeps the number's conversations
-- ════════════════════════════════════════════════════════════════════════════
-- Unlinking a WhatsApp Web number used to delete it with every message that went
-- through it. Now the row stays, stamped `unlinkedAt`: its messages remain in the
-- inbox (labelled as an old number) and the branch-scoped RLS above keeps
-- working, since the number still carries its branch. An unlinked number never
-- sends, receives, or is the main number.
ALTER TABLE "whatsapp_configs" ADD COLUMN IF NOT EXISTS "unlinkedAt" TIMESTAMP(3);

-- The history import skips messages the clinic already has (by WhatsApp id),
-- whichever conversation or number they were stored under.
CREATE INDEX IF NOT EXISTS "messages_clinicId_whatsappMessageId_idx"
  ON "messages"("clinicId", "whatsappMessageId");
