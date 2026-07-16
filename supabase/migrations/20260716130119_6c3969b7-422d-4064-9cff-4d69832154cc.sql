
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS telephony_provider text NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS asterisk_ari_base_url text,
  ADD COLUMN IF NOT EXISTS asterisk_ari_username text,
  ADD COLUMN IF NOT EXISTS asterisk_ari_password text,
  ADD COLUMN IF NOT EXISTS asterisk_ari_app text DEFAULT 'lunara',
  ADD COLUMN IF NOT EXISTS asterisk_audiosocket_host text,
  ADD COLUMN IF NOT EXISTS asterisk_context text DEFAULT 'from-lunara',
  ADD COLUMN IF NOT EXISTS asterisk_caller_id text,
  ADD COLUMN IF NOT EXISTS asterisk_trunk text,
  ADD COLUMN IF NOT EXISTS asterisk_record_calls boolean DEFAULT true;

ALTER TABLE public.agents
  DROP CONSTRAINT IF EXISTS agents_telephony_provider_check;
ALTER TABLE public.agents
  ADD CONSTRAINT agents_telephony_provider_check
  CHECK (telephony_provider IN ('twilio','asterisk'));
