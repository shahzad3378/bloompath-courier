-- Let active internal organization users use shipper and driver filters.
-- Keep profile visibility tenant-scoped and limit staff visibility to active operational accounts.
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
    and status = 'active'
    and role in ('driver', 'shipper')
  )
);
