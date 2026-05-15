ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS inbound_sip_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS inbound_sip_domain text,
  ADD COLUMN IF NOT EXISTS inbound_sip_domain_sid text,
  ADD COLUMN IF NOT EXISTS inbound_sip_username text,
  ADD COLUMN IF NOT EXISTS inbound_sip_password text,
  ADD COLUMN IF NOT EXISTS inbound_sip_credential_list_sid text;

CREATE INDEX IF NOT EXISTS idx_agents_inbound_sip_domain ON public.agents (inbound_sip_domain);