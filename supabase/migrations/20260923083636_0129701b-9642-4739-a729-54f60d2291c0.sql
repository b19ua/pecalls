
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

UPDATE public.profiles SET approval_status = 'approved', approved_at = COALESCE(approved_at, now())
WHERE approval_status <> 'approved';

CREATE TABLE IF NOT EXISTS public.user_approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  email text,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.user_approval_tokens TO service_role;
ALTER TABLE public.user_approval_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins can read approval tokens" ON public.user_approval_tokens;
CREATE POLICY "admins can read approval tokens"
ON public.user_approval_tokens FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.user_approval_tokens TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  user_count int;
begin
  select count(*) into user_count from auth.users;

  insert into public.profiles (user_id, display_name, email, approval_status, approved_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email,
    case when user_count = 1 then 'approved' else 'pending' end,
    case when user_count = 1 then now() else null end
  );

  if user_count = 1 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'user');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where user_id = _user_id and approval_status = 'approved')
$function$;
