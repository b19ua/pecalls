
ALTER TABLE public.data_residency_configs
  ADD COLUMN IF NOT EXISTS crm2_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crm2_url text DEFAULT 'http://10.8.0.2:8000/create-ticket',
  ADD COLUMN IF NOT EXISTS crm2_timeout_ms integer NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS crm2_system_prompt_template text DEFAULT '';
