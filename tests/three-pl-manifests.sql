-- Synthetic parcels only; every change rolls back. No external carrier request.
begin;
create temporary table manifest_fixture(org uuid,actor uuid,shipper uuid,carrier uuid,other_carrier uuid,s1 bigint,s2 bigint,m uuid);
grant select on manifest_fixture to authenticated;
do $$ declare org uuid; actor uuid; customer uuid; c uuid; c2 uuid; a bigint; b bigint;
begin
 select p.organization_id,p.id into org,actor from public.profiles p where p.role='super_admin' and p.status='active' and exists(select 1 from public.profiles c where c.organization_id=p.organization_id and c.role='shipper' and c.status='active') limit 1;
 select id into customer from public.profiles where organization_id=org and role='shipper' and status='active' limit 1;
 if customer is null then raise exception 'No active test tenant'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 insert into public.third_party_carriers(organization_id,name,code) values(org,'Manifest rollback partner','T'||substr(replace(gen_random_uuid()::text,'-',''),1,20)) returning id into c;
 insert into public.third_party_carriers(organization_id,name,code) values(org,'Other rollback partner','T'||substr(replace(gen_random_uuid()::text,'-',''),1,20)) returning id into c2;
 insert into public.shipments(organization_id,created_by,shipper_id,sender_name,sender_phone,sender_address,sender_city,consignee_name,consignee_phone,consignee_address,consignee_city,parcel_description,reference_number,payment_type)
 values(org,actor,customer,'Manifest Test','+14165550100','1 Test Street','Toronto','Manifest Test','+14165550101','2 Test Street','Toronto','Synthetic parcel','MANIFEST-ROLLBACK-A','prepaid') returning id into a;
 insert into public.shipments(organization_id,created_by,shipper_id,sender_name,sender_phone,sender_address,sender_city,consignee_name,consignee_phone,consignee_address,consignee_city,parcel_description,reference_number,payment_type)
 values(org,actor,customer,'Manifest Test','+14165550100','1 Test Street','Toronto','Manifest Test','+14165550101','2 Test Street','Toronto','Synthetic parcel','MANIFEST-ROLLBACK-B','prepaid') returning id into b;
 update public.shipments set status='at_warehouse',warehouse_received_at=now() where id in (a,b);
 insert into public.third_party_shipment_links(organization_id,shipment_id,carrier_id,partner_tracking_number,created_by) values(org,a,c,'TEST-PARTNER-'||a,actor);
 update public.shipments set fulfillment_mode='third_party' where id=a;
 insert into manifest_fixture values(org,actor,customer,c,c2,a,b,gen_random_uuid());
