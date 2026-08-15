drop policy "users can read their own profile" on public.profiles;
drop policy "super admins can read organization profiles" on public.profiles;

create policy "users can read permitted profiles"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (
    (select private.is_super_admin())
    and organization_id = (select private.current_organization_id())
  )
);
