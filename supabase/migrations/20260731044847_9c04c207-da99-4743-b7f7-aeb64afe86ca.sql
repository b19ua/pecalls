CREATE TABLE IF NOT EXISTS public.crm_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  agent_id uuid,
  call_sid text,
  transport text NOT NULL DEFAULT 'asterisk',
  tool_name text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  status_code integer,
  latency_ms integer,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  semantic jsonb NOT NULL DEFAULT '{}'::jsonb,
  facts_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_tool_calls_owner_created_idx ON public.crm_tool_calls (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_tool_calls_call_idx ON public.crm_tool_calls (call_sid);

GRANT SELECT ON public.crm_tool_calls TO authenticated;
GRANT ALL ON public.crm_tool_calls TO service_role;

ALTER TABLE public.crm_tool_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their crm tool calls" ON public.crm_tool_calls;
CREATE POLICY "Owners read their crm tool calls"
  ON public.crm_tool_calls FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);