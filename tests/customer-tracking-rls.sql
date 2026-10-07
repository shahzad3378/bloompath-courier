-- Run as the database owner. All synthetic fixtures are rolled back; no carrier call occurs.
begin;
create temporary table privacy_fixture (shipment_id bigint, shipper_id uuid, organization_id uuid, carrier_id uuid);
do $$
declare org uuid; admin_id uuid; customer uuid; shipment bigint; carrier uuid; observed text;
begin
 select p.organization_id,p.id into org,admin_id from public.profiles p where p.role='super_admin' and p.status='active'
 and exists(select 1 from public.profiles c where c.organization_id=p.organization_id and c.role='shipper' and c.status='active') limit 1;
 select id into customer from public.profiles where organization_id=org and role='shipper' and status='active' limit 1;
 if customer is null then raise exception 'No active tenant fixture is available'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
 insert into public.shipments(organization_id,created_by,shipper_id,sender_name,sender_phone,sender_address,sender_city,consignee_name,consignee_phone,consignee_address,consignee_city,parcel_description,reference_number,payment_type)
 values(org,admin_id,customer,'Privacy Test','+14165550100','1 Test Street','Toronto','Privacy Test','+14165550101','2 Test Street','Toronto','Synthetic test parcel','PRIVACY-ROLLBACK-TEST','prepaid') returning id into shipment;
 insert into public.third_party_carriers(organization_id,name,code) values(org,'BroadReach GTA GSM PRIVATE','T'||replace(gen_random_uuid()::text,'-','')::varchar(20)) returning id into carrier;
 insert into public.third_party_shipment_links(organization_id,shipment_id,carrier_id,partner_tracking_number) values(org,shipment,carrier,'PRIVATE-AWB-'||shipment);
 update public.shipments set fulfillment_mode='third_party' where id=shipment;
 insert into privacy_fixture values(shipment,customer,org,carrier);
 insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,internal_notes) values(org,shipment,carrier,'handed_over','BroadReach PRIVATE handover');
 select customer_tracking_status into observed from public.shipments where id=shipment;
 if observed <> 'in_transit' then raise exception 'Handover mapped incorrectly: %',observed; end if;
 insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,internal_notes) values(org,shipment,carrier,'out_for_delivery','GTA PRIVATE driver');
 select customer_tracking_status into observed from public.shipments where id=shipment;
 if observed <> 'out_for_delivery' then raise exception 'OFD mapped incorrectly'; end if;
 insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,undelivered_reason,attempt_number) values(org,shipment,carrier,'undelivered','customer_refused',1);
 select customer_tracking_status into observed from public.shipments where id=shipment;
 if observed <> 'undelivered' then raise exception 'Refusal must stay Undelivered despite internal return workflow'; end if;
 insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,return_reason) values(org,shipment,carrier,'return_in_transit','customer_refused');
 select customer_tracking_status into observed from public.shipments where id=shipment;
 if observed <> 'undelivered' then raise exception 'Return must remain generic'; end if;
 insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status) values(org,shipment,carrier,'delivered');
 select customer_tracking_status into observed from public.shipments where id=shipment;
 if observed <> 'delivered' then raise exception 'Delivered mapped incorrectly'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',customer,'role','authenticated')::text,true);
end; $$;
grant select on privacy_fixture to authenticated;
set local role authenticated;
do $$
declare target bigint; customer uuid; org uuid;
begin
 select shipment_id,shipper_id,organization_id into target,customer,org from privacy_fixture;
 if (select count(*) from public.customer_tracking_events where shipment_id=target) < 5 then raise exception 'Owner cannot see safe history'; end if;
 if exists(select 1 from public.shipment_events where shipment_id=target) then raise exception 'Raw audit history leaked'; end if;
 if exists(select 1 from public.third_party_shipment_links where shipment_id=target) then raise exception 'Partner AWB leaked'; end if;
 if exists(select 1 from public.third_party_status_updates where shipment_id=target) then raise exception 'Partner notes leaked'; end if;
 if exists(select 1 from public.customer_tracking_events e join public.shipments s on s.id=e.shipment_id where s.shipper_id is distinct from customer and s.created_by is distinct from customer) then raise exception 'Other customer history leaked'; end if;
 if exists(select 1 from public.customer_tracking_events where shipment_id=target and row_to_json(customer_tracking_events)::text ~ '(BroadReach|GTA|GSM|PRIVATE-AWB)') then raise exception 'Identity leaked in projection'; end if;
end; $$;
reset role;
rollback;
select 'handover / OFD / refusal / return / delivered / owner RLS / raw audit privacy passed' as verification,
 not exists(select 1 from public.shipments where reference_number='PRIVACY-ROLLBACK-TEST') as fixtures_rolled_back;
