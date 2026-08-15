-- Customer refusal / exhausted attempts return workflow.
-- customer_refused on any attempt immediately enters return flow.
-- Return shipments must physically come back to warehouse before RTS processing.

-- Allow warehouse receipt records for final-return attempts as well.
alter table public.warehouse_reattempt_receipts
  drop constraint if exists warehouse_reattempt_receipts_attempt_range;

alter table public.warehouse_reattempt_receipts
  add constraint warehouse_reattempt_receipts_attempt_range
  check (attempt_number between 1 and 4);


-- Delivery result:
-- customer_refused = immediate return regardless of attempt number.
create or replace function private.guard_delivery_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.dispatch_run_items%rowtype;
  run_record public.dispatch_runs%rowtype;
  shipment_record public.shipments%rowtype;
  expected_prefix text;
begin
  select * into item_record
  from public.dispatch_run_items
  where id = new.run_item_id
  for update;

  select * into run_record
  from public.dispatch_runs
  where id = item_record.run_id
  for update;

  select * into shipment_record
  from public.shipments
  where id = item_record.shipment_id
  for update;

  if run_record.id is null
    or run_record.status <> 'handed_over'
    or run_record.driver_id <> (select auth.uid()) then
    raise exception 'This delivery is not assigned to you.';
  end if;

  if item_record.completed_at is not null then
    raise exception 'This delivery has already been completed.';
  end if;

  if shipment_record.status <> 'out_for_delivery'
    or shipment_record.assigned_driver_id <> (select auth.uid()) then
    raise exception 'AWB is not out for delivery with this driver.';
  end if;

  new.organization_id := run_record.organization_id;
  new.shipment_id := shipment_record.id;
  new.performed_by := (select auth.uid());
  new.attempt_number := shipment_record.delivery_attempt_count + 1;

  if new.attempt_number > 3
    and not (
      new.attempt_number = 4
      and shipment_record.fourth_attempt_authorized
      and shipment_record.last_undelivered_reason <> 'customer_refused'
    ) then
    raise exception 'A fourth attempt requires shipper authorization.';
  end if;

  expected_prefix :=
    run_record.organization_id::text || '/' ||
    (select auth.uid())::text || '/';

  if new.proof_path not like (expected_prefix || '%')
    or char_length(new.proof_path) > 500 then
    raise exception 'Invalid proof file path.';
  end if;

  if new.outcome = 'undelivered'
    and new.undelivered_reason not in (
      'customer_unavailable',
      'customer_refused',
      'wrong_address',
      'phone_unreachable',
      'reschedule_requested',
      'cash_not_ready',
      'restricted_access',
      'other'
    ) then
    raise exception 'Select a valid undelivered reason.';
  end if;

  new.notes := nullif(btrim(new.notes), '');

  update public.dispatch_run_items
  set outcome = new.outcome,
      completed_at = now()
  where id = item_record.id;

  if new.outcome = 'delivered' then

    update public.shipments
    set status = 'delivered',
        delivered_at = now(),
        delivery_attempt_count = new.attempt_number,
        last_undelivered_reason = null
    where id = shipment_record.id;

  else

    update public.shipments
    set status =
          case
            when new.undelivered_reason = 'customer_refused'
              then 'return_initiated'::public.shipment_status
            when new.attempt_number >= 3
              then 'return_initiated'::public.shipment_status
            else 'undelivered'::public.shipment_status
          end,
        delivered_at = null,
        delivery_attempt_count = new.attempt_number,
        last_undelivered_reason = new.undelivered_reason,

        fourth_attempt_authorized =
          case
            when new.undelivered_reason = 'customer_refused'
              or new.attempt_number >= 4
            then false
            else fourth_attempt_authorized
          end,

        fourth_attempt_authorized_at =
          case
            when new.undelivered_reason = 'customer_refused'
              or new.attempt_number >= 4
            then null
            else fourth_attempt_authorized_at
          end,

        fourth_attempt_authorized_by =
          case
            when new.undelivered_reason = 'customer_refused'
              or new.attempt_number >= 4
            then null
            else fourth_attempt_authorized_by
          end

    where id = shipment_record.id;

  end if;

  return new;