end; $$;
set local role authenticated;
do $$ declare f manifest_fixture%rowtype; awbs text[]; failed boolean; n integer; result uuid;
begin
 select * into f from manifest_fixture;
 select array_agg(tracking_number order by id) into awbs from public.shipments where id in (f.s1,f.s2);
 failed:=false; begin perform public.manage_three_pl_manifest('create',gen_random_uuid(),f.other_carrier,awbs,null,null); exception when others then failed:=true; end;
 if not failed then raise exception 'Mismatched carrier accepted'; end if;
 result:=public.manage_three_pl_manifest('create',f.m,f.carrier,awbs,null,'rollback test');
 if result<>f.m or (select count(*) from public.third_party_manifest_items where manifest_id=f.m)<>2 then raise exception 'Draft creation failed'; end if;
 if exists(select 1 from public.shipments where id in(f.s1,f.s2) and status<>'at_warehouse') then raise exception 'Draft changed custody'; end if;
 if exists(select 1 from public.third_party_shipment_links where shipment_id in(f.s1,f.s2) and handed_over_at is not null) then raise exception 'Draft handed over parcels'; end if;
 perform public.manage_three_pl_manifest('create',f.m,f.carrier,awbs,null,null);
 if (select count(*) from public.third_party_manifests where id=f.m)<>1 then raise exception 'Retry duplicated manifest'; end if;
 failed:=false;begin perform public.manage_three_pl_manifest('create',gen_random_uuid(),f.carrier,awbs,null,null);exception when others then failed:=true;end;
 if not failed then raise exception 'Duplicate reservation accepted';end if;
 failed:=false;begin insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,updated_by)values(f.org,f.s1,f.carrier,'handed_over',f.actor);exception when others then failed:=true;end;
 if not failed then raise exception 'Single handover bypassed reserved manifest';end if;
 failed:=false;begin perform public.manage_three_pl_manifest('confirm',f.m,null,null,'',null);exception when others then failed:=true;end;
 if not failed then raise exception 'Missing receiver accepted';end if;
 -- Make one parcel stale. All-or-nothing confirmation must leave the other untouched.
 update public.shipments set status='cancelled' where id=f.s2;
 failed:=false;begin perform public.manage_three_pl_manifest('confirm',f.m,null,null,'Test Receiver',null);exception when others then failed:=true;end;
 if not failed or (select status from public.third_party_manifests where id=f.m)<>'draft' or (select status from public.shipments where id=f.s1)<>'at_warehouse' then raise exception 'Partial handover occurred';end if;
 update public.shipments set status='at_warehouse' where id=f.s2;
 perform public.manage_three_pl_manifest('confirm',f.m,null,null,'Test Receiver',null);
 if (select status from public.third_party_manifests where id=f.m)<>'handed_over' then raise exception 'Handover failed';end if;
 if (select count(*) from public.shipments where id in(f.s1,f.s2) and customer_tracking_status='in_transit')<>2 then raise exception 'Customer In transit mapping failed';end if;
 if (select partner_tracking_number from public.third_party_shipment_links where shipment_id=f.s1)<>'TEST-PARTNER-'||f.s1 then raise exception 'Existing booking lost';end if;
 select count(*) into n from public.third_party_status_updates where shipment_id in(f.s1,f.s2) and status='handed_over';
 perform public.manage_three_pl_manifest('confirm',f.m,null,null,'Test Receiver',null);
 if n<>(select count(*) from public.third_party_status_updates where shipment_id in(f.s1,f.s2) and status='handed_over') then raise exception 'Retry duplicated status history';end if;
 failed:=false;begin perform public.manage_three_pl_manifest('cancel',f.m,null,null,null,null);exception when others then failed:=true;end;
 if not failed then raise exception 'Confirmed manifest cancelled';end if;
end; $$;
reset role;
do $$ declare f manifest_fixture%rowtype; new_id uuid:=gen_random_uuid(); awbs text[];
begin
 select * into f from manifest_fixture;
 -- Reuse a rolled-back synthetic parcel to exercise cancellation and re-reservation.
 update public.third_party_manifest_items set reserved=false where manifest_id=f.m;
 update public.third_party_shipment_links set handed_over_at=null where shipment_id=f.s2;
 update public.shipments set status='at_warehouse',assigned_driver_id=null where id=f.s2;
 select array[tracking_number] into awbs from public.shipments where id=f.s2;
 perform public.manage_three_pl_manifest('create',new_id,f.carrier,awbs,null,null);
 perform public.manage_three_pl_manifest('cancel',new_id,null,null,null,null);
 perform public.manage_three_pl_manifest('cancel',new_id,null,null,null,null);
 if exists(select 1 from public.third_party_manifest_items where manifest_id=new_id and reserved) or (select status from public.shipments where id=f.s2)<>'at_warehouse' then raise exception 'Cancellation changed custody or retained reservation';end if;
 perform public.manage_three_pl_manifest('create',gen_random_uuid(),f.carrier,awbs,null,null);
 perform set_config('request.jwt.claims',json_build_object('sub',f.shipper,'role','authenticated')::text,true);
end; $$;
set local role authenticated;
do $$ declare f manifest_fixture%rowtype; failed boolean;
begin
 select * into f from manifest_fixture;
 if exists(select 1 from public.third_party_manifests) or exists(select 1 from public.third_party_manifest_items) then raise exception 'Shipper sees internal manifests';end if;
 failed:=false;begin perform public.manage_three_pl_manifest('confirm',f.m,null,null,'Not authorized',null);exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Shipper can mutate manifest';end if;
 failed:=false;begin insert into public.third_party_manifest_items(manifest_id,shipment_id,organization_id,tracking_number,consignee_name,consignee_city,pieces)values(f.m,f.s1,f.org,'FORBIDDEN','Forbidden','Toronto',1);exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Direct table write permitted';end if;
end; $$;
reset role;
select '3PL manifests: draft/custody, retries, duplicate reservation, mismatch, stale atomicity, handover, tracking privacy, cancellation and access checks passed' as result;
rollback;
