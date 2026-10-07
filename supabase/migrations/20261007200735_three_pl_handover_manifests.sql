-- Internal, tenant-scoped physical 3PL handover. Draft creation never changes custody.
create table public.third_party_manifests (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 carrier_id uuid not null references public.third_party_carriers(id),
 carrier_name text not null,
 manifest_number text not null unique,
 status text not null default 'draft' check(status in ('draft','handed_over','cancelled')),
 shipment_count integer not null check(shipment_count between 1 and 500),
 notes text check(char_length(notes)<=1000),
 receiver_name text check(char_length(receiver_name) between 2 and 120),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 handed_over_by uuid references public.profiles(id),
 handed_over_at timestamptz,
 cancelled_by uuid references public.profiles(id),
 cancelled_at timestamptz
);
create index third_party_manifests_org_created_idx on public.third_party_manifests(organization_id,created_at desc);
create index third_party_manifests_carrier_idx on public.third_party_manifests(carrier_id);
create index third_party_manifests_created_by_idx on public.third_party_manifests(created_by);
create index third_party_manifests_handed_by_idx on public.third_party_manifests(handed_over_by);
create index third_party_manifests_cancelled_by_idx on public.third_party_manifests(cancelled_by);
create table public.third_party_manifest_items (
 manifest_id uuid not null references public.third_party_manifests(id),
 shipment_id bigint not null references public.shipments(id),
 organization_id uuid not null references public.organizations(id),
 tracking_number text not null,
 consignee_name text not null,
 consignee_city text not null,
 pieces smallint not null,
 partner_tracking_number text,
 reserved boolean not null default true,
 primary key(manifest_id,shipment_id)
);
create unique index third_party_manifest_active_shipment_idx on public.third_party_manifest_items(shipment_id) where reserved;
create index third_party_manifest_items_org_idx on public.third_party_manifest_items(organization_id);
create index third_party_manifest_items_shipment_idx on public.third_party_manifest_items(shipment_id);
alter table public.third_party_manifests enable row level security;
alter table public.third_party_manifest_items enable row level security;
revoke all on public.third_party_manifests,public.third_party_manifest_items from public,anon,authenticated;
grant select on public.third_party_manifests,public.third_party_manifest_items to authenticated;
create policy "operations read their 3pl manifests" on public.third_party_manifests for select to authenticated using (
 organization_id=(select private.current_organization_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','dispatcher'))
);
create policy "operations read their 3pl manifest items" on public.third_party_manifest_items for select to authenticated using (
 organization_id=(select private.current_organization_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','dispatcher'))
);
-- Private definer is the only writer; public API wrapper is invoker. Every branch authorizes
-- the active actor and scopes to their organization before reading or modifying anything.
create function private.manage_three_pl_manifest(p_operation text,p_id uuid,p_carrier_id uuid,p_awbs text[],p_receiver text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles%rowtype;
 manifest public.third_party_manifests%rowtype;
 shipment public.shipments%rowtype;
 link public.third_party_shipment_links%rowtype;
 carrier public.third_party_carriers%rowtype;
 awbs text[];
 shipment_ids bigint[];
begin
 select * into actor from public.profiles where id=(select auth.uid()) and status='active' for share;
 if not found or actor.organization_id is null or actor.role not in ('super_admin','operations_admin','warehouse_staff','dispatcher') then
  raise exception '3PL manifest: Access denied.' using errcode='42501';
 end if;
 if p_id is null then raise exception '3PL manifest: Invalid request.'; end if;
 -- Serializes retries for one request without holding a global lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.organization_id::text||p_id::text,0));
 select * into manifest from public.third_party_manifests where id=p_id and organization_id=actor.organization_id for update;
 if p_operation='create' then
  if coalesce(cardinality(p_awbs),0) not between 1 and 500 or coalesce(char_length(p_notes),0)>1000 then
   raise exception '3PL manifest: Select 1 to 500 AWBs and keep notes within 1000 characters.';
  end if;
  select array_agg(distinct upper(btrim(a)) order by upper(btrim(a))) into awbs from unnest(p_awbs) a;
  if exists(select 1 from unnest(awbs) a where a is null or a !~ '^[A-Z0-9][A-Z0-9_-]{2,99}$') then raise exception '3PL manifest: Enter valid FastDrop AWBs.'; end if;
  if manifest.id is not null then
   if manifest.carrier_id=p_carrier_id and (select array_agg(i.tracking_number order by i.tracking_number) from public.third_party_manifest_items i where i.manifest_id=p_id)=awbs then return p_id; end if;
   raise exception '3PL manifest: This request already created a different manifest. Refresh and retry.';
  end if;
  select * into carrier from public.third_party_carriers where id=p_carrier_id and organization_id=actor.organization_id and is_active for share;
  if not found then raise exception '3PL manifest: Select an active delivery partner.'; end if;
  select array_agg(s.id order by s.id) into shipment_ids from public.shipments s where s.organization_id=actor.organization_id and s.tracking_number=any(awbs) and s.deleted_at is null;
  if coalesce(cardinality(shipment_ids),0)<>cardinality(awbs) then raise exception '3PL manifest: One or more AWBs were not found in your organization.'; end if;
 else
  if manifest.id is null then raise exception '3PL manifest: Manifest not found.'; end if;
  if p_operation='confirm' and manifest.status='handed_over' then return p_id; end if;
  if p_operation='cancel' and manifest.status='cancelled' then return p_id; end if;
  if manifest.status<>'draft' then raise exception '3PL manifest: Only a draft manifest can be changed.'; end if;
  if p_operation='cancel' then
   update public.third_party_manifest_items set reserved=false where manifest_id=p_id and organization_id=actor.organization_id;
   update public.third_party_manifests set status='cancelled',cancelled_by=actor.id,cancelled_at=now() where id=p_id;
   return p_id;
  end if;
  if p_operation<>'confirm' then raise exception '3PL manifest: Invalid operation.'; end if;
  if coalesce(char_length(btrim(p_receiver)),0) not between 2 and 120 then raise exception '3PL manifest: Enter the receiver name (2 to 120 characters).'; end if;
  select * into carrier from public.third_party_carriers where id=manifest.carrier_id and organization_id=actor.organization_id and is_active for share;
  if not found then raise exception '3PL manifest: Delivery partner is no longer active.'; end if;
  select array_agg(shipment_id order by shipment_id) into shipment_ids from public.third_party_manifest_items where manifest_id=p_id and organization_id=actor.organization_id and reserved;
  if coalesce(cardinality(shipment_ids),0)<>manifest.shipment_count then raise exception '3PL manifest: Parcel list changed. Cancel this draft and create a new one.'; end if;
 end if;
 -- Ordered locks make validation and all status changes atomic, including concurrent attempts.
 for shipment in select * from public.shipments s where s.id=any(shipment_ids) and s.organization_id=actor.organization_id order by s.id for update loop
  if shipment.deleted_at is not null or shipment.status<>'at_warehouse' or shipment.assigned_driver_id is not null then
   raise exception '3PL manifest: AWB % must be unassigned and received at warehouse first.',shipment.tracking_number;
  end if;
  if exists(select 1 from public.dispatch_run_items i join public.dispatch_runs r on r.id=i.run_id where i.shipment_id=shipment.id and r.status in ('draft','handed_over')) then
   raise exception '3PL manifest: AWB % is assigned to an own-fleet route. Remove it from that route first.',shipment.tracking_number;
  end if;
  if exists(select 1 from public.third_party_manifest_items i where i.shipment_id=shipment.id and i.reserved and i.manifest_id<>p_id) then
   raise exception '3PL manifest: AWB % already belongs to an active manifest.',shipment.tracking_number;
  end if;
  select * into link from public.third_party_shipment_links where shipment_id=shipment.id for update;
  if found and (link.organization_id<>actor.organization_id or link.carrier_id<>carrier.id or link.handed_over_at is not null) then
   raise exception '3PL manifest: AWB % has a different partner booking or was already handed over.',shipment.tracking_number;
  end if;
 end loop;
 if p_operation='create' then
  insert into public.third_party_manifests(id,organization_id,carrier_id,carrier_name,manifest_number,shipment_count,notes,created_by)
  values(p_id,actor.organization_id,carrier.id,carrier.name,'3PL-'||to_char(now(),'YYYYMMDD')||'-'||upper(replace(p_id::text,'-','')),cardinality(shipment_ids),nullif(btrim(p_notes),''),actor.id);
  insert into public.third_party_manifest_items(manifest_id,shipment_id,organization_id,tracking_number,consignee_name,consignee_city,pieces,partner_tracking_number)
  select p_id,s.id,actor.organization_id,s.tracking_number,s.consignee_name,s.consignee_city,s.pieces,l.partner_tracking_number
  from public.shipments s left join public.third_party_shipment_links l on l.shipment_id=s.id where s.id=any(shipment_ids);
 else
  -- Marking the header is part of this same transaction; failures roll back everything.
  update public.third_party_manifests set status='handed_over',receiver_name=btrim(p_receiver),handed_over_by=actor.id,handed_over_at=now() where id=p_id;
  for shipment in select * from public.shipments where id=any(shipment_ids) order by id loop
   insert into public.third_party_shipment_links(organization_id,shipment_id,carrier_id,created_by)
   values(actor.organization_id,shipment.id,carrier.id,actor.id) on conflict(shipment_id) do nothing;
   update public.shipments set fulfillment_mode='third_party',assigned_driver_id=null where id=shipment.id and organization_id=actor.organization_id;
   update public.third_party_manifest_items i set partner_tracking_number=l.partner_tracking_number from public.third_party_shipment_links l where i.manifest_id=p_id and i.shipment_id=shipment.id and l.shipment_id=i.shipment_id;
   -- Reuse canonical custody + customer-safe In transit/history triggers.
   insert into public.third_party_status_updates(organization_id,shipment_id,carrier_id,status,source,updated_by,internal_notes)
   values(actor.organization_id,shipment.id,carrier.id,'handed_over','manual',actor.id,'Manifest '||manifest.manifest_number);
  end loop;
 end if;
 return p_id;
end;
$$;
revoke all on function private.manage_three_pl_manifest(text,uuid,uuid,text[],text,text) from public,anon,authenticated;
grant execute on function private.manage_three_pl_manifest(text,uuid,uuid,text[],text,text) to authenticated;
create function public.manage_three_pl_manifest(p_operation text,p_id uuid,p_carrier_id uuid,p_awbs text[],p_receiver text,p_notes text)
returns uuid language sql security invoker set search_path='' as $$
 select private.manage_three_pl_manifest(p_operation,p_id,p_carrier_id,p_awbs,p_receiver,p_notes);
$$;
revoke all on function public.manage_three_pl_manifest(text,uuid,uuid,text[],text,text) from public,anon,authenticated;
grant execute on function public.manage_three_pl_manifest(text,uuid,uuid,text[],text,text) to authenticated;
-- Old single-AWB handover cannot bypass a reserved draft's confirmation.
create function private.guard_manifest_reserved_handover() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='handed_over' then
  perform 1 from public.shipments where id=new.shipment_id for update;
  if exists(select 1 from public.third_party_manifest_items i join public.third_party_manifests m on m.id=i.manifest_id where i.shipment_id=new.shipment_id and i.reserved and m.status='draft') then
   raise exception '3PL manifest: Confirm handover from the reserved manifest.';
  end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_manifest_reserved_handover() from public,anon,authenticated;
create trigger a_guard_manifest_handover before insert on public.third_party_status_updates for each row execute function private.guard_manifest_reserved_handover();
