ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'pending';
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS recording_error TEXT;