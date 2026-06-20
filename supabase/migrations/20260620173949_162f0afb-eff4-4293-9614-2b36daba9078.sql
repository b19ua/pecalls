
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS objection_handling_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS objection_aaa_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS objection_categories text[] NOT NULL DEFAULT ARRAY['price','timing','trust','competitor','stall','emotional','clarification']::text[],
  ADD COLUMN IF NOT EXISTS objection_custom_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS emotion_tracking_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.objection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  call_sid text,
  channel text NOT NULL DEFAULT 'voice',
  objection_type text NOT NULL,
  raw_quote text,
  customer_emotion text,
  strategy_used text,
  ai_response text,
  outcome text NOT NULL DEFAULT 'unresolved',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objection_events TO authenticated;
GRANT ALL ON public.objection_events TO service_role;

ALTER TABLE public.objection_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can manage objection events" ON public.objection_events;
CREATE POLICY "owner can manage objection events" ON public.objection_events
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_objection_events_owner ON public.objection_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_objection_events_agent ON public.objection_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_objection_events_call ON public.objection_events(call_sid);
