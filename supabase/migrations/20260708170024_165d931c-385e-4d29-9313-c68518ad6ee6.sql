
ALTER TABLE public.data_residency_configs
  ADD COLUMN IF NOT EXISTS supervisor_telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS supervisor_telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS notify_on_escalation boolean NOT NULL DEFAULT true;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;
