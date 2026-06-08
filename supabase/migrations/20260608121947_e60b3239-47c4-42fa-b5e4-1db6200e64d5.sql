
CREATE TABLE public.data_residency_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'cloud' CHECK (mode IN ('cloud','self_hosted')),
  gateway_url TEXT,
  hmac_secret TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_ping_at TIMESTAMPTZ,
  last_ping_ok BOOLEAN,
  last_ping_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_residency_configs TO authenticated;
GRANT ALL ON public.data_residency_configs TO service_role;
ALTER TABLE public.data_residency_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage own residency config"
  ON public.data_residency_configs FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER data_residency_configs_updated_at
  BEFORE UPDATE ON public.data_residency_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calls
  ADD COLUMN data_residency TEXT NOT NULL DEFAULT 'cloud' CHECK (data_residency IN ('cloud','self_hosted')),
  ADD COLUMN external_call_ref TEXT;
