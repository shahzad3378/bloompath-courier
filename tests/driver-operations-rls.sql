-- No real dispatch, payment, document or support action persists; rollback all fixtures.
begin;
create temporary table driver_fixture(org uuid,admin_id uuid,driver_id uuid,other_driver uuid,shipment bigint,manifest bigint,run_item bigint,ticket uuid);
do $$
declare org uuid; admin_id uuid; rider uuid; other_rider uuid; parcel bigint; manifest bigint; run bigint; item bigint; ticket uuid:=gen_random_uuid();
begin
 select d.organization_id,d.id,a.id into org,rider,admin_id from public.profiles d join public.profiles a on a.organization_id=d.organization_id and a.role='super_admin' and a.status='active' where d.role='driver' and d.status='active' and not exists(select 1 from public.driver_cod_entries e where e.driver_id=d.id and e.outstanding_amount>0 and (e.delivered_at at time zone 'Asia/Dubai')::date<(now() at time zone 'Asia/Dubai')::date) limit 1;
 if rider is null then raise exception 'No suitable driver fixture'; end if;
 select id into other_rider from public.profiles where role='driver' and status='active' and id<>rider limit 1;
 perform set_config('request.jwt.claims',json_build_object('sub',admin_id,'role','authenticated')::text,true);
 insert into public.shipments(organization_id,created_by,sender_name,sender_phone,sender_address,sender_city,consignee_name,consignee_phone,consignee_address,consignee_city,parcel_description,reference_number,payment_type)
 values(org,admin_id,'Driver test','+971500000001','Test pickup address','Dubai','Driver test','+971500000002','Test delivery address','Dubai','Rollback test only','DRIVER-FEATURE-ROLLBACK','prepaid') returning id into parcel;
 insert into public.pickup_manifests(organization_id,shipper_name,created_by) values(org,'Driver rollback test',admin_id) returning id into manifest;
 insert into public.pickup_manifest_items(manifest_id,shipment_id,added_by) values(manifest,parcel,admin_id);
 update public.pickup_manifests set status='ready_for_pickup' where id=manifest;
 update public.pickup_manifests set assigned_driver_id=rider where id=manifest;
 insert into public.driver_pay_terms(driver_id,organization_id,mode,delivery_rate,fixed_rate,fixed_period,currency) values(rider,org,'mixed',5,1000,'month','AED') on conflict(driver_id) do update set mode='mixed',delivery_rate=5,fixed_rate=1000,fixed_period='month',currency='AED';
 insert into driver_fixture values(org,admin_id,rider,other_rider,parcel,manifest,null,ticket);
 perform set_config('request.jwt.claims',json_build_object('sub',rider,'role','authenticated')::text,true);
