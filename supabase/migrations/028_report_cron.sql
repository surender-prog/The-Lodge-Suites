-- 028 — Scheduled reports: pg_cron trigger for /api/run-reports
-- ============================================================================
-- Pings the Vercel report runner every 30 minutes (matches the schedule
-- times: 07:00 / 07:30 / 08:00 / 08:30 Bahrain). The runner itself decides
-- what is due, sends the emails through the saved SMTP config, and writes
-- lastRunAt / nextRunAt back — so the admin's Scheduled Reports table shows
-- real runs. Pinging when nothing is due is a cheap no-op.
--
-- ⚠ BEFORE RUNNING:
--   1. Generate a secret, e.g.:  openssl rand -hex 24
--   2. Add it in Vercel → Project → Settings → Environment Variables:
--        REPORTS_CRON_SECRET = <the secret>      (then redeploy)
--   3. Replace __REPORTS_CRON_SECRET__ below with the SAME value.
--
-- Idempotent: re-running replaces the existing job.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any previous version of the job.
do $$
begin
  perform cron.unschedule('lodge-report-runner');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule(
  'lodge-report-runner',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://www.thelodgesuites.com/api/run-reports?key=__REPORTS_CRON_SECRET__'
  );
  $$
);

-- Useful checks after applying:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details
--     order by start_time desc limit 10;
