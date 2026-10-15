-- Add customer-visible customs milestones for international AWBs.
alter table public.shipments
  drop constraint if exists shipments_customer_tracking_status_check;

alter table public.shipments
  add constraint shipments_customer_tracking_status_check
  check (
    customer_tracking_status is null
    or customer_tracking_status in (
      'in_transit',
      'out_for_delivery',
      'delivered',
      'undelivered',
      'arrived_at_destination_airport_customs_started',
      'customs_clearance_completed_warehouse_scanned'
    )
  );

alter table public.customer_tracking_events
  drop constraint if exists customer_tracking_events_status_check;

alter table public.customer_tracking_events
  add constraint customer_tracking_events_status_check
  check (
    status in (
      'booked',
      'ready_for_pickup',
      'picked_up',
      'at_warehouse',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'undelivered',
      'return_initiated',
      'returned_to_shipper',
      'cancelled',
      'arrived_at_destination_airport_customs_started',
      'customs_clearance_completed_warehouse_scanned'
    )
  );

grant insert on public.customer_tracking_events to authenticated;

create policy "internal users can record international tracking milestones"
on public.customer_tracking_events
for insert
to authenticated
with check (
  status in (
    'arrived_at_destination_airport_customs_started',
    'customs_clearance_completed_warehouse_scanned'
  )
  and organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = customer_tracking_events.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'warehouse_staff',
        'dispatcher',
        'finance_staff',
        'customer_service'
      )
  )
);

create unique index customer_tracking_international_milestone_once_idx
on public.customer_tracking_events (shipment_id, status)
where status in (
  'arrived_at_destination_airport_customs_started',
  'customs_clearance_completed_warehouse_scanned'
);

create or replace function private.guard_international_tracking_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shipment_record public.shipments%rowtype;
begin
  if new.status not in (
    'arrived_at_destination_airport_customs_started',
    'customs_clearance_completed_warehouse_scanned'
  ) then
    return new;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = new.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'warehouse_staff',
        'dispatcher',
        'finance_staff',
        'customer_service'
      )
  ) then
    raise exception 'Only active internal users can record international tracking milestones.';
  end if;

  select *
  into shipment_record
  from public.shipments s
  where s.id = new.shipment_id
    and s.organization_id = new.organization_id
    and s.deleted_at is null
  for update;

  if not found
    or shipment_record.sender_country_code is null
    or shipment_record.consignee_country_code is null
    or shipment_record.sender_country_code = shipment_record.consignee_country_code
  then
    raise exception 'Tracking milestones can only be recorded for active international shipments.';
  end if;

  if new.status = 'customs_clearance_completed_warehouse_scanned'
    and not exists (
      select 1
      from public.customer_tracking_events e
      where e.shipment_id = new.shipment_id
        and e.organization_id = new.organization_id
        and e.status = 'arrived_at_destination_airport_customs_started'
    )
  then
    raise exception 'Record airport arrival and customs clearance started first.';
  end if;

  update public.shipments
  set customer_tracking_status = new.status
  where id = new.shipment_id
    and organization_id = new.organization_id;

  return new;
end;
$$;

revoke all on function private.guard_international_tracking_milestone() from public, anon, authenticated;

create trigger guard_international_tracking_milestone
before insert on public.customer_tracking_events
for each row
execute function private.guard_international_tracking_milestone();
