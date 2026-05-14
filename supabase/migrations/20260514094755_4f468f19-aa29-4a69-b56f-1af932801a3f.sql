-- ============ EXTENSIONS ============
create extension if not exists vector;

-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'user');
create type public.call_direction as enum ('inbound', 'outbound');
create type public.call_status as enum ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'canceled', 'handoff');
create type public.doc_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type public.campaign_status as enum ('draft', 'scheduled', 'running', 'paused', 'completed');
create type public.contact_status as enum ('pending', 'calling', 'completed', 'failed', 'skipped');

-- ============ TIMESTAMP TRIGGER FN ============
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users view own roles" on public.user_roles for select using (auth.uid() = user_id);
create policy "Admins view all roles" on public.user_roles for select using (public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin'));

-- ============ HANDLE NEW USER (auto profile + first user becomes admin) ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count int;
begin
  insert into public.profiles (user_id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), new.email);

  select count(*) into user_count from auth.users;
  if user_count = 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ AGENTS ============
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  greeting text not null default 'Здравствуйте! Чем могу помочь?',
  system_prompt text not null default 'Ты вежливый ассистент Premier Energy. Отвечай кратко и по делу.',
  voice text not null default 'Puck',
  language text not null default 'ru-RU',
  model text not null default 'gemini-2.5-flash-preview-native-audio-dialog',
  temperature numeric(3,2) not null default 0.8,
  twilio_number_e164 text,
  handoff_numbers text[] not null default '{}',
  handoff_trigger_phrases text[] not null default array['соедини с менеджером','оператор','human','manager'],
  handoff_dtmf_digit text default '0',
  handoff_enabled boolean not null default true,
  max_call_seconds int not null default 600,
  silence_timeout_seconds int not null default 8,
  record_calls boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agents enable row level security;

create policy "Owners manage own agents" on public.agents for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger agents_updated_at before update on public.agents
  for each row execute function public.update_updated_at_column();

create index idx_agents_owner on public.agents(owner_id);
create index idx_agents_twilio_number on public.agents(twilio_number_e164) where twilio_number_e164 is not null;

-- ============ KNOWLEDGE DOCUMENTS ============
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  status doc_status not null default 'uploaded',
  chunk_count int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.knowledge_documents enable row level security;

create policy "Owners manage own documents" on public.knowledge_documents for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger knowledge_documents_updated_at before update on public.knowledge_documents
  for each row execute function public.update_updated_at_column();

create index idx_kdocs_agent on public.knowledge_documents(agent_id);

-- ============ KNOWLEDGE CHUNKS (RAG) ============
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  chunk_index int not null default 0,
  embedding vector(3072),
  token_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.knowledge_chunks enable row level security;

create policy "Owners read own chunks" on public.knowledge_chunks for select using (auth.uid() = owner_id);
create policy "Owners insert own chunks" on public.knowledge_chunks for insert with check (auth.uid() = owner_id);
create policy "Owners delete own chunks" on public.knowledge_chunks for delete using (auth.uid() = owner_id);

create index idx_chunks_agent on public.knowledge_chunks(agent_id);
create index idx_chunks_doc on public.knowledge_chunks(document_id);

-- ============ CALLS ============
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  twilio_call_sid text unique,
  direction call_direction not null,
  from_number text,
  to_number text,
  status call_status not null default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int not null default 0,
  recording_url text,
  recording_path text,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  handoff_to text,
  handoff_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.calls enable row level security;

create policy "Owners manage own calls" on public.calls for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger calls_updated_at before update on public.calls
  for each row execute function public.update_updated_at_column();

create index idx_calls_owner_started on public.calls(owner_id, started_at desc);
create index idx_calls_agent on public.calls(agent_id);
create index idx_calls_sid on public.calls(twilio_call_sid);

-- ============ CAMPAIGNS ============
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  name text not null,
  status campaign_status not null default 'draft',
  max_concurrent int not null default 2,
  scheduled_at timestamptz,
  timezone text not null default 'Europe/Chisinau',
  call_window_start time not null default '09:00',
  call_window_end time not null default '20:00',
  total_contacts int not null default 0,
  completed_contacts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;

create policy "Owners manage own campaigns" on public.campaigns for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.update_updated_at_column();

-- ============ CAMPAIGN CONTACTS ============
create table public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  name text,
  metadata jsonb not null default '{}'::jsonb,
  status contact_status not null default 'pending',
  attempts int not null default 0,
  last_call_id uuid references public.calls(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.campaign_contacts enable row level security;

create policy "Owners manage own contacts" on public.campaign_contacts for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create index idx_contacts_campaign on public.campaign_contacts(campaign_id, status);

-- ============ STORAGE BUCKETS ============
insert into storage.buckets (id, name, public) values
  ('knowledge-files', 'knowledge-files', false),
  ('call-recordings', 'call-recordings', false),
  ('branding', 'branding', true)
on conflict (id) do nothing;

-- knowledge-files policies (private, owner-scoped via folder = user_id)
create policy "Owners read own knowledge files" on storage.objects for select
  using (bucket_id = 'knowledge-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Owners upload own knowledge files" on storage.objects for insert
  with check (bucket_id = 'knowledge-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Owners delete own knowledge files" on storage.objects for delete
  using (bucket_id = 'knowledge-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- call-recordings policies
create policy "Owners read own recordings" on storage.objects for select
  using (bucket_id = 'call-recordings' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Owners upload own recordings" on storage.objects for insert
  with check (bucket_id = 'call-recordings' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Owners delete own recordings" on storage.objects for delete
  using (bucket_id = 'call-recordings' and auth.uid()::text = (storage.foldername(name))[1]);

-- branding policies (public read, admin write)
create policy "Branding public read" on storage.objects for select
  using (bucket_id = 'branding');
create policy "Admins write branding" on storage.objects for insert
  with check (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update branding" on storage.objects for update
  using (bucket_id = 'branding' and public.has_role(auth.uid(), 'admin'));