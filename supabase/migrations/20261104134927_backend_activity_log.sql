-- Append-only operational audit. Only tenant administrators can read it.
create table public.activity_log (
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 actor_id uuid,
 actor_name text,
 actor_email text,
 actor_role text,
 entity_type text not null,
 entity_id text not null,
 record_label text not null,
 shipment_id bigint,
 action text not null,
 changes jsonb not null default '{}'::jsonb,
 source text not null,
 occurred_at timestamptz not null,
 recorded_at timestamptz,
 sort_at timestamptz generated always as (coalesce(recorded_at, occurred_at)) stored,
 legacy_key text unique
);
create index activity_log_org_time on public.activity_log(organization_id, sort_at desc, id desc);
create index activity_log_org_shipment on public.activity_log(organization_id, shipment_id, sort_at desc);
create index activity_log_org_actor on public.activity_log(organization_id, actor_id, sort_at desc);
alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;
create policy "tenant administrators read activity" on public.activity_log for select to authenticated
using (organization_id = (select private.current_organization_id()) and exists (
 select 1 from public.profiles p where p.id = (select auth.uid()) and p.status='active'
 and p.organization_id=activity_log.organization_id and p.role in ('super_admin','operations_admin')
));

-- Trigger-only privilege is necessary to write audit rows without giving users
-- INSERT/UPDATE/DELETE access to the audit itself. No callable public RPC.
create function private.capture_activity_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 old_row jsonb := case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 new_row jsonb := case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_data jsonb;
 delta jsonb := '{}'::jsonb;
 field_name text;
 org uuid;
 actor uuid := auth.uid();
 actor_profile record;
 sid bigint;
 label text;
 event_time timestamptz;
begin
 row_data := case when tg_op='DELETE' then old_row else new_row end;
 org := (row_data->>'organization_id')::uuid;
 if org is null and row_data ? 'shipment_id' then
  select s.organization_id into org from public.shipments s where s.id=(row_data->>'shipment_id')::bigint;
 end if;
 if org is null then return coalesce(new,old); end if;
 foreach field_name in array tg_argv loop
  if (old_row->field_name) is distinct from (new_row->field_name) then
   delta := delta || jsonb_build_object(field_name,jsonb_build_object('old',old_row->field_name,'new',new_row->field_name));
  end if;
 end loop;
 if delta='{}'::jsonb then return coalesce(new,old); end if;
 -- Existing event authors may identify a service-recorded action; never reuse a
 -- record's original creator as the actor of a later UPDATE.
 if actor is null and tg_op='INSERT' then
  actor := coalesce(row_data->>'recorded_by',row_data->>'performed_by',row_data->>'updated_by',row_data->>'created_by',row_data->>'added_by',row_data->>'received_by')::uuid;
 end if;
 select p.full_name,p.email,p.role::text into actor_profile from public.profiles p where p.id=actor and p.organization_id=org;
 if not found then actor:=null; end if;
 if tg_table_name='shipments' then sid:=(row_data->>'id')::bigint;
 elsif row_data ? 'shipment_id' then sid:=(row_data->>'shipment_id')::bigint; end if;
 if sid is not null then
  select concat_ws(' / ',s.tracking_number,nullif(s.reference_number,'')) into label from public.shipments s where s.id=sid and s.organization_id=org;
 end if;
 label := coalesce(label,row_data->>'tracking_number',row_data->>'order_number',row_data->>'run_number',row_data->>'manifest_number',row_data->>'full_name',row_data->>'company_name',row_data->>'name',row_data->>'sku',tg_table_name||' #'||coalesce(row_data->>'id',row_data->>'shipper_id',org::text));
 event_time := case when tg_table_name='customer_tracking_events' then (row_data->>'created_at')::timestamptz else clock_timestamp() end;
 insert into public.activity_log(organization_id,actor_id,actor_name,actor_email,actor_role,entity_type,entity_id,record_label,shipment_id,action,changes,source,occurred_at,recorded_at)
 values(org,actor,actor_profile.full_name,actor_profile.email,actor_profile.role,tg_table_name,
 coalesce(row_data->>'id',row_data->>'shipper_id',org::text),label,sid,lower(tg_op),delta,
 case when auth.uid() is not null then 'user' when actor is not null then 'service_recorded_author' else 'system' end,
 coalesce(event_time,clock_timestamp()),clock_timestamp());
 return coalesce(new,old);
