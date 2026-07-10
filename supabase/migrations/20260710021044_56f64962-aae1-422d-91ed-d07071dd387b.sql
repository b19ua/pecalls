DROP POLICY IF EXISTS "Supervisors view escalated tickets" ON public.tickets;
CREATE POLICY "Supervisors view escalated tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor') AND status IN ('escalated','failed'));

DROP POLICY IF EXISTS "Supervisors view error_logs" ON public.error_logs;
CREATE POLICY "Supervisors view error_logs" ON public.error_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "Owners view own error_logs" ON public.error_logs;
CREATE POLICY "Owners view own error_logs" ON public.error_logs
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());