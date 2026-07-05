-- Ticket queue/retry fields
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_owner_idem
  ON public.tickets(owner_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_next_retry
  ON public.tickets(next_retry_at)
  WHERE status IN ('pending', 'failed') AND next_retry_at IS NOT NULL;

-- Per-agent tool config
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS tools_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Health-check tracking
ALTER TABLE public.crm_health
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_up boolean,
  ADD COLUMN IF NOT EXISTS last_check_latency_ms integer;

-- Function used by public webhook to update ticket from external CRM callback
CREATE OR REPLACE FUNCTION public.update_ticket_from_webhook(
  _owner_id uuid,
  _external_ticket_id text,
  _status text,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  UPDATE public.tickets
    SET external_status = _status,
        response = COALESCE(response, '{}'::jsonb) || jsonb_build_object('webhook', _payload, 'webhook_at', now()),
        updated_at = now()
    WHERE owner_id = _owner_id
      AND external_ticket_id = _external_ticket_id
    RETURNING id INTO _id;
  RETURN _id;
END;
$$;