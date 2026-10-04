-- ============================================================================
-- Message-debounce scheduler — Supabase pg_cron + pg_net
-- ============================================================================
--
-- Run this ONCE per environment in the Supabase SQL editor (or psql), AFTER the
-- Prisma migration that creates `conversation_processing` has been applied. It is
-- NOT a Prisma migration: it references secrets (the deployed webhook URL + the
-- CRON_SECRET) that must live in Supabase Vault, not in source control.
--
-- What it does: every ~15s, if any conversation's debounce window has elapsed,
-- POST to the Vercel processor route (/api/cron/process-debounce). pg_net is
-- non-blocking (fire-and-forget), so the Vercel function runs for its full
-- maxDuration independently; a missed tick is harmless — the next one re-fires.
--
-- The `where exists (...)` guard means ZERO Vercel invocations while idle.
-- ----------------------------------------------------------------------------

-- 1) Extensions (safe to run repeatedly).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Secrets — store in Vault. Replace the two literals, run these two lines ONCE,
--    then delete them from your copy so the secret isn't left lying around.
--    (Re-running create_secret with an existing name errors; use vault.update_secret
--     to rotate, or delete the row first.)
--
--   select vault.create_secret('https://YOUR-APP.vercel.app/api/cron/process-debounce', 'debounce_url');
--   select vault.create_secret('YOUR_CRON_SECRET', 'debounce_secret');

-- 3) (Re)schedule the job. Unschedule first so this file is idempotent.
select cron.unschedule('debounce-processor')
where exists (select 1 from cron.job where jobname = 'debounce-processor');

select cron.schedule(
  'debounce-processor',
  '15 seconds',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'debounce_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'debounce_secret')
      ),
      body := '{}'::jsonb
    )
    where exists (
      select 1
      from conversation_processing
      where status = 'PENDING'
        and "readyAt" <= now()
        and ("nextRetryAt" is null or "nextRetryAt" <= now())
    );
  $$
);

-- Inspect / manage later:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'debounce-processor';
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='debounce-processor') order by start_time desc limit 20;
--   select cron.unschedule('debounce-processor');  -- to stop it
