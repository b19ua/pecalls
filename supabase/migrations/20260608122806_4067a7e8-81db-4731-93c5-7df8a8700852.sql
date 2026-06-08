
ALTER TABLE public.data_residency_configs
  ADD COLUMN IF NOT EXISTS purge_twilio_after_ingest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS proxy_audio boolean NOT NULL DEFAULT false;
