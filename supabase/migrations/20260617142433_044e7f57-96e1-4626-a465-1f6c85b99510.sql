
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS inbound_connection_type text NOT NULL DEFAULT 'phone',
  ADD COLUMN IF NOT EXISTS inbound_sip_uri_user text;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_inbound_connection_type_chk;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_inbound_connection_type_chk
  CHECK (inbound_connection_type IN ('phone', 'sip_uri'));

CREATE UNIQUE INDEX IF NOT EXISTS agents_inbound_sip_uri_user_uniq
  ON public.agents (lower(inbound_sip_uri_user))
  WHERE inbound_sip_uri_user IS NOT NULL;
