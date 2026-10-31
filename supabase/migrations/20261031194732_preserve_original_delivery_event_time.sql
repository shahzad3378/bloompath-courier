-- Preserve the actual scan time when customer delivery projects to operations.
create or replace function private.sync_terminal_tracking_to_shipment_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare actual_delivery_at timestamptz;
begin
  if new.customer_tracking_status is distinct from old.customer_tracking_status
    and new.customer_tracking_status in ('delivered','returned_to_shipper')
    and new.status not in ('delivered','returned_to_shipper') then
    if new.customer_tracking_status = 'delivered' then
      select min(e.created_at) into actual_delivery_at
      from public.customer_tracking_events e
      where e.shipment_id = new.id and e.organization_id = new.organization_id
        and e.status = 'delivered';
    end if;
    update public.shipments s
    set status = new.customer_tracking_status::public.shipment_status,
        delivered_at = case when new.customer_tracking_status='delivered'
          then coalesce(actual_delivery_at, s.delivered_at, now()) else s.delivered_at end
    where s.id = new.id and s.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

create or replace function private.record_customer_tracking_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.third_party_shipment_links l
    where l.shipment_id=new.shipment_id and l.handed_over_at is not null) then return new; end if;
  -- Projection of a confirmed delivery is not a second delivery scan.
  if new.new_status = 'delivered' and exists (
    select 1 from public.customer_tracking_events e
    where e.shipment_id=new.shipment_id and e.organization_id=new.organization_id
      and e.status='delivered'
  ) then return new; end if;
  if new.new_status is not null and new.event_type <> 'shipment_archived' then
    insert into public.customer_tracking_events(shipment_id,organization_id,status,created_at)
    values(new.shipment_id,new.organization_id,new.new_status::text,new.created_at);
  end if;
  return new;
end;
$$;

-- Correct only the two automatic projection events from the preceding repair
-- transaction. Use the existing original delivery scan, never an inferred date.
with originals as (
  select a.id, min(e.created_at) as occurred_at
  from public.customer_tracking_events a
  join public.customer_tracking_events e
    on e.shipment_id=a.shipment_id and e.organization_id=a.organization_id
    and e.status='delivered' and e.created_at<a.created_at
  where a.status='delivered' and a.source='automatic'
    and a.created_at='2026-10-31 19:36:47.579892+00'::timestamptz
  group by a.id
)
update public.customer_tracking_events a
set created_at=o.occurred_at from originals o where a.id=o.id;

update public.shipments s
set delivered_at=(
  select min(e.created_at) from public.customer_tracking_events e
  where e.shipment_id=s.id and e.organization_id=s.organization_id and e.status='delivered'
)
where s.status='delivered'
  and s.delivered_at='2026-10-31 19:36:47.579892+00'::timestamptz
  and exists(select 1 from public.customer_tracking_events e
    where e.shipment_id=s.id and e.organization_id=s.organization_id
      and e.status='delivered' and e.created_at<s.delivered_at);
