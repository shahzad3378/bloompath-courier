-- Correct proof-path prefix validation precedence in the delivery-attempt trigger.

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
    and not (new.attempt_number = 4 and shipment_record.fourth_attempt_authorized) then
    raise exception 'A fourth attempt requires shipper authorization.';
  end if;

  expected_prefix := run_record.organization_id::text || '/' || (select auth.uid())::text || '/';
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
    set status = case
          when new.attempt_number >= 3 then 'return_initiated'::public.shipment_status
          else 'undelivered'::public.shipment_status
        end,
        delivered_at = null,
        delivery_attempt_count = new.attempt_number,
        last_undelivered_reason = new.undelivered_reason,
        fourth_attempt_authorized = case
          when new.attempt_number >= 4 then false
          else fourth_attempt_authorized
        end,
        fourth_attempt_authorized_at = case
          when new.attempt_number >= 4 then null
          else fourth_attempt_authorized_at
        end,
        fourth_attempt_authorized_by = case
          when new.attempt_number >= 4 then null
          else fourth_attempt_authorized_by
        end
    where id = shipment_record.id;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_delivery_attempt() from public;
