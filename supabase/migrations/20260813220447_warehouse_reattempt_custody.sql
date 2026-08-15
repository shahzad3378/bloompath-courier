-- Preserve physical chain of custody for undelivered AWBs before reattempt dispatch.

create table public.warehouse_reattempt_receipts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  attempt_number smallint not null,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  received_by uuid not null references public.profiles(id) on delete restrict,
  received_at timestamptz not null default now(),
  constraint warehouse_reattempt_receipts_attempt_range check (attempt_number between 1 and 2),
  constraint warehouse_reattempt_receipts_shipment_attempt_key unique (shipment_id, attempt_number)
);

create index warehouse_reattempt_receipts_organization_received_idx
  on public.warehouse_reattempt_receipts (organization_id, received_at desc, id desc);
create index warehouse_reattempt_receipts_driver_id_idx
  on public.warehouse_reattempt_receipts (driver_id);
create index warehouse_reattempt_receipts_received_by_idx
  on public.warehouse_reattempt_receipts (received_by);

alter table public.warehouse_reattempt_receipts enable row level security;
revoke all on public.warehouse_reattempt_receipts from anon, authenticated;
revoke all on sequence public.warehouse_reattempt_receipts_id_seq from public, anon, authenticated;
grant select, insert on public.warehouse_reattempt_receipts to authenticated;
grant usage on sequence public.warehouse_reattempt_receipts_id_seq to authenticated;

create or replace function private.guard_warehouse_reattempt_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shipment_record public.shipments%rowtype;
begin
  if not (select private.can_receive_pickups()) then
    raise exception 'Only warehouse staff can receive driver returns.';
  end if;

  select * into shipment_record
  from public.shipments
  where id = new.shipment_id
  for update;

  if shipment_record.id is null
    or shipment_record.organization_id <> (select private.current_organization_id())
    or shipment_record.deleted_at is not null then
    raise exception 'AWB is not available for warehouse return receiving.';
  end if;

  if shipment_record.status <> 'undelivered'
    or shipment_record.delivery_attempt_count not between 1 and 2 then
    raise exception 'AWB is not pending an undelivered warehouse return.';
  end if;

  if shipment_record.assigned_driver_id is null then
    raise exception 'AWB has no returning driver assigned.';
  end if;

  new.organization_id := shipment_record.organization_id;
  new.attempt_number := shipment_record.delivery_attempt_count;
  new.driver_id := shipment_record.assigned_driver_id;
  new.received_by := (select auth.uid());
  new.received_at := now();

  update public.shipments
  set status = 'at_warehouse',
      assigned_driver_id = null,
      warehouse_location = null,
      warehouse_received_at = new.received_at
  where id = shipment_record.id;

  return new;
end;
$$;

revoke all on function private.guard_warehouse_reattempt_receipt() from public;

create trigger warehouse_reattempt_receipts_guard_insert
before insert on public.warehouse_reattempt_receipts
for each row execute function private.guard_warehouse_reattempt_receipt();

create policy "authorized users can read warehouse reattempt receipts"
on public.warehouse_reattempt_receipts
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or driver_id = (select auth.uid())
    or exists (
      select 1
      from public.shipments s
      where s.id = shipment_id
        and (s.shipper_id = (select auth.uid())
          or (s.shipper_id is null and s.created_by = (select auth.uid())))
    )
  )
);

create policy "warehouse staff can receive undelivered returns"
on public.warehouse_reattempt_receipts
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and received_by = (select auth.uid())
  and (select private.can_receive_pickups())
);

