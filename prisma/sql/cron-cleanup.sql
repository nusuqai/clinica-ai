-- ============================================================================
-- Daily housekeeping for the pg_cron jobs — Supabase pg_cron
-- ============================================================================
--
-- Run ONCE per environment in the Supabase SQL editor, after
-- debounce-pgcron.sql / staff-alerts-pgcron.sql (and the staff_assistant
-- migration). Idempotent: re-running reschedules the same job.
--
-- Why: pg_cron logs every run in cron.job_run_details and never prunes it. The
-- debounce job ticks every 15s (~5,760 rows/day) and the team-alert sweep every
-- minute (~1,440 rows/day). The team-assistant tables (#89) also keep delivered
-- alerts and used/expired confirmation proposals forever.
--
-- Not needed for pg_net: its response log (net._http_response) is already
-- pruned automatically (pg_net.ttl, 6 hours by default).
--
-- Retention:
--   cron.job_run_details   7 days   (enough to debug a failing job)
--   staff_notifications    30 days after delivery (undelivered ones are kept)
--   staff_pending_actions  7 days after being used, dropped or expiring
--
-- App tables store UTC in `timestamp` (no time zone) columns, so they are
-- compared with (now() at time zone 'utc'). cron.job_run_details uses timestamptz.
-- ----------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.unschedule('cron-cleanup')
where exists (select 1 from cron.job where jobname = 'cron-cleanup');

-- 03:30 UTC daily — a quiet hour for clinics in the region.
select cron.schedule(
  'cron-cleanup',
  '30 3 * * *',
  $$
    delete from cron.job_run_details
    where end_time < now() - interval '7 days';

    delete from staff_notifications
    where "sentAt" is not null
      and "sentAt" < (now() at time zone 'utc') - interval '30 days';

    delete from staff_pending_actions
    where coalesce("consumedAt", "expiresAt") < (now() at time zone 'utc') - interval '7 days';
  $$
);

-- Inspect / run now / stop:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='cron-cleanup') order by start_time desc limit 10;
--   select count(*) from cron.job_run_details;
--   select cron.unschedule('cron-cleanup');
