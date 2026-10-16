-- Let warehouse staff add customer-visible tracking events with an
-- explicitly selected occurrence time, while retaining who entered each one.
alter table public.customer_tracking_events
  add column source text not null default 'automatic'
    check (source in ('automatic', 'manual')),
  add column recorded_by uuid references public.profiles(id) on delete set null;

alter table public.shipments
  drop constraint if exists shipments_customer_tracking_status_check;

alter table public.shipments
  add constraint shipments_customer_tracking_status_check
  check (
    customer_tracking_status is null
    or customer_tracking_status in (
      'booked', 'ready_for_pickup', 'picked_up', 'at_warehouse', 'in_transit',
      'out_for_delivery', 'delivered', 'undelivered', 'return_initiated',
      'returned_to_shipper', 'cancelled',
      'arrived_at_destination_airport_customs_started',
      'customs_clearance_completed_warehouse_scanned'
    )
  );

create policy "warehouse staff can record manual customer tracking updates"
on public.customer_tracking_events
for insert
to authenticated
with check (
  source = 'manual'
  and recorded_by = (select auth.uid())
  and status in (
    'booked',
    'ready_for_pickup',
    'picked_up',
    'at_warehouse',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'undelivered',
    'arrived_at_destination_airport_customs_started',
    'customs_clearance_completed_warehouse_scanned',
    'return_initiated',
    'returned_to_shipper',
    'cancelled'
  )
  and organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = customer_tracking_events.organization_id
      and p.status = 'active'
      and p.role in ('super_admin', 'operations_admin', 'warehouse_staff')
  )
  and exists (
    select 1
    from public.shipments s
    where s.id = customer_tracking_events.shipment_id
      and s.organization_id = customer_tracking_events.organization_id
      and s.deleted_at is null
  )
);

create or replace function private.guard_manual_tracking_event_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

revoke all on function private.guard_manual_tracking_event_order() from public, anon, authenticated;

create trigger guard_manual_tracking_event_order
before insert on public.customer_tracking_events
for each row
execute function private.guard_manual_tracking_event_order();

-- Keep the shipment's customer-facing status aligned with the latest event by
-- occurrence time. A backdated correction remains in the timeline but cannot
-- replace a newer status in the tracking header.
create or replace function private.project_latest_customer_tracking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_status text;
  projected_status text;
begin
  select e.status
  into latest_status
  from public.customer_tracking_events e
  where e.shipment_id = new.shipment_id
    and e.organization_id = new.organization_id
  order by e.created_at desc, e.id desc
  limit 1;

  projected_status := latest_status;

  update public.shipments s
  set customer_tracking_status = projected_status
  where s.id = new.shipment_id
    and s.organization_id = new.organization_id;

  return null;
end;
$$;

revoke all on function private.project_latest_customer_tracking_status() from public, anon, authenticated;

create trigger project_latest_customer_tracking_status
after insert on public.customer_tracking_events
for each row
execute function private.project_latest_customer_tracking_status();
