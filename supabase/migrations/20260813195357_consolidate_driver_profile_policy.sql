-- Keep one performant profile SELECT policy while exposing active drivers to operations.

drop policy if exists "internal users can read active drivers" on public.profiles;
drop policy if exists "users can read permitted profiles" on public.profiles;

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
  or (
    (select private.can_manage_shipments())
    and organization_id = (select private.current_organization_id())
    and role = 'driver'
    and status = 'active'
  )
);
