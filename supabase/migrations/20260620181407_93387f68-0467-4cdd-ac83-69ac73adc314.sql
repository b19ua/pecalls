ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_data jsonb,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;