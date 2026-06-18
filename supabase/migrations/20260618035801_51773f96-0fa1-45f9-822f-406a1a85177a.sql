ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_bot_username text,
  ADD COLUMN IF NOT EXISTS telegram_bot_id bigint;