end;
$$;

revoke all on function private.guard_delivery_attempt() from public;


-- Refused shipments can never receive fourth-attempt authorization.
create or replace function private.guard_fourth_attempt_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fourth_attempt_authorized is distinct from old.fourth_attempt_authorized
    or new.fourth_attempt_authorized_at is distinct from old.fourth_attempt_authorized_at
    or new.fourth_attempt_authorized_by is distinct from old.fourth_attempt_authorized_by then

    if old.fourth_attempt_authorized and not new.fourth_attempt_authorized then
      if new.delivery_attempt_count <> 4
        or new.status <> 'return_initiated' then
        raise exception 'Fourth-attempt authorization cannot be removed.';
      end if;
      return new;
    end if;

    if (to_jsonb(new) - array[
      'fourth_attempt_authorized',
      'fourth_attempt_authorized_at',
      'fourth_attempt_authorized_by',
      'updated_at'
    ]) is distinct from
       (to_jsonb(old) - array[
      'fourth_attempt_authorized',
      'fourth_attempt_authorized_at',
      'fourth_attempt_authorized_by',
      'updated_at'
    ]) then
      raise exception 'Only fourth-attempt authorization may be changed.';
    end if;

    if not new.fourth_attempt_authorized
      or old.fourth_attempt_authorized
      or old.status <> 'return_initiated'
      or old.delivery_attempt_count <> 3
      or old.last_undelivered_reason = 'customer_refused' then
      raise exception 'This AWB is not eligible for a fourth attempt.';
    end if;

    if not (
      (select private.can_manage_shipments())
      or old.shipper_id = (select auth.uid())
      or (
        old.shipper_id is null
        and old.created_by = (select auth.uid())
      )
    ) then
      raise exception 'You cannot authorize this shipment.';
    end if;

    new.fourth_attempt_authorized := true;
    new.fourth_attempt_authorized_at := now();
    new.fourth_attempt_authorized_by := (select auth.uid());
  end if;

  return new;
end;
$$;

revoke all on function private.guard_fourth_attempt_authorization() from public;


-- Warehouse receives BOTH:
-- 1. normal attempts 1-2 for reattempt
-- 2. customer refused / exhausted attempts for RTS
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
    or shipment_record.organization_id <>
       (select private.current_organization_id())
    or shipment_record.deleted_at is not null then
    raise exception 'AWB is not available for warehouse return receiving.';
  end if;

  if not (
    (
      shipment_record.status = 'undelivered'
      and shipment_record.delivery_attempt_count between 1 and 2
    )
    or
    (
      shipment_record.status = 'return_initiated'
      and shipment_record.delivery_attempt_count between 1 and 4
    )
  ) then
    raise exception 'AWB is not pending a warehouse return.';
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
  set status =
        case
          when shipment_record.status = 'return_initiated'
            then 'return_initiated'::public.shipment_status
          else 'at_warehouse'::public.shipment_status
        end,
      assigned_driver_id = null,
      warehouse_location = null,
      warehouse_received_at = new.received_at
  where id = shipment_record.id;

  return new;
end;
$$;

revoke all on function private.guard_warehouse_reattempt_receipt() from public;


-- Fourth attempt can only be dispatched after physical warehouse receipt.
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

  select * into run_record
  from public.dispatch_runs
  where id = new.run_id;

  select * into shipment_record
  from public.shipments
  where id = new.shipment_id;

  if run_record.id is null
    or run_record.status <> 'draft'
    or run_record.organization_id <>
       (select private.current_organization_id()) then
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
      and shipment_record.last_undelivered_reason <> 'customer_refused'
      and shipment_record.warehouse_received_at is not null
      and shipment_record.assigned_driver_id is null
    )
  ) then
    raise exception 'AWB must be physically received at warehouse before dispatch.';
  end if;

  new.added_by := (select auth.uid());

  return new;
end;
$$;

revoke all on function private.guard_dispatch_item_insert() from public;