end;
$$;
revoke all on function private.capture_activity_log() from public,anon,authenticated;
create trigger capture_activity after insert or update or delete on public.shipments
for each row execute function private.capture_activity_log('tracking_number','reference_number','shipper_id','assigned_driver_id','status','customer_tracking_status','service_type','payment_type','sender_name','sender_phone','sender_address','sender_city','consignee_name','consignee_phone','consignee_address','consignee_city','pieces','weight_kg','parcel_description','cod_amount','delivery_instructions','booked_at','delivered_at','deleted_at','deleted_by','delete_reason','warehouse_location','warehouse_received_at','delivery_attempt_count','last_undelivered_reason','currency','sender_country_code','consignee_country_code','consignee_postal_code','declared_value','hs_code','item_quantity','item_value','sender_address_2','sender_address_3','sender_state_province','sender_postal_code','consignee_alt_phone','consignee_area','consignee_landmark','consignee_address_2','consignee_address_3','consignee_state_province','consignee_email','transport_mode','length_cm','width_cm','height_cm','country_of_origin','incoterms','fulfillment_mode','fourth_attempt_authorized');
create trigger capture_activity after insert or update or delete on public.customer_tracking_events
for each row execute function private.capture_activity_log('status','created_at','source','recorded_by','proof_path');
create trigger capture_activity after insert or update or delete on public.profiles
for each row execute function private.capture_activity_log('full_name','email','phone','employee_code','role','status','can_delete_shipments');
create trigger capture_activity after insert or update or delete on public.organization_settings
for each row execute function private.capture_activity_log('legal_name','display_name','contact_email','contact_phone','website','address','city','trn','awb_brand_name','awb_prefix','currency','standard_delivery_attempts','fourth_attempt_allowed','logo_url');
create trigger capture_activity after insert or update or delete on public.shipper_business_profiles
for each row execute function private.capture_activity_log('company_name','contact_person','address','city','cod_cycle_days','account_number');
create trigger capture_activity after insert or update or delete on public.dispatch_runs
for each row execute function private.capture_activity_log('run_number','route_name','driver_id','status','handed_over_at','completed_at','cancelled_at','cancelled_by');
create trigger capture_activity after insert or update or delete on public.pickup_manifests
for each row execute function private.capture_activity_log('manifest_number','shipper_id','status','assigned_driver_id','picked_up_at','received_at');
create trigger capture_activity after insert or update or delete on public.return_runs
for each row execute function private.capture_activity_log('run_number','route_name','driver_id','status','handed_over_at','completed_at','shipper_id');
create trigger capture_activity after insert or update or delete on public.delivery_attempts
for each row execute function private.capture_activity_log('outcome','attempt_number','undelivered_reason','notes','proof_path');
create trigger capture_activity after insert or update or delete on public.warehouse_reattempt_receipts
for each row execute function private.capture_activity_log('shipment_id','attempt_number','driver_id','received_at');
create trigger capture_activity after insert or update or delete on public.pickup_manifest_items
for each row execute function private.capture_activity_log('shipment_id','received_at','received_by','warehouse_location');
create trigger capture_activity after insert or update or delete on public.driver_custody_scans
for each row execute function private.capture_activity_log('shipment_id','driver_id','stage','scanned_at');
create trigger capture_activity after insert or update or delete on public.fulfillment_products
for each row execute function private.capture_activity_log('sku','name','location','quantity_on_hand','quantity_reserved','active');
create trigger capture_activity after insert or update or delete on public.fulfillment_orders
for each row execute function private.capture_activity_log('order_number','shipper_id','product_id','quantity','status','cod_amount','payment_type');
create trigger capture_activity after insert or update or delete on public.fulfillment_inventory_movements
for each row execute function private.capture_activity_log('product_id','movement_type','quantity','note','order_id');
create trigger capture_activity after insert or update or delete on public.shipper_rates
for each row execute function private.capture_activity_log('shipper_id','delivery_rate','return_charge_enabled','return_rate','currency','effective_from','effective_to','vat_rate');
create trigger capture_activity after insert or update or delete on public.shipper_zone_rates
for each row execute function private.capture_activity_log('shipper_id','service_zone_id','service_type','delivery_rate','return_rate','currency','is_active');
create trigger capture_activity after insert or update or delete on public.carrier_rate_cards
for each row execute function private.capture_activity_log('card_name','is_active','effective_from','import_status','imported_by');
create trigger capture_activity after insert or update or delete on public.shipper_tariff_cards
for each row execute function private.capture_activity_log('card_name','is_active','effective_from','imported_by');
create trigger capture_activity after insert or update or delete on public.fulfillment_group_charges
for each row execute function private.capture_activity_log('group_code','group_name','order_charge','currency');
create trigger capture_activity after insert or update or delete on public.fulfillment_product_shipper_rates
for each row execute function private.capture_activity_log('product_id','shipper_id','unit_cost','currency','fulfillment_group');
create trigger capture_activity after insert or update or delete on public.invoices
for each row execute function private.capture_activity_log('invoice_number','status','total_amount','currency','paid_at','payment_reference');
create trigger capture_activity after insert or update or delete on public.settlements
for each row execute function private.capture_activity_log('settlement_number','shipper_id','status','net_payable','approved_at','paid_at');
create trigger capture_activity after insert or update or delete on public.third_party_shipment_links
for each row execute function private.capture_activity_log('shipment_id','carrier_id','partner_tracking_number','partner_status','handed_over_at','last_status_at','return_reason');
create trigger capture_activity after insert or update or delete on public.third_party_status_updates
for each row execute function private.capture_activity_log('shipment_id','carrier_id','status','attempt_number','undelivered_reason','return_reason','source');

