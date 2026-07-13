
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Unschedule existing hooks if present
DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('lunara_tickets_retry','lunara_sla_snapshot') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'lunara_tickets_retry',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://project--d7e8c4a9-917e-4bb2-a113-6e70fdf150da.lovable.app/api/public/hooks/tickets-retry',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);

SELECT cron.schedule(
  'lunara_sla_snapshot',
  '5 * * * *',
  $$SELECT net.http_post(
    url := 'https://project--d7e8c4a9-917e-4bb2-a113-6e70fdf150da.lovable.app/api/public/hooks/sla-snapshot',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
