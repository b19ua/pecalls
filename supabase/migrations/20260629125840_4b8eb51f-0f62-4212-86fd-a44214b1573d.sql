
ALTER TABLE public.data_residency_configs
  ADD COLUMN IF NOT EXISTS crm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crm_url text,
  ADD COLUMN IF NOT EXISTS crm_auth_header text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS crm_auth_value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS crm_timeout_ms integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS crm_tool_description text NOT NULL DEFAULT 'Get caller info from local CRM by phone number. Returns three fields about the customer.',
  ADD COLUMN IF NOT EXISTS crm_object1_label text NOT NULL DEFAULT 'object_1',
  ADD COLUMN IF NOT EXISTS crm_object2_label text NOT NULL DEFAULT 'object_2',
  ADD COLUMN IF NOT EXISTS crm_object3_label text NOT NULL DEFAULT 'object_3';
