-- Transactional integration checks; no carrier calls and all fixture writes roll back.
begin;
do $$
declare s public.shipments%rowtype; qa uuid; live uuid; before_mode public.shipments.fulfillment_mode%type; before_status public.shipments.status%type; other uuid;
begin
  select * into s from public.shipments a where a.organization_id = 'edb6f2a6-1e35-45b6-a60c-35b8ca4aa01e'
    and a.deleted_at is null and a.status in ('booked','ready_for_pickup','picked_up','at_warehouse') and a.assigned_driver_id is null
    and not exists (select 1 from public.third_party_shipment_links l where l.shipment_id=a.id)
    and not exists (select 1 from public.broadreach_bookings b where b.shipment_id=a.id)
    and not exists (select 1 from public.gta_airskip_bookings b where b.shipment_id=a.id) order by a.id desc limit 1 for update;
  if not found then raise exception 'No eligible transaction fixture.'; end if;
  before_status := s.status; before_mode := s.fulfillment_mode;
  qa := public.reserve_gta_airskip_booking(s.organization_id,s.id,true,'automatic','https://tms-api-qa.gtagsm.com',s.created_by);
  begin
    perform public.reserve_gta_airskip_booking(s.organization_id,s.id,true,'automatic','https://tms-api-qa.gtagsm.com',s.created_by);
    raise exception 'Duplicate QA reservation was accepted.';
  exception when unique_violation then null; end;
  begin
    perform public.reserve_gta_airskip_booking('d89203fd-4ae6-460b-a27a-43c703f710b1',s.id,true,'automatic','https://tms-api-qa.gtagsm.com',s.created_by);
    raise exception 'Cross-tenant reservation was accepted.';
  exception when raise_exception then if sqlerrm <> 'Shipment is not eligible for carrier booking.' then raise; end if; end;
  update public.gta_airskip_bookings set status='generated',partner_tracking_number='QA-TRANSACTION-FIXTURE',label_base64='XlhBXlha',label_format='zpl',load_number='FIXTURE' where id=qa;
  perform public.finalize_gta_airskip_booking(qa,s.organization_id);
  perform public.finalize_gta_airskip_booking(qa,s.organization_id);
  if exists(select 1 from public.third_party_shipment_links where shipment_id=s.id) or exists(select 1 from public.shipments where id=s.id and (status is distinct from before_status or fulfillment_mode is distinct from before_mode)) then raise exception 'QA changed live partner/custody.'; end if;
  -- The failed GTA request rolls this subtransaction back, including BroadReach reservation.
  begin
    other := public.reserve_broadreach_booking(s.organization_id,s.id,false,'ca_rateshop',s.created_by);
    perform public.reserve_gta_airskip_booking(s.organization_id,s.id,false,'automatic','https://fixture-production.gtagsm.com',s.created_by);
    raise exception 'BroadReach to GTA cross-carrier booking was accepted.';
  exception when raise_exception then if sqlerrm <> 'Shipment already reserved for another carrier.' then raise; end if; end;
  live := public.reserve_gta_airskip_booking(s.organization_id,s.id,false,'automatic','https://fixture-production.gtagsm.com',s.created_by);
  begin
    perform public.reserve_broadreach_booking(s.organization_id,s.id,false,'ca_rateshop',s.created_by);
    raise exception 'GTA to BroadReach cross-carrier booking was accepted.';
  exception when raise_exception then if sqlerrm <> 'Shipment already reserved for another carrier.' then raise; end if; end;
  update public.gta_airskip_bookings set status='generated',partner_tracking_number='LIVE-TRANSACTION-FIXTURE',label_base64='XlhBXlha',label_format='zpl',load_number='FIXTURE' where id=live;
  perform public.finalize_gta_airskip_booking(live,s.organization_id);
  perform public.finalize_gta_airskip_booking(live,s.organization_id);
  if (select count(*) from public.third_party_shipment_links where shipment_id=s.id and partner_tracking_number='LIVE-TRANSACTION-FIXTURE') <> 1 then raise exception 'Live finalization not idempotent.'; end if;
  if exists(select 1 from public.shipments where id=s.id and (status is distinct from before_status or fulfillment_mode <> 'third_party')) then raise exception 'Live finalization changed physical custody.'; end if;
end;
$$;
rollback;
select 'reservation, tenant isolation, QA custody, cross-carrier protection, live finalization and rollback passed' as result;
