-- Receive warehouse AWBs by scan only and avoid no-op manifest status updates.

alter table public.pickup_manifest_items
  drop constraint if exists pickup_manifest_items_receipt_consistent;

alter table public.pickup_manifest_items
  add constraint pickup_manifest_items_receipt_consistent check (
    (received_at is null and received_by is null and warehouse_location is null)
    or (
      received_at is not null
      and received_by is not null
      and (warehouse_location is null or char_length(warehouse_location) between 1 and 50)
    )
  );

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
  if new.received_at is null then
    raise exception 'Scan a valid AWB for warehouse receiving.';
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
  new.warehouse_location := null;

  update public.shipments
  set status = 'at_warehouse',
      warehouse_location = null,
      warehouse_received_at = new.received_at
  where id = old.shipment_id
    and status = 'picked_up'
    and deleted_at is null;

  if not found then
    raise exception 'AWB is not available for warehouse receiving.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_pickup_manifest_item_receipt() from public;

create or replace function private.sync_pickup_manifest_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  received_items integer;
  target_status public.pickup_manifest_status;
begin
  select count(*), count(*) filter (where i.received_at is not null)
  into total_items, received_items
  from public.pickup_manifest_items i
  where i.manifest_id = new.manifest_id;

  target_status := case
    when received_items = total_items then 'received'::public.pickup_manifest_status
    else 'partially_received'::public.pickup_manifest_status
  end;

  update public.pickup_manifests
  set status = target_status
  where id = new.manifest_id
    and status is distinct from target_status;

  return new;
end;
$$;

revoke all on function private.sync_pickup_manifest_receipt() from public;

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
        when 'at_warehouse' then 'Shipment received at warehouse.'
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
