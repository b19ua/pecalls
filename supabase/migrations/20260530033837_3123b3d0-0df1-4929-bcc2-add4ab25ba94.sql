CREATE TABLE public.agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('webhook','crm_lookup','crm_write')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 64 AND name ~ '^[a-zA-Z][a-zA-Z0-9_]*$'),
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tools TO authenticated;
GRANT ALL ON public.agent_tools TO service_role;

ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own tools"
ON public.agent_tools
FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_agent_tools_agent ON public.agent_tools(agent_id);

CREATE TRIGGER trg_agent_tools_updated
BEFORE UPDATE ON public.agent_tools
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();