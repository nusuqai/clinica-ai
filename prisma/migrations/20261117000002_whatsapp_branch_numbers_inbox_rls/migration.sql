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
