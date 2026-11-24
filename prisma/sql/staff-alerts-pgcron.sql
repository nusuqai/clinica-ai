-- ============================================================================
-- Team-alert sweep scheduler (#89) — Supabase pg_cron + pg_net
-- ============================================================================
--
-- Run ONCE per environment in the Supabase SQL editor, AFTER the Prisma
-- migration 20261124000001_staff_assistant is applied. Not a Prisma migration:
-- it reads the deployed URL + CRON_SECRET from Supabase Vault.
--
-- Every minute, when any team alert is waiting or a conversation reminder came
-- due, POST to /api/cron/staff-alerts. The route itself applies each clinic's
-- batch window (StaffAssistantSettings.batchMinutes, default 5), so a tick that
-- finds nothing old enough simply sends nothing. Zero calls while idle.
-- ----------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets (once). The CRON_SECRET is the same one the debounce job uses, so
-- reuse 'debounce_secret' and only add the URL:
--
--   select vault.create_secret('https://YOUR-APP.vercel.app/api/cron/staff-alerts', 'staff_alerts_url');

select cron.unschedule('staff-alerts-sweep')
where exists (select 1 from cron.job where jobname = 'staff-alerts-sweep');

select cron.schedule(
  'staff-alerts-sweep',
  '* * * * *',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'staff_alerts_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'debounce_secret')
      ),
      body := '{}'::jsonb
    )
    where exists (
      select 1 from staff_notifications
      where "sentAt" is null
        and ("lastError" is null or "lastError" <> 'window_closed_no_template')
    )
    or exists (
      select 1 from conversation_reminders
      where "doneAt" is null
        and "whatsappNotifiedAt" is null
        and "dueAt" <= (now() at time zone 'utc')
        and "dueAt" >= (now() at time zone 'utc') - interval '1 day'
    );
  $$
);

-- Inspect / stop:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='staff-alerts-sweep') order by start_time desc limit 20;
--   select cron.unschedule('staff-alerts-sweep');
