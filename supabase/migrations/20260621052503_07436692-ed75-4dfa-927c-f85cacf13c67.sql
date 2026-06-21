
-- Risk columns on calls (AI-handled)
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS risk_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_reason text,
  ADD COLUMN IF NOT EXISTS primary_signal text,
  ADD COLUMN IF NOT EXISTS suggested_action text,
  ADD COLUMN IF NOT EXISTS risk_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai';

DO $$ BEGIN
  ALTER TABLE public.calls ADD CONSTRAINT calls_risk_level_check CHECK (risk_level IN ('green','amber','red'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.calls ADD CONSTRAINT calls_source_check CHECK (source IN ('ai','human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Risk columns on copilot_sessions (human + copilot)
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'green',
  ADD COLUMN IF NOT EXISTS risk_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_reason text,
  ADD COLUMN IF NOT EXISTS primary_signal text,
  ADD COLUMN IF NOT EXISTS suggested_action text,
  ADD COLUMN IF NOT EXISTS risk_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sentiment text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human';

DO $$ BEGIN
  ALTER TABLE public.copilot_sessions ADD CONSTRAINT cs_risk_level_check CHECK (risk_level IN ('green','amber','red'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.copilot_sessions ADD CONSTRAINT cs_source_check CHECK (source IN ('ai','human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_calls_ended_at ON public.calls (ended_at);
CREATE INDEX IF NOT EXISTS idx_calls_risk_level ON public.calls (risk_level);
CREATE INDEX IF NOT EXISTS idx_cs_ended_at ON public.copilot_sessions (ended_at);
CREATE INDEX IF NOT EXISTS idx_cs_risk_level ON public.copilot_sessions (risk_level);

-- Analysis events (polymorphic)
CREATE TABLE IF NOT EXISTS public.call_analysis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  call_kind text NOT NULL CHECK (call_kind IN ('call','copilot_session')),
  risk_level text NOT NULL,
  risk_score int NOT NULL DEFAULT 0,
  risk_reason text,
  primary_signal text,
  suggested_action text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_analysis_events TO authenticated;
GRANT ALL ON public.call_analysis_events TO service_role;
ALTER TABLE public.call_analysis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages analysis events" ON public.call_analysis_events
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_cae_call ON public.call_analysis_events (call_id, created_at DESC);

-- Whispers (supervisor → manager)
CREATE TABLE IF NOT EXISTS public.whispers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  call_kind text NOT NULL DEFAULT 'copilot_session' CHECK (call_kind IN ('call','copilot_session')),
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  text text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whispers TO authenticated;
GRANT ALL ON public.whispers TO service_role;
ALTER TABLE public.whispers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages whispers" ON public.whispers
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX IF NOT EXISTS idx_whispers_call ON public.whispers (call_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whispers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_analysis_events;

-- Mark existing calls as AI-source by default (already default 'ai')
UPDATE public.calls SET source = 'ai' WHERE source IS NULL;
UPDATE public.copilot_sessions SET source = 'human' WHERE source IS NULL;
