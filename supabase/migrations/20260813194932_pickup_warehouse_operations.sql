-- Pickup manifests, shipper handover and warehouse receiving foundation.

create type public.pickup_manifest_status as enum (
  'draft',
  'ready_for_pickup',
  'picked_up',
  'partially_received',
  'received'
);

create sequence public.pickup_manifest_number_seq
  as bigint
  start with 100001
  increment by 1
  no cycle;

create table public.pickup_manifests (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  manifest_number text not null unique,
  shipper_id uuid references public.profiles(id) on delete restrict,
  shipper_name text not null,
  status public.pickup_manifest_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_driver_id uuid references public.profiles(id) on delete restrict,
  picked_up_by uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  picked_up_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_manifests_shipper_name_length
    check (char_length(shipper_name) between 2 and 120),
  constraint pickup_manifests_timestamps_match_status check (
    (status = 'draft' and submitted_at is null and picked_up_at is null and received_at is null)
    or (status = 'ready_for_pickup' and submitted_at is not null and picked_up_at is null and received_at is null)
    or (status in ('picked_up', 'partially_received') and submitted_at is not null and picked_up_at is not null and received_at is null)
    or (status = 'received' and submitted_at is not null and picked_up_at is not null and received_at is not null)
  )
);

create table public.pickup_manifest_items (
  id bigint generated always as identity primary key,
  manifest_id bigint not null references public.pickup_manifests(id) on delete cascade,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict,
  received_at timestamptz,
  received_by uuid references public.profiles(id) on delete restrict,
  warehouse_location text,
  created_at timestamptz not null default now(),
  unique (manifest_id, shipment_id),
  unique (shipment_id),
  constraint pickup_manifest_items_receipt_consistent check (
    (received_at is null and received_by is null and warehouse_location is null)
    or (
      received_at is not null
      and received_by is not null
      and char_length(warehouse_location) between 1 and 50
    )
  )
);

alter table public.shipments
  add column if not exists warehouse_location text,
  add column if not exists warehouse_received_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_warehouse_location_length'
      and conrelid = 'public.shipments'::regclass
  ) then
    alter table public.shipments
      add constraint shipments_warehouse_location_length
      check (warehouse_location is null or char_length(warehouse_location) between 1 and 50);
  end if;
end
$$;

create index pickup_manifests_organization_created_idx
  on public.pickup_manifests (organization_id, created_at desc, id desc);
create index pickup_manifests_active_status_idx
  on public.pickup_manifests (organization_id, status, created_at desc)
  where status <> 'received';
create index pickup_manifests_shipper_id_idx
  on public.pickup_manifests (shipper_id)
  where shipper_id is not null;
create index pickup_manifests_created_by_idx
  on public.pickup_manifests (created_by);
create index pickup_manifests_assigned_driver_id_idx
  on public.pickup_manifests (assigned_driver_id)
  where assigned_driver_id is not null;
create index pickup_manifests_picked_up_by_idx
  on public.pickup_manifests (picked_up_by)
  where picked_up_by is not null;
create index pickup_manifest_items_manifest_received_idx
  on public.pickup_manifest_items (manifest_id, received_at, id);
create index pickup_manifest_items_added_by_idx
  on public.pickup_manifest_items (added_by);
create index pickup_manifest_items_received_by_idx
  on public.pickup_manifest_items (received_by)
  where received_by is not null;

alter table public.pickup_manifests enable row level security;
alter table public.pickup_manifest_items enable row level security;

revoke all on public.pickup_manifests from anon, authenticated;
revoke all on public.pickup_manifest_items from anon, authenticated;
revoke all on sequence public.pickup_manifest_number_seq from public, anon, authenticated;

grant select, insert, update on public.pickup_manifests to authenticated;
grant select, insert, update, delete on public.pickup_manifest_items to authenticated;

create or replace function private.can_process_pickups()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.organization_id is not null
      and p.role in ('super_admin', 'operations_admin', 'warehouse_staff', 'dispatcher')
  );
$$;

create or replace function private.can_receive_pickups()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.organization_id is not null
      and p.role in ('super_admin', 'operations_admin', 'warehouse_staff')
  );
$$;

create or replace function private.can_access_pickup_manifest(target_manifest_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pickup_manifests m
    where m.id = target_manifest_id
      and m.organization_id = (select private.current_organization_id())
      and (
        (select private.can_manage_shipments())
        or m.created_by = (select auth.uid())
        or m.shipper_id = (select auth.uid())
        or m.assigned_driver_id = (select auth.uid())
      )
  );
$$;

revoke all on function private.can_process_pickups() from public;
revoke all on function private.can_receive_pickups() from public;
revoke all on function private.can_access_pickup_manifest(bigint) from public;
grant execute on function private.can_process_pickups() to authenticated;
grant execute on function private.can_receive_pickups() to authenticated;
grant execute on function private.can_access_pickup_manifest(bigint) to authenticated;

