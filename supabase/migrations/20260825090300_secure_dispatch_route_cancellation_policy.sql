drop policy if exists "dispatch staff and assigned driver can update runs"
  on public.dispatch_runs;

create policy "dispatch staff and assigned driver can update runs"
  on public.dispatch_runs
  for update
  to authenticated
  using (
    organization_id = (select private.current_organization_id())
    and (
      (select private.can_dispatch_shipments())
      or driver_id = (select auth.uid())
    )
  )
  with check (
    organization_id = (select private.current_organization_id())
    and (
      (
        (select private.can_dispatch_shipments())
        and (
          status <> 'cancelled'
          or cancelled_by = (select auth.uid())
        )
      )
      or (
        driver_id = (select auth.uid())
        and status in ('handed_over', 'completed')
        and cancelled_by is null
        and cancelled_at is null
      )
    )
  );
