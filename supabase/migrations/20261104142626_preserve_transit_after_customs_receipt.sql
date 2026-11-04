-- A customs warehouse milestone already records the initial receipt. A later
-- generic receipt is duplicate until delivery/return movement opens a new stay.
-- Transit alone does not reopen that receipt. Raw events and physical custody
-- remain unchanged; only the customer-facing projection is repaired.
create or replace function private.effective_customer_tracking_status(target_shipment bigint, target_organization uuid)
returns text language sql stable set search_path = '' as $$
 select e.status from public.customer_tracking_events e
 where e.shipment_id=target_shipment and e.organization_id=target_organization
 and not (e.status='at_warehouse' and exists (
  select 1 from public.customer_tracking_events c
  where c.shipment_id=e.shipment_id and c.organization_id=e.organization_id
  and c.status='customs_clearance_completed_warehouse_scanned'
  and (c.created_at,c.id)<(e.created_at,e.id)
  and not exists (
   select 1 from public.customer_tracking_events m
   where m.shipment_id=e.shipment_id and m.organization_id=e.organization_id
   and m.status in ('out_for_delivery','undelivered','return_initiated','returned_to_shipper')
   and (m.created_at,m.id)>(c.created_at,c.id)
   and (m.created_at,m.id)<(e.created_at,e.id)
  )
 ))
 order by (e.status='delivered') desc,e.created_at desc,e.id desc limit 1;
$$;
revoke all on function private.effective_customer_tracking_status(bigint,uuid) from public,anon,authenticated;

create or replace function private.project_latest_customer_tracking_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.shipments s where s.id=new.shipment_id and s.organization_id=new.organization_id for update;
 update public.shipments s
 set customer_tracking_status=private.effective_customer_tracking_status(new.shipment_id,new.organization_id)
 where s.id=new.shipment_id and s.organization_id=new.organization_id;
 return null;
end;
$$;
revoke all on function private.project_latest_customer_tracking_status() from public,anon,authenticated;

update public.shipments s
set customer_tracking_status=private.effective_customer_tracking_status(s.id,s.organization_id)
where s.deleted_at is null and exists (
 select 1 from public.customer_tracking_events e where e.shipment_id=s.id
 and e.organization_id=s.organization_id and e.status='customs_clearance_completed_warehouse_scanned'
) and s.customer_tracking_status is distinct from private.effective_customer_tracking_status(s.id,s.organization_id);
