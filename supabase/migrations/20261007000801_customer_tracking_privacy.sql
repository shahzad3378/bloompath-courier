-- Customer-safe status and history, separate from confidential operational audit.
alter table public.shipments add column customer_tracking_status text
  check (customer_tracking_status in ('in_transit','out_for_delivery','delivered','undelivered'));
alter table public.third_party_status_updates drop constraint third_party_status_updates_status_check;
alter table public.third_party_status_updates add constraint third_party_status_updates_status_check
  check (status in ('handed_over','in_transit','out_for_delivery','delivered','undelivered','return_initiated','return_in_transit','returned_to_warehouse','returned_to_shipper'));

create table public.customer_tracking_events (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('booked','ready_for_pickup','picked_up','at_warehouse','in_transit','out_for_delivery','delivered','undelivered','return_initiated','returned_to_shipper','cancelled')),
  created_at timestamptz not null default now()
);
create index customer_tracking_events_shipment_time_idx on public.customer_tracking_events(shipment_id,created_at,id);
alter table public.customer_tracking_events enable row level security;
revoke all on public.customer_tracking_events from public,anon,authenticated;
grant select on public.customer_tracking_events to authenticated;
create policy "authorized users can read safe customer tracking"
on public.customer_tracking_events for select to authenticated using (
 organization_id = (select private.current_organization_id())
 and exists (select 1 from public.shipments s where s.id=customer_tracking_events.shipment_id and s.organization_id=customer_tracking_events.organization_id)
);
-- Existing raw audit records may contain arbitrary notes; customers never receive them.
alter policy "authorized users can read shipment events" on public.shipment_events using (
 organization_id = (select private.current_organization_id())
 and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role <> 'shipper' and p.status='active')
 and exists (select 1 from public.shipments s where s.id=shipment_events.shipment_id)
);

create or replace function private.customer_3pl_status(value text) returns text
language sql immutable set search_path='' as $$
 select case value when 'handed_over' then 'in_transit' when 'in_transit' then 'in_transit'
 when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
 else 'undelivered' end;
$$;
revoke all on function private.customer_3pl_status(text) from public,anon,authenticated;

create or replace function private.guard_third_party_status_update()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  shipment_record public.shipments%rowtype;
  link_record public.third_party_shipment_links%rowtype;
  next_attempt smallint;
  immediate_return boolean := false;
