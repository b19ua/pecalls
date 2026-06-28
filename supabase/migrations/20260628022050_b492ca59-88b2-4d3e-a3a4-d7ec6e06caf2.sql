
ALTER TABLE public.data_residency_configs
  ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_knowledge BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_agents BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_transcripts BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gdpr_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.gdpr_dsr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('export','erase','sync')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gdpr_dsr_requests TO authenticated;
GRANT ALL ON public.gdpr_dsr_requests TO service_role;

ALTER TABLE public.gdpr_dsr_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages own dsr" ON public.gdpr_dsr_requests;
CREATE POLICY "owner manages own dsr" ON public.gdpr_dsr_requests
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS gdpr_dsr_owner_created ON public.gdpr_dsr_requests(owner_id, created_at DESC);
