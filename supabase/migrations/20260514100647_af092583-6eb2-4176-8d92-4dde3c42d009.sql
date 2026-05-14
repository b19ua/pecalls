
-- RAG vector search RPC (3072-dim Gemini embeddings)
create or replace function public.match_chunks(
  query_embedding vector(3072),
  p_agent_id uuid,
  p_owner_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql stable security definer set search_path = public as $$
  select kc.id, kc.document_id, kc.content, kc.chunk_index,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.agent_id = p_agent_id
    and kc.owner_id = p_owner_id
    and kc.embedding is not null
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- Twilio numbers cache
create table if not exists public.twilio_numbers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  phone_sid text not null unique,
  phone_e164 text not null,
  friendly_name text,
  agent_id uuid references public.agents(id) on delete set null,
  capabilities jsonb not null default '{}'::jsonb,
  voice_webhook_url text,
  status_callback_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.twilio_numbers enable row level security;

create policy "Owners manage own numbers"
on public.twilio_numbers for all
using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger update_twilio_numbers_updated_at
before update on public.twilio_numbers
for each row execute function public.update_updated_at_column();