-- Historical entries preserve existing evidence. Their actual write time was
-- not captured, so recorded_at stays NULL rather than inventing one.
insert into public.activity_log(organization_id,actor_id,actor_name,actor_email,actor_role,entity_type,entity_id,record_label,shipment_id,action,changes,source,occurred_at,recorded_at,legacy_key)
select e.organization_id,e.created_by,p.full_name,p.email,p.role::text,'shipments',s.id::text,
concat_ws(' / ',s.tracking_number,nullif(s.reference_number,'')),s.id,e.event_type,
jsonb_build_object('status',jsonb_build_object('old',e.previous_status,'new',e.new_status)),
'legacy_event',e.created_at,null,'shipment_event:'||e.id
from public.shipment_events e join public.shipments s on s.id=e.shipment_id and s.organization_id=e.organization_id
left join public.profiles p on p.id=e.created_by and p.organization_id=e.organization_id;
insert into public.activity_log(organization_id,actor_id,actor_name,actor_email,actor_role,entity_type,entity_id,record_label,shipment_id,action,changes,source,occurred_at,recorded_at,legacy_key)
select e.organization_id,e.recorded_by,p.full_name,p.email,p.role::text,'customer_tracking_events',e.id::text,
concat_ws(' / ',s.tracking_number,nullif(s.reference_number,'')),s.id,'manual_tracking',
jsonb_build_object('status',jsonb_build_object('old',null,'new',e.status)),
'legacy_manual',e.created_at,null,'tracking_event:'||e.id
from public.customer_tracking_events e join public.shipments s on s.id=e.shipment_id and s.organization_id=e.organization_id
left join public.profiles p on p.id=e.recorded_by and p.organization_id=e.organization_id
where e.source='manual';