create or replace function private.assign_pickup_manifest_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.manifest_number := 'PM'
    || to_char(clock_timestamp() at time zone 'UTC', 'YYMMDD')
    || lpad(nextval('public.pickup_manifest_number_seq')::text, 6, '0');
  return new;
end;
$$;

revoke all on function private.assign_pickup_manifest_number() from public;

create trigger pickup_manifests_assign_number
before insert on public.pickup_manifests
for each row execute function private.assign_pickup_manifest_number();

create trigger pickup_manifests_set_updated_at
before update on public.pickup_manifests
for each row execute function private.set_updated_at();

create or replace function private.guard_pickup_manifest_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  received_items integer;
begin
  if new.organization_id is distinct from old.organization_id
    or new.manifest_number is distinct from old.manifest_number
    or new.shipper_id is distinct from old.shipper_id
    or new.shipper_name is distinct from old.shipper_name
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Manifest identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    raise exception 'No manifest workflow transition was requested.';
  end if;

  select count(*) into total_items
  from public.pickup_manifest_items i
  where i.manifest_id = old.id;

  if old.status = 'draft' and new.status = 'ready_for_pickup' then
    if not ((select private.can_manage_shipments()) or old.created_by = (select auth.uid())) then
      raise exception 'You cannot submit this pickup manifest.';
    end if;
    if total_items = 0 then
      raise exception 'Add at least one AWB before submitting the manifest.';
    end if;
    if exists (
      select 1
      from public.pickup_manifest_items i
      join public.shipments s on s.id = i.shipment_id
      where i.manifest_id = old.id
        and (s.status <> 'booked' or s.deleted_at is not null or s.organization_id <> old.organization_id)
    ) then
      raise exception 'Every AWB must be active and booked before submission.';
    end if;

    new.submitted_at := now();
    new.picked_up_at := null;
    new.picked_up_by := null;
    new.received_at := null;
    new.assigned_driver_id := null;

    update public.shipments s
    set status = 'ready_for_pickup'
    from public.pickup_manifest_items i
    where i.manifest_id = old.id and s.id = i.shipment_id;

  elsif old.status = 'ready_for_pickup' and new.status = 'picked_up' then
    if not (select private.can_process_pickups()) then
      raise exception 'Only authorized operations staff can confirm pickup.';
    end if;
    if new.assigned_driver_id is not null and not exists (
      select 1 from public.profiles p
      where p.id = new.assigned_driver_id
        and p.organization_id = old.organization_id
        and p.role = 'driver'
        and p.status = 'active'
    ) then
      raise exception 'Select an active driver from this organization.';
    end if;

    new.picked_up_at := now();
    new.picked_up_by := (select auth.uid());
    new.received_at := null;

    update public.shipments s
    set status = 'picked_up',
        assigned_driver_id = coalesce(new.assigned_driver_id, s.assigned_driver_id)
    from public.pickup_manifest_items i
    where i.manifest_id = old.id
      and s.id = i.shipment_id
      and s.status = 'ready_for_pickup';

  elsif old.status in ('picked_up', 'partially_received')
    and new.status in ('partially_received', 'received') then
    if not (select private.can_receive_pickups()) then
      raise exception 'Only warehouse staff can receive pickup manifests.';
    end if;

    select count(*) into received_items
    from public.pickup_manifest_items i
    where i.manifest_id = old.id and i.received_at is not null;

    if new.status = 'partially_received'
      and not (received_items > 0 and received_items < total_items) then
      raise exception 'Manifest receipt progress does not match partially received status.';
    end if;
    if new.status = 'received' and received_items <> total_items then
      raise exception 'All AWBs must be received before closing the manifest.';
    end if;

    new.received_at := case when new.status = 'received' then now() else null end;
  else
    raise exception 'Invalid pickup manifest status transition.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_pickup_manifest_transition() from public;

create trigger pickup_manifests_guard_transition
before update on public.pickup_manifests
for each row execute function private.guard_pickup_manifest_transition();

create or replace function private.guard_pickup_manifest_item_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manifest_status public.pickup_manifest_status;
begin
  if new.manifest_id is distinct from old.manifest_id
    or new.shipment_id is distinct from old.shipment_id
    or new.added_by is distinct from old.added_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Manifest item identity fields cannot be changed.';
  end if;

  if old.received_at is not null then
    raise exception 'This AWB has already been received.';
  end if;
  if new.received_at is null
    or new.warehouse_location is null
    or char_length(btrim(new.warehouse_location)) not between 1 and 50 then
    raise exception 'Enter a warehouse bin or location.';
  end if;
  if not (select private.can_receive_pickups()) then
    raise exception 'Only warehouse staff can receive AWBs.';
  end if;

  select m.status into manifest_status
  from public.pickup_manifests m
  where m.id = old.manifest_id
  for update;

  if manifest_status not in ('picked_up', 'partially_received') then
    raise exception 'The pickup manifest must be picked up before warehouse receiving.';
  end if;

  new.received_at := now();
  new.received_by := (select auth.uid());
  new.warehouse_location := upper(btrim(new.warehouse_location));

  update public.shipments
  set status = 'at_warehouse',
      warehouse_location = new.warehouse_location,
      warehouse_received_at = new.received_at
  where id = old.shipment_id and status = 'picked_up' and deleted_at is null;

  if not found then
    raise exception 'AWB is not available for warehouse receiving.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_pickup_manifest_item_receipt() from public;

