
CREATE OR REPLACE FUNCTION public.admin_list_cron_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, command text, active boolean, database text, username text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT j.jobid, j.jobname, j.schedule, j.command, j.active, j.database, j.username FROM cron.job j ORDER BY j.jobname;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_cron_runs(_limit int DEFAULT 50)
RETURNS TABLE(jobid bigint, runid bigint, job_pid int, database text, username text, command text, status text, return_message text, start_time timestamptz, end_time timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT r.jobid, r.runid, r.job_pid, r.database, r.username, r.command, r.status, r.return_message, r.start_time, r.end_time
    FROM cron.job_run_details r
    ORDER BY r.start_time DESC
    LIMIT GREATEST(1, LEAST(_limit, 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_cron_active(_jobid bigint, _active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE cron.job SET active = _active WHERE jobid = _jobid;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cron_runs(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_cron_active(bigint, boolean) TO authenticated;
