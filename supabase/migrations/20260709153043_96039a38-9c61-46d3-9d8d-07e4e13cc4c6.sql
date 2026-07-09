
CREATE TABLE public.ticket_sla_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  bucket_hour timestamptz not null,
  total int not null default 0,
  success int not null default 0,
  failed int not null default 0,
  escalated int not null default 0,
  pending int not null default 0,
  p95_latency_ms int,
  success_rate numeric(5,2),
  breaker_open boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, bucket_hour)
);
CREATE INDEX ticket_sla_snapshots_owner_bucket_idx ON public.ticket_sla_snapshots (owner_id, bucket_hour DESC);
GRANT SELECT ON public.ticket_sla_snapshots TO authenticated;
GRANT ALL ON public.ticket_sla_snapshots TO service_role;
ALTER TABLE public.ticket_sla_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads own sla snapshots" ON public.ticket_sla_snapshots
  FOR SELECT USING (auth.uid() = owner_id);
