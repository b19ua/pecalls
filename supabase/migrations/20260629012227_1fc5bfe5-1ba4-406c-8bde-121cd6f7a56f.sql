-- Auto-retention: per-owner, every 6 hours, delete cloud-side calls & transcripts older than retention_days
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.purge_expired_cloud_data()
RETURNS TABLE(owner_id uuid, calls_deleted int, copilot_sessions_deleted int, transcript_deleted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  c_count int; s_count int; t_count int;
BEGIN
  FOR cfg IN
    SELECT drc.owner_id, COALESCE(drc.retention_days, 0) AS days
    FROM public.data_residency_configs drc
    WHERE COALESCE(drc.retention_days, 0) > 0
  LOOP
    EXECUTE format(
      'WITH d AS (DELETE FROM public.calls WHERE owner_id = %L AND created_at < now() - %L::interval RETURNING 1) SELECT count(*) FROM d',
      cfg.owner_id, (cfg.days || ' days')
    ) INTO c_count;

    EXECUTE format(
      'WITH d AS (DELETE FROM public.copilot_transcript WHERE owner_id = %L AND created_at < now() - %L::interval RETURNING 1) SELECT count(*) FROM d',
      cfg.owner_id, (cfg.days || ' days')
    ) INTO t_count;

    EXECUTE format(
      'WITH d AS (DELETE FROM public.copilot_sessions WHERE owner_id = %L AND created_at < now() - %L::interval RETURNING 1) SELECT count(*) FROM d',
      cfg.owner_id, (cfg.days || ' days')
    ) INTO s_count;

    owner_id := cfg.owner_id;
    calls_deleted := c_count;
    copilot_sessions_deleted := s_count;
    transcript_deleted := t_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_cloud_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_cloud_data() TO service_role;

-- Unschedule previous version if any, then schedule every 6 hours
DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'lunara_purge_expired_cloud_data' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'lunara_purge_expired_cloud_data',
  '17 */6 * * *',
  $$SELECT public.purge_expired_cloud_data();$$
);