end; $$;
grant select,update on driver_fixture to authenticated;
set local role authenticated;
do $$ declare f driver_fixture%rowtype; failed boolean; begin
 select * into f from driver_fixture;
 if not exists(select 1 from public.shipments where id=f.shipment) then raise exception 'Assigned pickup parcel unreadable'; end if;
 if exists(select 1 from public.driver_pay_terms where driver_id<>f.driver_id) then raise exception 'Other driver pay terms leaked'; end if;
 failed:=false;begin perform public.complete_driver_pickup(f.manifest);exception when others then failed:=true;end;if not failed then raise exception 'Unscanned pickup completed';end if;
 perform public.record_driver_custody_scan(f.manifest,(select tracking_number from public.shipments where id=f.shipment),'pickup');
 perform public.record_driver_custody_scan(f.manifest,(select tracking_number from public.shipments where id=f.shipment),'pickup');
 if(select count(*) from public.driver_custody_scans where manifest_id=f.manifest)<>1 then raise exception 'Duplicate scan not idempotent';end if;
 perform public.complete_driver_pickup(f.manifest);perform public.complete_driver_pickup(f.manifest);
 if(select status from public.shipments where id=f.shipment)<>'picked_up' then raise exception 'Pickup transition failed';end if;
 perform public.record_driver_custody_scan(f.manifest,(select tracking_number from public.shipments where id=f.shipment),'hub_handover');
 if(select status from public.shipments where id=f.shipment)<>'picked_up' then raise exception 'Driver hub scan bypassed warehouse receipt';end if;
 failed:=false;begin insert into public.driver_earnings(organization_id,driver_id,kind,amount,currency,description,recorded_by)values(f.org,f.driver_id,'bonus',99,'AED','Forbidden',f.driver_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Driver can credit own earnings';end if;
 failed:=false;begin update public.driver_pay_terms set delivery_rate=999 where driver_id=f.driver_id;exception when insufficient_privilege then failed:=false;end;
 if(select delivery_rate from public.driver_pay_terms where driver_id=f.driver_id)<>5 then raise exception 'Driver can set own rate';end if;
 insert into public.driver_support_tickets(id,organization_id,driver_id,subject,category)values(f.ticket,f.org,f.driver_id,'Rollback issue','other');
 insert into public.driver_support_messages(id,ticket_id,author_id,body)values(gen_random_uuid(),f.ticket,f.driver_id,'Rollback message');
 insert into public.driver_bank_details(driver_id,organization_id,bank_name,account_holder,account_number)values(f.driver_id,f.org,'Test bank','Test rider','00000000')on conflict(driver_id)do update set bank_name='Test bank';
 insert into public.driver_documents(id,organization_id,driver_id,kind,path)values(gen_random_uuid(),f.org,f.driver_id,'licence',f.org::text||'/'||f.driver_id::text||'/'||gen_random_uuid()::text||'.jpg');
end; $$;
reset role;
do $$ declare f driver_fixture%rowtype; run bigint; item bigint; begin
 select * into f from driver_fixture;perform set_config('request.jwt.claims',json_build_object('sub',f.admin_id,'role','authenticated')::text,true);
 update public.pickup_manifest_items set received_at=now(),received_by=f.admin_id where manifest_id=f.manifest;
 if(select status from public.shipments where id=f.shipment)<>'at_warehouse' then raise exception 'Warehouse receipt failed';end if;
 insert into public.dispatch_runs(organization_id,route_name,driver_id,created_by)values(f.org,'Rollback route',f.driver_id,f.admin_id)returning id into run;
 insert into public.dispatch_run_items(run_id,shipment_id,added_by)values(run,f.shipment,f.admin_id)returning id into item;
 update public.dispatch_runs set status='handed_over' where id=run;
 update driver_fixture set run_item=item;
 perform set_config('request.jwt.claims',json_build_object('sub',f.driver_id,'role','authenticated')::text,true);
end; $$;
set local role authenticated;
do $$ declare f driver_fixture%rowtype; begin
 select * into f from driver_fixture;
 insert into public.delivery_attempts(organization_id,run_item_id,shipment_id,attempt_number,outcome,proof_path,performed_by)
 values(f.org,f.run_item,f.shipment,1,'delivered',f.org::text||'/'||f.driver_id::text||'/'||gen_random_uuid()::text||'.jpg',f.driver_id);
 if(select count(*) from public.driver_earnings where shipment_id=f.shipment and kind='delivery' and amount=5)<>1 then raise exception 'Configured mixed-model commission missing';end if;
 if exists(select 1 from public.driver_earnings where driver_id<>f.driver_id) then raise exception 'Other earnings leaked';end if;
 if (public.driver_wallet_summary()->'earnings') is null then raise exception 'Wallet summary unavailable';end if;
end; $$;
reset role;
do $$ declare f driver_fixture%rowtype;begin select * into f from driver_fixture;perform set_config('request.jwt.claims',json_build_object('sub',f.other_driver,'role','authenticated')::text,true);end;$$;
set local role authenticated;
do $$ declare f driver_fixture%rowtype;failed boolean:=false;begin select * into f from driver_fixture;
 if exists(select 1 from public.driver_support_tickets where id=f.ticket)or exists(select 1 from public.driver_bank_details where driver_id=f.driver_id)or exists(select 1 from public.driver_documents where driver_id=f.driver_id)or exists(select 1 from public.driver_earnings where driver_id=f.driver_id)then raise exception 'Other driver private data leaked';end if;
 begin perform public.record_driver_custody_scan(f.manifest,'INVALID','hub_handover');exception when others then failed:=true;end;if not failed then raise exception 'Other driver can scan pickup';end if;
end;$$;
reset role;
rollback;
select 'driver pickup / duplicate scan / warehouse boundary / mixed commission / self-credit denial / cross-driver privacy passed' as verification,
not exists(select 1 from public.shipments where reference_number='DRIVER-FEATURE-ROLLBACK') as fixtures_rolled_back;
