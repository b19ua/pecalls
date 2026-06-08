
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  ADD COLUMN IF NOT EXISTS sentiment_score numeric(3,2),
  ADD COLUMN IF NOT EXISTS complaint_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS competitor_mentioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS competitor_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calls_sentiment ON public.calls(owner_id, sentiment);
CREATE INDEX IF NOT EXISTS idx_calls_complaint ON public.calls(owner_id) WHERE complaint_flag = true;
