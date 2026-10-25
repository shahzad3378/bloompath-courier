-- Prevent manual tracking scans from booking a progressed shipment again,
-- duplicating final delivery, or overwriting any event after delivery.
create or replace function private.guard_manual_tracking_event_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  shipment_status public.shipment_status;
begin
  if new.source = 'manual' then
    select s.status
      into shipment_status
      from public.shipments s
      where s.id = new.shipment_id
        and s.organization_id = new.organization_id
        and s.deleted_at is null
      for update;

    if shipment_status is null then
      raise exception 'The active shipment could not be found.';
    end if;

    if shipment_status = 'delivered' or exists (
      select 1 from public.customer_tracking_events e
      where e.shipment_id = new.shipment_id
        and e.organization_id = new.organization_id
        and e.status = 'delivered'
    ) then
      raise exception 'This shipment is already delivered; further tracking updates are blocked.';
    end if;

    if new.status = 'booked' and (
      shipment_status <> 'booked'
      or exists (
        select 1 from public.customer_tracking_events e
        where e.shipment_id = new.shipment_id
          and e.organization_id = new.organization_id
          and e.status <> 'booked'
      )
      or exists (
        select 1 from public.customer_tracking_events e
        where e.shipment_id = new.shipment_id
          and e.organization_id = new.organization_id
          and e.status = 'booked'
      )
    ) then
      raise exception 'This shipment has already been booked or moved forward; it cannot be booked again.';
    end if;

    if new.status = 'at_warehouse' and exists (
      select 1 from public.customer_tracking_events e
      where e.shipment_id = new.shipment_id
        and e.organization_id = new.organization_id
        and e.status = 'at_warehouse'
    ) then
      raise exception 'This shipment has already been received in the warehouse.';
    end if;
  end if;

  if new.source = 'manual'
    and new.status = 'customs_clearance_completed_warehouse_scanned'
    and not exists (
      select 1
      from public.customer_tracking_events e
      where e.shipment_id = new.shipment_id
        and e.organization_id = new.organization_id
        and e.status = 'arrived_at_destination_airport_customs_started'
        and e.created_at <= new.created_at
    )
  then
    raise exception 'Record airport arrival and customs clearance started first, with an earlier date and time.';
  end if;

  return new;
end;
$$;