begin

  select *
  into shipment_record
  from public.shipments
  where id = new.shipment_id
    and organization_id = new.organization_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Shipment not found.';
  end if;


  if shipment_record.fulfillment_mode <> 'third_party' then
    raise exception 'Shipment is not assigned to a third-party carrier.';
  end if;


  select *
  into link_record
  from public.third_party_shipment_links
  where shipment_id = shipment_record.id
    and organization_id = shipment_record.organization_id;

  if not found then
    raise exception '3PL shipment link was not found.';
  end if;


  if link_record.carrier_id <> new.carrier_id then
    raise exception '3PL carrier does not match this shipment.';
  end if;


  new.organization_id := shipment_record.organization_id;
  new.updated_by := coalesce(new.updated_by, auth.uid());


  -- ========================================================
  -- HANDED OVER
  -- ========================================================

  if new.status = 'handed_over' then

    update public.third_party_shipment_links
    set
      partner_status = 'handed_over',
      handed_over_at = coalesce(handed_over_at, now()),
      last_status_at = now(),
      internal_notes = new.internal_notes,
      updated_at = now()
    where shipment_id = shipment_record.id;

    update public.shipments
    set
      status = 'out_for_delivery'::public.shipment_status,
      assigned_driver_id = null
    where id = shipment_record.id;

    return new;
  end if;


  -- ========================================================
  -- IN TRANSIT
  -- ========================================================

  if new.status in ('in_transit', 'out_for_delivery') then

    update public.third_party_shipment_links
    set
      partner_status = new.status,
      last_status_at = now(),
      internal_notes = new.internal_notes,
      updated_at = now()
    where shipment_id = shipment_record.id;

    update public.shipments
    set
      status = 'out_for_delivery'::public.shipment_status,
      assigned_driver_id = null
    where id = shipment_record.id;

    return new;
  end if;


  -- ========================================================
  -- DELIVERED
  -- ========================================================

  if new.status = 'delivered' then

    next_attempt :=
      coalesce(
        new.attempt_number,
        case
          when shipment_record.delivery_attempt_count = 0
          then 1
          else shipment_record.delivery_attempt_count
        end
      );

    update public.third_party_shipment_links
    set
      partner_status = 'delivered',
      last_status_at = now(),
      internal_notes = new.internal_notes,
      updated_at = now()
    where shipment_id = shipment_record.id;

    update public.shipments
    set
      status = 'delivered'::public.shipment_status,
      delivered_at = now(),

      delivery_attempt_count =
        greatest(
          delivery_attempt_count,
          next_attempt
        ),

      last_undelivered_reason = null,
      assigned_driver_id = null

    where id = shipment_record.id;

    return new;
  end if;


  -- ========================================================
  -- UNDELIVERED
  -- ========================================================

  if new.status = 'undelivered' then

    next_attempt :=
      coalesce(
        new.attempt_number,
        shipment_record.delivery_attempt_count + 1
      );


    if next_attempt < 1 or next_attempt > 3 then
      raise exception '3PL attempt number must be between 1 and 3.';
    end if;


    if next_attempt < shipment_record.delivery_attempt_count then
      raise exception 'Attempt number cannot be lower than current shipment attempt count.';
    end if;


    if new.undelivered_reason is null
      or new.undelivered_reason not in (

        'customer_unavailable',
        'customer_refused',
        'customer_cancelled',

        'wrong_address',
        'phone_unreachable',

        'reschedule_requested',
        'cash_not_ready',

        'restricted_access',
        'out_of_coverage',

        'address_closed',

        'no_response',

        'other'
      )
    then
      raise exception 'Select a valid undelivered reason.';
    end if;


    immediate_return :=
      new.undelivered_reason in (
        'customer_refused',
        'customer_cancelled'
      );


    update public.third_party_shipment_links
    set
      partner_status =
        case
          when immediate_return or next_attempt >= 3
          then 'return_initiated'
          else 'undelivered'
        end,

      last_status_at = now(),

      return_reason =
        case

          when new.undelivered_reason = 'customer_refused'
          then 'customer_refused'

          when new.undelivered_reason = 'customer_cancelled'
          then 'customer_cancelled'

          when next_attempt >= 3
          then 'attempts_exhausted'

          else return_reason

        end,

      internal_notes = new.internal_notes,
      updated_at = now()

    where shipment_id = shipment_record.id;


    update public.shipments
    set

      status =
        case

          when immediate_return
            or next_attempt >= 3

          then 'return_initiated'::public.shipment_status

          else 'undelivered'::public.shipment_status

        end,

      delivery_attempt_count = next_attempt,

      last_undelivered_reason =
        new.undelivered_reason,

      delivered_at = null,

      assigned_driver_id = null

    where id = shipment_record.id;


    return new;
  end if;


  -- ========================================================
  -- RETURN START
  -- ========================================================

  if new.status in (
    'return_initiated',
    'return_in_transit'
  ) then

    if new.return_reason is null
      or new.return_reason not in (

        'attempts_exhausted',
        'customer_cancelled',
        'customer_refused',

        'no_response',
        'wrong_address',

        'out_of_coverage',
        'damaged',

        'carrier_issue',
        'other'
      )
    then
      raise exception 'Select a valid return reason.';
    end if;


    update public.third_party_shipment_links
    set
      partner_status = new.status,

      return_reason = new.return_reason,

      last_status_at = now(),

      internal_notes = new.internal_notes,

      updated_at = now()

    where shipment_id = shipment_record.id;


    update public.shipments
    set
      status = 'return_initiated'::public.shipment_status,
      assigned_driver_id = null

    where id = shipment_record.id;


    return new;
  end if;


  -- ========================================================
  -- RETURNED TO OUR WAREHOUSE
  -- ========================================================

  if new.status = 'returned_to_warehouse' then

    if coalesce(
      new.return_reason,
      link_record.return_reason
    ) is null
    then
      raise exception 'Return reason is required.';
    end if;


    update public.third_party_shipment_links
    set

      partner_status = 'returned_to_warehouse',

      return_reason =
        coalesce(
          new.return_reason,
          return_reason
        ),

      last_status_at = now(),

      internal_notes = new.internal_notes,

      updated_at = now()

    where shipment_id = shipment_record.id;


    update public.shipments
    set
      status = 'return_initiated'::public.shipment_status,
      assigned_driver_id = null

    where id = shipment_record.id;


    return new;
  end if;


  -- ========================================================
  -- FINAL RETURN TO SHIPPER
  -- ========================================================

  if new.status = 'returned_to_shipper' then

    update public.third_party_shipment_links
    set

      partner_status = 'returned_to_shipper',

      return_reason =
        coalesce(
          new.return_reason,
          return_reason
        ),

      last_status_at = now(),

      internal_notes = new.internal_notes,

      updated_at = now()

    where shipment_id = shipment_record.id;


    update public.shipments
    set
      status = 'returned_to_shipper'::public.shipment_status,
      assigned_driver_id = null

    where id = shipment_record.id;


    return new;
  end if;


  return new;