create trigger pickup_manifest_items_guard_receipt
before update on public.pickup_manifest_items
for each row execute function private.guard_pickup_manifest_item_receipt();

create or replace function private.sync_pickup_manifest_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  received_items integer;
begin
  select count(*), count(*) filter (where i.received_at is not null)
  into total_items, received_items
  from public.pickup_manifest_items i
  where i.manifest_id = new.manifest_id;

  update public.pickup_manifests
  set status = (
    case when received_items = total_items then 'received' else 'partially_received' end
  )::public.pickup_manifest_status
  where id = new.manifest_id;

  return new;
end;
$$;

revoke all on function private.sync_pickup_manifest_receipt() from public;

create trigger pickup_manifest_items_sync_receipt
after update of received_at on public.pickup_manifest_items
for each row
when (old.received_at is null and new.received_at is not null)
execute function private.sync_pickup_manifest_receipt();

create or replace function private.record_shipment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'shipment_booked', new.status,
      'Shipment booked and AWB generated.', new.created_by
    );
  elsif old.deleted_at is null and new.deleted_at is not null then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'shipment_archived', old.status, new.status,
      'AWB archived: ' || new.delete_reason, new.deleted_by
    );
  elsif old.status is distinct from new.status then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'status_changed', old.status, new.status,
      case new.status
        when 'ready_for_pickup' then 'AWB added to a submitted pickup manifest.'
        when 'picked_up' then 'Shipment picked up from shipper.'
        when 'at_warehouse' then 'Shipment received at warehouse · ' || coalesce(new.warehouse_location, 'Location pending')
        else null
      end,
      (select auth.uid())
    );
  end if;

  return new;
end;
$$;

revoke all on function private.record_shipment_event() from public;

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

create policy "authorized users can create pickup manifests"
on public.pickup_manifests
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and status = 'draft'
  and (
    (select private.can_manage_shipments())
    or (
      shipper_id = (select auth.uid())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'shipper' and p.status = 'active'
      )
    )
  )
);

create policy "authorized users can advance pickup manifests"
on public.pickup_manifests
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and ((select private.can_manage_shipments()) or created_by = (select auth.uid()))
)
with check (
  organization_id = (select private.current_organization_id())
  and ((select private.can_manage_shipments()) or created_by = (select auth.uid()))
);

create policy "authorized users can read pickup manifest items"
on public.pickup_manifest_items
for select
to authenticated
using ((select private.can_access_pickup_manifest(manifest_id)));

create policy "manifest creators can scan booked AWBs"
on public.pickup_manifest_items
for insert
to authenticated
with check (
  added_by = (select auth.uid())
  and exists (
    select 1
    from public.pickup_manifests m
    where m.id = manifest_id
      and m.organization_id = (select private.current_organization_id())
      and m.status = 'draft'
      and ((select private.can_manage_shipments()) or m.created_by = (select auth.uid()))
  )
  and exists (
    select 1
    from public.shipments s
    where s.id = shipment_id
      and s.organization_id = (select private.current_organization_id())
      and s.status = 'booked'
      and s.deleted_at is null
      and (
        (select private.can_manage_shipments())
        or s.created_by = (select auth.uid())
        or s.shipper_id = (select auth.uid())
      )
  )
);

create policy "manifest creators can remove draft AWBs"
on public.pickup_manifest_items
for delete
to authenticated
using (
  exists (
    select 1 from public.pickup_manifests m
    where m.id = manifest_id
      and m.organization_id = (select private.current_organization_id())
      and m.status = 'draft'
      and ((select private.can_manage_shipments()) or m.created_by = (select auth.uid()))
  )
);

create policy "warehouse staff can receive manifest AWBs"
on public.pickup_manifest_items
for update
to authenticated
using (
  (select private.can_receive_pickups())
  and exists (
    select 1 from public.pickup_manifests m
    where m.id = manifest_id
      and m.organization_id = (select private.current_organization_id())
  )
)
with check (
  (select private.can_receive_pickups())
  and exists (
    select 1 from public.pickup_manifests m
    where m.id = manifest_id
      and m.organization_id = (select private.current_organization_id())
  )
);

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
