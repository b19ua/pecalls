
-- AI Copilot Manager: tables for copilot agents, live sessions and realtime suggestions

CREATE TABLE public.copilot_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'ru',
  enabled boolean NOT NULL DEFAULT true,
  suggestion_categories jsonb NOT NULL DEFAULT '["objection","upsell","compliance","emotion","next_step"]'::jsonb,
  knowledge_hint text,
  product_context text,
  competitor_context text,
  pricing_context text,
  twilio_number_id uuid REFERENCES public.twilio_numbers(id) ON DELETE SET NULL,
  channel_binding text,
  emotion_tracking_enabled boolean NOT NULL DEFAULT true,
  objection_handling_enabled boolean NOT NULL DEFAULT true,
  min_suggestion_interval_ms integer NOT NULL DEFAULT 4000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_agents TO authenticated;
GRANT ALL ON public.copilot_agents TO service_role;
ALTER TABLE public.copilot_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages copilot agents" ON public.copilot_agents
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_copilot_agents_updated_at
BEFORE UPDATE ON public.copilot_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.copilot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.copilot_agents(id) ON DELETE CASCADE,
  manager_id uuid,
  manager_name text,
  call_sid text,
  channel_id text,
  customer_phone text,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  transcript_url text,
  recording_url text,
  summary text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_sessions TO authenticated;
GRANT ALL ON public.copilot_sessions TO service_role;
ALTER TABLE public.copilot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages copilot sessions" ON public.copilot_sessions
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX copilot_sessions_owner_status_idx ON public.copilot_sessions(owner_id, status, started_at DESC);
CREATE INDEX copilot_sessions_call_sid_idx ON public.copilot_sessions(call_sid);

CREATE TRIGGER trg_copilot_sessions_updated_at
BEFORE UPDATE ON public.copilot_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.copilot_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  speaker text,
  trigger_quote text,
  category text,
  priority text NOT NULL DEFAULT 'normal',
  suggestion_text text NOT NULL,
  rationale text,
  emotion text,
  acknowledged boolean NOT NULL DEFAULT false,
  used boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_suggestions TO authenticated;
GRANT ALL ON public.copilot_suggestions TO service_role;
ALTER TABLE public.copilot_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages copilot suggestions" ON public.copilot_suggestions
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX copilot_suggestions_session_ts_idx ON public.copilot_suggestions(session_id, ts DESC);

CREATE TABLE public.copilot_transcript (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.copilot_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  speaker text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_transcript TO authenticated;
GRANT ALL ON public.copilot_transcript TO service_role;
ALTER TABLE public.copilot_transcript ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages copilot transcript" ON public.copilot_transcript
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX copilot_transcript_session_ts_idx ON public.copilot_transcript(session_id, ts);

ALTER PUBLICATION supabase_realtime ADD TABLE public.copilot_suggestions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.copilot_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.copilot_transcript;
