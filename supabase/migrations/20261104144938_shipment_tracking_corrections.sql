-- Correct an existing tracking scan atomically; immutable Activity Log keeps
-- before/after values and the actual save time. Never bypass finance custody.
create or replace function public.correct_shipment_tracking_event(
 p_shipment_id bigint,p_event_id bigint,p_expected_updated_at timestamptz,
 p_expected_event_at timestamptz,p_expected_status text,p_status text,
 p_local_time timestamp without time zone,p_timezone text,p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
 actor public.profiles%rowtype;
 parcel public.shipments%rowtype;
 scan public.customer_tracking_events%rowtype;
 corrected_at timestamptz;
 effective_status text;
begin
 select * into actor from public.profiles p where p.id=auth.uid() and p.status='active';
 if actor.id is null or actor.organization_id is null or actor.role not in ('super_admin','operations_admin') then
  raise exception 'Only tenant administrators can correct tracking scans.';
 end if;
 select * into parcel from public.shipments s where s.id=p_shipment_id and s.organization_id=actor.organization_id and s.deleted_at is null for update;
 if not found then raise exception 'Shipment is unavailable.'; end if;
 if parcel.updated_at is distinct from p_expected_updated_at then raise exception 'Shipment changed. Reload before correcting it.'; end if;
 select * into scan from public.customer_tracking_events e where e.id=p_event_id and e.shipment_id=parcel.id and e.organization_id=actor.organization_id for update;
 if not found then raise exception 'Tracking scan is unavailable.';end if;
 if scan.created_at is distinct from p_expected_event_at or scan.status is distinct from p_expected_status then raise exception 'Tracking scan changed. Reload before correcting it.';end if;
 if p_status is null or p_status not in ('booked','ready_for_pickup','picked_up','at_warehouse','in_transit','out_for_delivery','delivered','undelivered','return_initiated','returned_to_shipper','cancelled','arrived_at_destination_airport_customs_started','customs_clearance_completed_warehouse_scanned') then raise exception 'Choose a valid tracking status.';end if;
 if p_timezone is null or p_timezone not in ('America/Toronto','Asia/Dubai','UTC') then raise exception 'Choose a supported timezone.';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then raise exception 'Add a correction reason (5–500 characters).';end if;
 corrected_at:=p_local_time at time zone p_timezone;
 if corrected_at is null or corrected_at<parcel.booked_at or corrected_at>now()+interval '5 minutes' then raise exception 'Scan time must be between booking and the current time.';end if;
 if p_status like '%customs%' and (parcel.sender_country_code is null or parcel.consignee_country_code is null or parcel.sender_country_code=parcel.consignee_country_code) then raise exception 'Customs milestones require an international shipment.';end if;
 if parcel.status in ('delivered','returned_to_shipper') and p_status is distinct from scan.status then raise exception 'Completed shipments require finance review before changing a scan status. You can correct its date and time here.';end if;
 if p_status='booked' and scan.status<>'booked' then raise exception 'Correct the original booking scan instead of creating a second booking.';end if;
 if p_status='delivered' and exists(select 1 from public.customer_tracking_events e where e.shipment_id=parcel.id and e.organization_id=actor.organization_id and e.status='delivered' and e.id<>scan.id) then raise exception 'Correct the existing Delivered scan instead.';end if;
 if scan.status='delivered' and (exists(select 1 from public.settlement_items i join public.finance_ledger l on l.id=i.ledger_id where l.shipment_id=parcel.id and l.organization_id=actor.organization_id) or exists(select 1 from public.invoice_items i where i.shipment_id=parcel.id) or exists(select 1 from public.driver_cod_entries c where c.shipment_id=parcel.id and c.organization_id=actor.organization_id and c.cleared_at is not null)) then raise exception 'This delivery has been settled, invoiced or financially cleared. Finance must review the date correction.';end if;
 update public.customer_tracking_events set status=p_status,created_at=corrected_at where id=scan.id;
 -- Validate the full airport/customs ordering after correcting either milestone.
 if exists(select 1 from public.customer_tracking_events c where c.shipment_id=parcel.id and c.organization_id=actor.organization_id and c.status='customs_clearance_completed_warehouse_scanned' and not exists(select 1 from public.customer_tracking_events a where a.shipment_id=c.shipment_id and a.organization_id=c.organization_id and a.status='arrived_at_destination_airport_customs_started' and a.created_at<=c.created_at)) then raise exception 'Airport arrival must be on or before customs clearance.';end if;
 effective_status:=private.effective_customer_tracking_status(parcel.id,actor.organization_id);
 update public.shipments set customer_tracking_status=effective_status where id=parcel.id and organization_id=actor.organization_id;
 if effective_status='delivered' and (scan.status='delivered' or p_status='delivered') then
  update public.shipments set delivered_at=(select min(e.created_at) from public.customer_tracking_events e where e.shipment_id=parcel.id and e.organization_id=actor.organization_id and e.status='delivered') where id=parcel.id;
  update public.finance_ledger set transaction_at=(select delivered_at from public.shipments where id=parcel.id) where shipment_id=parcel.id and organization_id=actor.organization_id and transaction_type='delivered';
  update public.driver_cod_entries set delivered_at=(select delivered_at from public.shipments where id=parcel.id) where shipment_id=parcel.id and organization_id=actor.organization_id;
 end if;
 insert into public.shipment_events(shipment_id,organization_id,event_type,notes,created_by)
 values(parcel.id,actor.organization_id,'tracking_correction',
 'Tracking scan corrected: '||scan.status||' ('||scan.created_at::text||') → '||p_status||' ('||corrected_at::text||'). Reason: '||btrim(p_reason),actor.id);
end;
$$;
revoke all on function public.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) from public,anon;
grant execute on function public.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) to authenticated;
