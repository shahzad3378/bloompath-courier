-- BloomPath Courier V1
-- Convert RTS routes into shipper-specific return handovers.
-- Existing historical RTS records remain compatible.

alter table public.return_runs
add column if not exists shipper_id uuid
references public.profiles(id) on delete restrict;

create index if not exists return_runs_shipper_idx
on public.return_runs (
  organization_id,
  shipper_id,
  created_at desc
);


-- Backfill historical runs without firing the old workflow
-- transition guard. This is a one-time migration-only update.
alter table public.return_runs
disable trigger return_runs_guard_update;

update public.return_runs r
set shipper_id = source.shipper_id
from (
  select
    i.run_id,
    min(s.shipper_id::text)::uuid as shipper_id
  from public.return_run_items i
  join public.shipments s
    on s.id = i.shipment_id
  where s.shipper_id is not null
  group by i.run_id
  having count(distinct s.shipper_id) = 1
) source
where r.id = source.run_id
  and r.shipper_id is null;

alter table public.return_runs
enable trigger return_runs_guard_update;


-- New return handovers MUST have one active shipper.
-- route_name remains in the old schema for compatibility,
-- but is now generated automatically from the shipper name.
create or replace function private.guard_return_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shipper_record public.profiles%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception 'Only authorized staff can create return handovers.';
  end if;

  if new.organization_id <> (select private.current_organization_id()) then
    raise exception 'Invalid organization.';
  end if;

  if new.shipper_id is null then
    raise exception 'Select a shipper for this return handover.';
  end if;

  select *
  into shipper_record
  from public.profiles p
  where p.id = new.shipper_id
    and p.organization_id = new.organization_id
    and p.role = 'shipper'
    and p.status = 'active';

  if shipper_record.id is null then
    raise exception 'Selected shipper is not active.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.driver_id
      and p.organization_id = new.organization_id
      and p.role = 'driver'
      and p.status = 'active'
  ) then
    raise exception 'Selected return driver is not active.';
  end if;

  new.run_number :=
    'RTH-' ||
    lpad(
      nextval('public.return_run_number_seq')::text,
      6,
      '0'
    );

  -- Keep legacy route_name column populated without asking
  -- users to enter a route.
  new.route_name :=
    coalesce(
      nullif(btrim(shipper_record.full_name), ''),
      nullif(btrim(shipper_record.email), ''),
      'Shipper Return'
    );

  new.status := 'draft';
  new.created_by := (select auth.uid());
  new.created_at := now();

  return new;
end;
$$;


-- Enforce that every scanned AWB belongs to the selected shipper.
create or replace function private.guard_return_item_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.return_runs%rowtype;
  shipment_record public.shipments%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception 'Only authorized staff can scan return AWBs.';
  end if;

  select *
  into run_record
  from public.return_runs
  where id = new.run_id;

  select *
  into shipment_record
  from public.shipments
  where id = new.shipment_id
  for update;

  if run_record.id is null
    or run_record.status <> 'draft'
    or run_record.organization_id <>
       (select private.current_organization_id()) then
    raise exception 'Return handover is not open.';
  end if;

  if shipment_record.id is null
    or shipment_record.organization_id <> run_record.organization_id
    or shipment_record.deleted_at is not null then
    raise exception 'AWB is not available.';
  end if;

  -- New shipper-specific validation.
  if run_record.shipper_id is not null
    and shipment_record.shipper_id is distinct from run_record.shipper_id then
    raise exception
      'This AWB does not belong to the selected shipper.';
  end if;

  if shipment_record.status <> 'return_initiated'
    or shipment_record.warehouse_received_at is null
    or shipment_record.assigned_driver_id is not null then
    raise exception
      'AWB must be physically received at warehouse and ready for Return to Seller.';
  end if;

  if shipment_record.delivery_attempt_count = 3
    and shipment_record.fourth_attempt_authorized then
    raise exception
      'AWB has an authorized fourth delivery attempt and cannot enter Return to Seller.';
  end if;

  new.organization_id := run_record.organization_id;
  new.added_by := (select auth.uid());
  new.added_at := now();

  return new;
end;
$$;


-- Preserve existing return workflow while protecting shipper identity.
create or replace function private.guard_return_run_update()
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
    or new.shipper_id is distinct from old.shipper_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Return handover identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    raise exception 'No return workflow transition was requested.';
  end if;

  select
    count(*),
    count(*) filter (where completed_at is not null)
  into
    total_items,
    completed_items
  from public.return_run_items
  where run_id = old.id;

  if old.status = 'draft'
    and new.status = 'handed_over' then

    if not (select private.can_dispatch_shipments()) then
      raise exception 'Only authorized staff can hand over returns.';
    end if;

    if total_items = 0 then
      raise exception 'Add at least one return AWB before handover.';
    end if;

    if exists (
      select 1
      from public.return_run_items i
      join public.shipments s
        on s.id = i.shipment_id
      where i.run_id = old.id
        and (
          s.status <> 'return_initiated'
          or s.warehouse_received_at is null
          or s.assigned_driver_id is not null
          or (
            s.delivery_attempt_count = 3
            and s.fourth_attempt_authorized
          )
          or (
            old.shipper_id is not null
            and s.shipper_id is distinct from old.shipper_id
          )
        )
    ) then
      raise exception
        'Every return AWB must be warehouse-ready and belong to the selected shipper.';
    end if;

    new.handed_over_at := now();
    new.handed_over_by := (select auth.uid());
    new.completed_at := null;

    update public.shipments s
    set assigned_driver_id = old.driver_id
    from public.return_run_items i
    where i.run_id = old.id
      and s.id = i.shipment_id;

  elsif old.status = 'handed_over'
    and new.status = 'completed' then

    if total_items = 0
      or completed_items <> total_items then
      raise exception
        'Complete every seller return before closing the handover.';
    end if;

    new.completed_at := now();

  else
    raise exception 'Invalid return handover status transition.';
  end if;

  return new;
end;
$$;