end;
$$;



create or replace function private.record_customer_tracking_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- 3PL handover and all later updates are recorded by the dedicated status trigger below.
 if exists (select 1 from public.third_party_shipment_links l where l.shipment_id=new.shipment_id and l.handed_over_at is not null) then return new; end if;
 if new.new_status is not null and new.event_type <> 'shipment_archived' then
 insert into public.customer_tracking_events(shipment_id,organization_id,status,created_at)
 values(new.shipment_id,new.organization_id,new.new_status::text,new.created_at);
 end if;
 return new;
end; $$;
revoke all on function private.record_customer_tracking_event() from public,anon,authenticated;
create trigger customer_tracking_from_shipment_event after insert on public.shipment_events
for each row execute function private.record_customer_tracking_event();

create or replace function private.record_customer_3pl_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare safe_status text;
begin
 safe_status := private.customer_3pl_status(new.status);
 update public.shipments set customer_tracking_status=safe_status
 where id=new.shipment_id and organization_id=new.organization_id;
 insert into public.customer_tracking_events(shipment_id,organization_id,status,created_at)
 values(new.shipment_id,new.organization_id,safe_status,new.created_at);
 return new;
end; $$;
revoke all on function private.record_customer_3pl_event() from public,anon,authenticated;
create trigger customer_tracking_from_3pl_update after insert on public.third_party_status_updates
for each row execute function private.record_customer_3pl_event();

-- Historical projection copies only allowlisted status codes and timestamps, never text notes.
insert into public.customer_tracking_events(shipment_id,organization_id,status,created_at)
select e.shipment_id,e.organization_id,e.new_status::text,e.created_at
from public.shipment_events e
where e.new_status is not null and e.event_type <> 'shipment_archived'
and not exists (select 1 from public.third_party_shipment_links l where l.shipment_id=e.shipment_id
 and l.handed_over_at is not null and e.created_at >= l.handed_over_at);
insert into public.customer_tracking_events(shipment_id,organization_id,status,created_at)
select shipment_id,organization_id,private.customer_3pl_status(status),created_at
from public.third_party_status_updates;
update public.shipments s set customer_tracking_status=case
 when s.status='delivered' then 'delivered'
 when s.status in ('undelivered','return_initiated','returned_to_shipper','cancelled') then 'undelivered'
 else private.customer_3pl_status(coalesce((select u.status from public.third_party_status_updates u
 where u.shipment_id=s.id order by u.created_at desc,u.id desc limit 1),l.partner_status)) end
from public.third_party_shipment_links l where l.shipment_id=s.id and l.organization_id=s.organization_id
and l.handed_over_at is not null;
