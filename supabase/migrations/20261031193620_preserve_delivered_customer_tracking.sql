-- A late carrier scan must not reopen a delivered shipment. Keep every raw
-- event for audit; only the customer-visible status projection is terminal.
create or replace function private.project_latest_customer_tracking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_status text;
begin
  -- Serialize status projection with concurrent inserts for this parcel.
  perform 1 from public.shipments s
  where s.id = new.shipment_id and s.organization_id = new.organization_id
  for update;

  select e.status into latest_status
  from public.customer_tracking_events e
  where e.shipment_id = new.shipment_id
    and e.organization_id = new.organization_id
  order by (e.status = 'delivered') desc, e.created_at desc, e.id desc
  limit 1;

  update public.shipments s
  set customer_tracking_status = latest_status
  where s.id = new.shipment_id and s.organization_id = new.organization_id;
  return null;
end;
$$;

-- Repair the same projection on existing delivered parcels, without changing
-- operational custody, finance, scan timestamps or the original audit events.
update public.shipments s
set customer_tracking_status = 'delivered'
where s.deleted_at is null
  and s.customer_tracking_status is distinct from 'delivered'
  and exists (
    select 1 from public.customer_tracking_events e
    where e.shipment_id = s.id and e.organization_id = s.organization_id
      and e.status = 'delivered'
  );
