-- Lock down SECURITY DEFINER helpers from anon
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;

-- Restrict branding bucket listing: drop wide-open policy, replace with path-based read
drop policy if exists "Branding public read" on storage.objects;
create policy "Branding read by direct path"
  on storage.objects for select
  using (bucket_id = 'branding' and name is not null);