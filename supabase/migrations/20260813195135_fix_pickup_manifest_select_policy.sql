-- Allow INSERT ... RETURNING for newly-created manifests without weakening tenant isolation.

drop policy if exists "authorized users can read pickup manifests"
on public.pickup_manifests;

create policy "authorized users can read pickup manifests"
on public.pickup_manifests
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or created_by = (select auth.uid())
    or shipper_id = (select auth.uid())
    or assigned_driver_id = (select auth.uid())
  )
);
