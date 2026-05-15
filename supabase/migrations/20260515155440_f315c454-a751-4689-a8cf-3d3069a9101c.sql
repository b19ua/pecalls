
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS outbound_mode text NOT NULL DEFAULT 'twilio_number',
  ADD COLUMN IF NOT EXISTS sip_domain text,
  ADD COLUMN IF NOT EXISTS sip_username text,
  ADD COLUMN IF NOT EXISTS sip_password text,
  ADD COLUMN IF NOT EXISTS sip_transport text NOT NULL DEFAULT 'tls',
  ADD COLUMN IF NOT EXISTS sip_from_number text;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_outbound_mode_check;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_outbound_mode_check
  CHECK (outbound_mode IN ('twilio_number','sip_trunk'));

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_sip_transport_check;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_sip_transport_check
  CHECK (sip_transport IN ('tls','tcp','udp'));
