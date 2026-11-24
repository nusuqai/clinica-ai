-- ============================================================================
-- Daily housekeeping for the pg_cron jobs — Supabase pg_cron
-- ============================================================================
--
-- Mirrors the `purge-cron-history` job running on prod (jobid 3). Run it in the
-- Supabase SQL editor on any new environment, after debounce-pgcron.sql /
-- staff-alerts-pgcron.sql and the staff_assistant migration. Idempotent:
-- cron.schedule with an existing job name REPLACES that job, it never adds a
-- second one.
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
--   cron.job_run_details   2 days   (enough to debug a failing job)
--   staff_notifications    30 days after delivery (undelivered ones are kept)
--   staff_pending_actions  7 days after being used, dropped or expiring
--   data_report_deliveries 30 days (the Excel itself is never stored; these
--                          are only send records — needs the data_export migration)
--
-- App tables store UTC in `timestamp` (no time zone) columns, so they are
-- compared with (now() at time zone 'utc'). cron.job_run_details uses timestamptz.
-- ----------------------------------------------------------------------------

create extension if not exists pg_cron;

-- 03:00 UTC daily.
select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $$
    delete from cron.job_run_details
    where end_time < now() - interval '2 days';

    delete from staff_notifications
    where "sentAt" is not null
      and "sentAt" < (now() at time zone 'utc') - interval '30 days';

    delete from staff_pending_actions
    where coalesce("consumedAt", "expiresAt") < (now() at time zone 'utc') - interval '7 days';

    delete from data_report_deliveries
    where "createdAt" < (now() at time zone 'utc') - interval '30 days';
  $$
);

-- Inspect / stop:
--   select jobid, jobname, schedule, active from cron.job order by jobid;
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'purge-cron-history')
--     order by start_time desc limit 10;
--   select count(*), min(start_time) from cron.job_run_details;
--   select cron.unschedule('purge-cron-history');  -- to stop it
