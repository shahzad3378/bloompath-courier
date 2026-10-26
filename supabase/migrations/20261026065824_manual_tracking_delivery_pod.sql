alter table public.customer_tracking_events
  add column if not exists proof_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_tracking_events_proof_path_length'
      and conrelid = 'public.customer_tracking_events'::regclass
  ) then
    alter table public.customer_tracking_events
      add constraint customer_tracking_events_proof_path_length
      check (proof_path is null or char_length(proof_path) between 10 and 500);
  end if;
end
$$;

create or replace function private.guard_manual_tracking_pod_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.proof_path is null then
    return new;
  end if;

  if new.source <> 'manual'
    or new.status <> 'delivered'
    or new.recorded_by is null
    or new.proof_path not like (new.organization_id::text || '/' || new.recorded_by::text || '/%')
    or storage.extension(new.proof_path) not in ('jpg', 'jpeg', 'png', 'webp')
    or char_length(new.proof_path) > 500
  then
    raise exception 'A POD photo can only be attached to a manual Delivered tracking event.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_manual_tracking_pod_path() from public, anon, authenticated;
drop trigger if exists customer_tracking_events_guard_manual_pod_path on public.customer_tracking_events;
create trigger customer_tracking_events_guard_manual_pod_path
before insert or update of proof_path on public.customer_tracking_events
for each row execute function private.guard_manual_tracking_pod_path();

drop policy if exists "drivers can upload delivery proofs" on storage.objects;
create policy "authorized users can upload delivery proofs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] = (select private.current_organization_id())::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = (select private.current_organization_id())
      and p.status = 'active'
      and (
        p.role = 'driver'
        or (p.role in ('super_admin', 'operations_admin', 'warehouse_staff')
          and (select private.can_manage_shipments()))
      )
  )
);

drop policy if exists "authorized users can read delivery proofs" on storage.objects;
create policy "authorized users can read delivery proofs"
on storage.objects for select to authenticated
using (
  bucket_id = 'delivery-proofs'
  and (storage.foldername(name))[1] = (select private.current_organization_id())::text
  and (
    owner_id = (select auth.uid())::text
    or (select private.can_manage_shipments())
    or exists (
      select 1 from public.delivery_attempts a
      join public.shipments s on s.id = a.shipment_id
      where a.proof_path = name
        and (s.shipper_id = (select auth.uid())
          or (s.shipper_id is null and s.created_by = (select auth.uid())))
    )
    or exists (
      select 1 from public.customer_tracking_events e
      join public.shipments s on s.id = e.shipment_id
      where e.proof_path = name
        and e.organization_id = (select private.current_organization_id())
        and (s.shipper_id = (select auth.uid())
          or (s.shipper_id is null and s.created_by = (select auth.uid())))
    )
  )
);

drop policy if exists "drivers can remove unlinked delivery proofs" on storage.objects;
create policy "users can remove unlinked delivery proofs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'delivery-proofs'
  and owner_id = (select auth.uid())::text
  and not exists (select 1 from public.delivery_attempts a where a.proof_path = name)
  and not exists (select 1 from public.customer_tracking_events e where e.proof_path = name)
);