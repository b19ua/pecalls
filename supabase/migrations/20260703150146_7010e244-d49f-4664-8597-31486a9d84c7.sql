
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  agent_id UUID,
  call_id UUID,
  call_sid TEXT,
  crm_id TEXT NOT NULL DEFAULT 'crm2',
  external_ticket_id TEXT,
  phone_number TEXT,
  nlc_number TEXT,
  facility_address TEXT,
  emergency_type TEXT,
  caller_comment TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tickets_owner_created ON public.tickets(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_call_sid ON public.tickets(call_sid);
CREATE INDEX IF NOT EXISTS tickets_status ON public.tickets(status);

GRANT SELECT ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE TRIGGER tickets_set_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Circuit breaker state (per owner+crm)
CREATE TABLE IF NOT EXISTS public.crm_health (
  owner_id UUID NOT NULL,
  crm_id TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  breaker_open_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, crm_id)
);

GRANT SELECT ON public.crm_health TO authenticated;
GRANT ALL ON public.crm_health TO service_role;

ALTER TABLE public.crm_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own crm_health"
  ON public.crm_health FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);