-- A driver-return AWB becomes dispatchable only after the receipt trigger moves it
-- back to at_warehouse. This closes the direct undelivered-to-dispatch shortcut.
create or replace function private.guard_dispatch_item_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.dispatch_runs%rowtype;
  shipment_record public.shipments%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception 'Only dispatch staff can scan route AWBs.';
  end if;

  select * into run_record from public.dispatch_runs where id = new.run_id;
  select * into shipment_record from public.shipments where id = new.shipment_id;

  if run_record.id is null
    or run_record.status <> 'draft'
    or run_record.organization_id <> (select private.current_organization_id()) then
    raise exception 'Dispatch route is not open.';
  end if;

  if shipment_record.id is null
    or shipment_record.organization_id <> run_record.organization_id
    or shipment_record.deleted_at is not null then
    raise exception 'AWB is not available.';
  end if;

  if not (
    shipment_record.status = 'at_warehouse'
    or (
      shipment_record.status = 'return_initiated'
      and shipment_record.delivery_attempt_count = 3
      and shipment_record.fourth_attempt_authorized
    )
  ) then
    raise exception 'AWB must be physically received at warehouse before dispatch.';
  end if;

  new.added_by := (select auth.uid());
  return new;
end;
$$;

revoke all on function private.guard_dispatch_item_insert() from public;

create or replace function private.guard_dispatch_run_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  completed_items integer;
begin
  if new.organization_id is distinct from old.organization_id
    or new.run_number is distinct from old.run_number
    or new.route_name is distinct from old.route_name
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Dispatch route identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    raise exception 'No dispatch workflow transition was requested.';
  end if;

  if not (select private.can_dispatch_shipments())
    and old.driver_id <> (select auth.uid()) then
    raise exception 'You cannot update this dispatch route.';
  end if;

  select count(*), count(*) filter (where i.completed_at is not null)
  into total_items, completed_items
  from public.dispatch_run_items i
  where i.run_id = old.id;

  if old.status = 'draft' and new.status = 'handed_over' then
    if not (select private.can_dispatch_shipments()) then
      raise exception 'Only dispatch staff can hand over routes.';
    end if;
    if total_items = 0 then
      raise exception 'Add at least one AWB before driver handover.';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = old.driver_id
        and p.organization_id = old.organization_id
        and p.role = 'driver'
        and p.status = 'active'
    ) then
      raise exception 'The assigned driver is not active.';
    end if;
    if exists (
      select 1
      from public.dispatch_run_items i
      join public.shipments s on s.id = i.shipment_id
      where i.run_id = old.id
        and (
          s.deleted_at is not null
          or s.organization_id <> old.organization_id
          or not (
            s.status = 'at_warehouse'
            or (
              s.status = 'return_initiated'
              and s.delivery_attempt_count = 3
              and s.fourth_attempt_authorized
            )
          )
        )
    ) then
      raise exception 'Every AWB must be physically received at warehouse before handover.';
    end if;

    new.handed_over_at := now();
    new.handed_over_by := (select auth.uid());
    new.completed_at := null;

    update public.shipments s
    set status = 'out_for_delivery', assigned_driver_id = old.driver_id
    from public.dispatch_run_items i
    where i.run_id = old.id and s.id = i.shipment_id;
  elsif old.status = 'handed_over' and new.status = 'completed' then
    if total_items = 0 or completed_items <> total_items then
      raise exception 'Complete every delivery before closing the route.';
    end if;
    new.completed_at := now();
  else
    raise exception 'Invalid dispatch route status transition.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_dispatch_run_transition() from public;

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
        when 'at_warehouse' then case
          when old.status = 'undelivered'
            then 'Undelivered AWB returned to warehouse · Attempt ' || new.delivery_attempt_count
          else 'Shipment received at warehouse.'
        end
        when 'out_for_delivery' then 'Shipment handed over to delivery driver.'
        when 'delivered' then 'Shipment delivered with proof · Attempt ' || new.delivery_attempt_count
        when 'undelivered' then 'Undelivered · ' || replace(coalesce(new.last_undelivered_reason, 'reason pending'), '_', ' ') || ' · Attempt ' || new.delivery_attempt_count
        when 'return_initiated' then 'Delivery attempts exhausted; return initiated · Attempt ' || new.delivery_attempt_count
        else null
      end,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function private.record_shipment_event() from public;
