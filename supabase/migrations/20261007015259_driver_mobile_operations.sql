-- Driver feature workspace: no backfill or automatic salary accrual.
create function private.is_active_mobile_driver() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role='driver' and status='active' and organization_id is not null);
$$;
create function private.can_manage_driver_support() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('super_admin','operations_admin','dispatcher','customer_service') and status='active' and organization_id is not null);
$$;
revoke all on function private.is_active_mobile_driver(), private.can_manage_driver_support() from public,anon;
grant execute on function private.is_active_mobile_driver(), private.can_manage_driver_support() to authenticated;

create table public.driver_pay_terms (
 driver_id uuid primary key references public.profiles(id), organization_id uuid not null references public.organizations(id),
 mode text not null check(mode in ('per_delivery','fixed','mixed')), delivery_rate numeric(12,2) check(delivery_rate>=0),
 fixed_rate numeric(12,2) check(fixed_rate>=0), fixed_period text check(fixed_period in ('day','week','month')),
 currency text not null check(currency ~ '^[A-Z]{3}$'), updated_at timestamptz not null default now(),
 check((mode='per_delivery' and delivery_rate is not null) or (mode='fixed' and fixed_rate is not null and fixed_period is not null) or (mode='mixed' and delivery_rate is not null and fixed_rate is not null and fixed_period is not null))
);
create table public.driver_earnings (
 id bigint generated always as identity primary key, entry_key uuid not null default gen_random_uuid() unique, organization_id uuid not null references public.organizations(id),
 driver_id uuid not null references public.profiles(id), kind text not null check(kind in ('delivery','fixed','bonus','deduction','payment')),
 amount numeric(12,2) not null check(amount>0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 source_attempt_id bigint unique references public.delivery_attempts(id), shipment_id bigint references public.shipments(id),
 description text not null check(length(description) between 2 and 500), recorded_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), check((kind='delivery')=(source_attempt_id is not null))
);
create unique index driver_earnings_delivery_once on public.driver_earnings(shipment_id) where kind='delivery';
create index driver_earnings_driver_date on public.driver_earnings(driver_id,created_at desc,id desc);
create function private.guard_driver_money() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=new.driver_id and p.role='driver' and p.organization_id=new.organization_id) then raise exception 'Driver does not belong to this organization'; end if;
 if tg_table_name='driver_pay_terms' then new.updated_at:=now(); end if;
 return new;
end; $$;
create trigger driver_pay_terms_guard before insert or update on public.driver_pay_terms for each row execute function private.guard_driver_money();
create trigger driver_earnings_guard before insert on public.driver_earnings for each row execute function private.guard_driver_money();
revoke all on function private.guard_driver_money() from public,anon,authenticated;
alter table public.driver_pay_terms enable row level security;
alter table public.driver_earnings enable row level security;
grant select,insert,update on public.driver_pay_terms to authenticated;
grant select,insert on public.driver_earnings to authenticated;
create policy driver_pay_terms_read on public.driver_pay_terms for select to authenticated using(organization_id=(select private.current_organization_id()) and ((driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_manage_finance())));
create policy driver_pay_terms_create on public.driver_pay_terms for insert to authenticated with check(organization_id=(select private.current_organization_id()) and (select private.can_manage_finance()));
create policy driver_pay_terms_update on public.driver_pay_terms for update to authenticated using(organization_id=(select private.current_organization_id()) and (select private.can_manage_finance())) with check(organization_id=(select private.current_organization_id()) and (select private.can_manage_finance()));
create policy driver_earnings_read on public.driver_earnings for select to authenticated using(organization_id=(select private.current_organization_id()) and ((driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_manage_finance())));
create policy driver_earnings_manual on public.driver_earnings for insert to authenticated with check(organization_id=(select private.current_organization_id()) and (select private.can_manage_finance()) and recorded_by=(select auth.uid()) and kind<>'delivery' and source_attempt_id is null and shipment_id is null);
create function private.accrue_driver_commission() returns trigger language plpgsql security definer set search_path='' as $$
declare terms public.driver_pay_terms%rowtype;
begin
 if new.outcome<>'delivered' then return new; end if;
 select t.* into terms from public.driver_pay_terms t join public.profiles p on p.id=t.driver_id where t.driver_id=new.performed_by and t.organization_id=new.organization_id and p.role='driver' and p.status='active';
 if terms.mode in ('per_delivery','mixed') and terms.delivery_rate>0 then
  insert into public.driver_earnings(organization_id,driver_id,kind,amount,currency,source_attempt_id,shipment_id,description,recorded_by)
  values(new.organization_id,new.performed_by,'delivery',terms.delivery_rate,terms.currency,new.id,new.shipment_id,'Delivery commission',new.performed_by)
  on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function private.accrue_driver_commission() from public,anon,authenticated;
create trigger delivery_attempts_driver_commission after insert on public.delivery_attempts for each row execute function private.accrue_driver_commission();

create table public.driver_custody_scans (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
 driver_id uuid not null references public.profiles(id), manifest_id bigint not null references public.pickup_manifests(id),
 shipment_id bigint not null references public.shipments(id), stage text not null check(stage in ('pickup','hub_handover')),
 scanned_at timestamptz not null default now(), unique(manifest_id,shipment_id,stage)
);
create index driver_custody_scans_driver on public.driver_custody_scans(driver_id,scanned_at desc);
alter table public.driver_custody_scans enable row level security;
grant select on public.driver_custody_scans to authenticated;
create policy driver_custody_read on public.driver_custody_scans for select to authenticated using(organization_id=(select private.current_organization_id()) and ((driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_process_pickups())));
create function public.record_driver_custody_scan(target_manifest bigint, tracking text, scan_stage text) returns void language plpgsql security definer set search_path='' as $$
declare m public.pickup_manifests%rowtype; sid bigint;
begin
 if not (select private.is_active_mobile_driver()) then raise exception 'Active driver required'; end if;
 select * into m from public.pickup_manifests where id=target_manifest for update;
 if m.assigned_driver_id is distinct from (select auth.uid()) or m.organization_id is distinct from (select private.current_organization_id()) then raise exception 'Pickup is not assigned to you'; end if;
 if (scan_stage='pickup' and m.status<>'ready_for_pickup') or (scan_stage='hub_handover' and m.status not in ('picked_up','partially_received')) or scan_stage not in ('pickup','hub_handover') then raise exception 'Scan is unavailable for this pickup state'; end if;
 select s.id into sid from public.pickup_manifest_items i join public.shipments s on s.id=i.shipment_id where i.manifest_id=m.id and upper(s.tracking_number)=upper(btrim(tracking)) and s.organization_id=m.organization_id and s.deleted_at is null;
 if sid is null then raise exception 'AWB does not belong to this pickup'; end if;
 insert into public.driver_custody_scans(organization_id,driver_id,manifest_id,shipment_id,stage) values(m.organization_id,(select auth.uid()),m.id,sid,scan_stage) on conflict do nothing;
end; $$;
create function public.complete_driver_pickup(target_manifest bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.pickup_manifests%rowtype;
begin
 if not (select private.is_active_mobile_driver()) then raise exception 'Active driver required'; end if;
 select * into m from public.pickup_manifests where id=target_manifest for update;
 if m.assigned_driver_id is distinct from (select auth.uid()) or m.organization_id is distinct from (select private.current_organization_id()) then raise exception 'Pickup is not assigned to you'; end if;
 if m.status='picked_up' then return; end if;
 if m.status<>'ready_for_pickup' then raise exception 'Pickup is no longer pending'; end if;
 if not exists(select 1 from public.pickup_manifest_items where manifest_id=m.id) or exists(select 1 from public.pickup_manifest_items i where i.manifest_id=m.id and not exists(select 1 from public.driver_custody_scans c where c.manifest_id=m.id and c.shipment_id=i.shipment_id and c.stage='pickup' and c.driver_id=(select auth.uid()))) then raise exception 'Scan every assigned parcel before completing pickup'; end if;
 update public.pickup_manifests set status='picked_up' where id=m.id;
end; $$;
revoke all on function public.record_driver_custody_scan(bigint,text,text), public.complete_driver_pickup(bigint) from public,anon;
grant execute on function public.record_driver_custody_scan(bigint,text,text), public.complete_driver_pickup(bigint) to authenticated;

create table public.driver_support_tickets (
 id uuid primary key, organization_id uuid not null references public.organizations(id), driver_id uuid not null references public.profiles(id),
 category text not null check(category in ('damage','dispute','address','reattempt','other')), tracking_number text,
 subject text not null check(length(subject) between 3 and 120), status text not null default 'open' check(status in ('open','reviewing','resolved')),
 created_at timestamptz not null default now()
);
create table public.driver_support_messages (
 id uuid primary key, ticket_id uuid not null references public.driver_support_tickets(id), author_id uuid not null references public.profiles(id),
 body text not null check(length(body) between 1 and 2000), created_at timestamptz not null default now()
);
create index driver_support_ticket_driver on public.driver_support_tickets(driver_id,created_at desc);
create index driver_support_ticket_org on public.driver_support_tickets(organization_id,created_at desc);
create index driver_support_message_ticket on public.driver_support_messages(ticket_id,created_at,id);
create function private.can_access_driver_ticket(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.driver_support_tickets t where t.id=target and t.organization_id=(select private.current_organization_id()) and ((t.driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_manage_driver_support())));
$$;
revoke all on function private.can_access_driver_ticket(uuid) from public,anon;
grant execute on function private.can_access_driver_ticket(uuid) to authenticated;
alter table public.driver_support_tickets enable row level security;
alter table public.driver_support_messages enable row level security;
grant select,insert on public.driver_support_tickets to authenticated;
grant update(status) on public.driver_support_tickets to authenticated;
grant select,insert on public.driver_support_messages to authenticated;
create policy driver_ticket_read on public.driver_support_tickets for select to authenticated using((select private.can_access_driver_ticket(id)));
create policy driver_ticket_create on public.driver_support_tickets for insert to authenticated with check(organization_id=(select private.current_organization_id()) and driver_id=(select auth.uid()) and (select private.is_active_mobile_driver()) and status='open');
create policy driver_ticket_status on public.driver_support_tickets for update to authenticated using(organization_id=(select private.current_organization_id()) and (select private.can_manage_driver_support())) with check(organization_id=(select private.current_organization_id()) and (select private.can_manage_driver_support()));
create policy driver_message_read on public.driver_support_messages for select to authenticated using((select private.can_access_driver_ticket(ticket_id)));
create policy driver_message_create on public.driver_support_messages for insert to authenticated with check(author_id=(select auth.uid()) and (select private.can_access_driver_ticket(ticket_id)));

create table public.driver_bank_details (
 driver_id uuid primary key references public.profiles(id), organization_id uuid not null references public.organizations(id),
 bank_name text not null check(length(bank_name) between 2 and 100), account_holder text not null check(length(account_holder) between 2 and 120),
 account_number text not null check(length(account_number) between 5 and 80), updated_at timestamptz not null default now()
);
alter table public.driver_bank_details enable row level security;
grant select,insert,update on public.driver_bank_details to authenticated;
create policy driver_bank_read on public.driver_bank_details for select to authenticated using(organization_id=(select private.current_organization_id()) and ((driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_manage_finance())));
create policy driver_bank_create on public.driver_bank_details for insert to authenticated with check(organization_id=(select private.current_organization_id()) and driver_id=(select auth.uid()) and (select private.is_active_mobile_driver()));
create policy driver_bank_update on public.driver_bank_details for update to authenticated using(organization_id=(select private.current_organization_id()) and driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) with check(organization_id=(select private.current_organization_id()) and driver_id=(select auth.uid()) and (select private.is_active_mobile_driver()));

create table public.driver_documents (
 id uuid primary key, organization_id uuid not null references public.organizations(id), driver_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('identity','licence','vehicle')), path text not null unique, created_at timestamptz not null default now(),
 check(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'), check(split_part(path,'/',1)=organization_id::text and split_part(path,'/',2)=driver_id::text)
);
alter table public.driver_documents enable row level security;
grant select,insert on public.driver_documents to authenticated;
create policy driver_documents_read on public.driver_documents for select to authenticated using(organization_id=(select private.current_organization_id()) and ((driver_id=(select auth.uid()) and (select private.is_active_mobile_driver())) or (select private.can_manage_driver_support())));
create policy driver_documents_create on public.driver_documents for insert to authenticated with check(organization_id=(select private.current_organization_id()) and driver_id=(select auth.uid()) and (select private.is_active_mobile_driver()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('driver-documents','driver-documents',false,5242880,array['image/jpeg']);
create policy driver_document_upload on storage.objects for insert to authenticated with check(bucket_id='driver-documents' and (storage.foldername(name))[1]=(select private.current_organization_id())::text and (storage.foldername(name))[2]=(select auth.uid())::text and (select private.is_active_mobile_driver()));
create policy driver_document_read on storage.objects for select to authenticated using(bucket_id='driver-documents' and (storage.foldername(name))[1]=(select private.current_organization_id())::text and (((storage.foldername(name))[2]=(select auth.uid())::text and (select private.is_active_mobile_driver())) or (select private.can_manage_driver_support())));
create policy driver_document_cleanup on storage.objects for delete to authenticated using(bucket_id='driver-documents' and (storage.foldername(name))[1]=(select private.current_organization_id())::text and (storage.foldername(name))[2]=(select auth.uid())::text and (select private.is_active_mobile_driver()));

create or replace function private.guard_pickup_manifest_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  received_items integer;
begin
  if new.organization_id is distinct from old.organization_id
    or new.manifest_number is distinct from old.manifest_number
    or new.shipper_id is distinct from old.shipper_id
    or new.shipper_name is distinct from old.shipper_name
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Manifest identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    if old.status='ready_for_pickup' and (select private.can_process_pickups())
      and new.assigned_driver_id is distinct from old.assigned_driver_id
      and (to_jsonb(new)-array['assigned_driver_id','updated_at'])=(to_jsonb(old)-array['assigned_driver_id','updated_at']) then
      if new.assigned_driver_id is null or not exists(select 1 from public.profiles p where p.id=new.assigned_driver_id and p.organization_id=old.organization_id and p.role='driver' and p.status='active') then raise exception 'Select an active driver from this organization.'; end if;
      if exists(select 1 from public.driver_custody_scans where manifest_id=old.id) then raise exception 'Cannot reassign a pickup after driver scanning starts'; end if;
      return new;
    end if;
    raise exception 'No manifest workflow transition was requested.';
  end if;

  select count(*) into total_items
  from public.pickup_manifest_items i
  where i.manifest_id = old.id;

  if old.status = 'draft' and new.status = 'ready_for_pickup' then
    if not ((select private.can_manage_shipments()) or old.created_by = (select auth.uid())) then
      raise exception 'You cannot submit this pickup manifest.';
    end if;
    if total_items = 0 then
      raise exception 'Add at least one AWB before submitting the manifest.';
    end if;
    if exists (
      select 1
      from public.pickup_manifest_items i
      join public.shipments s on s.id = i.shipment_id
      where i.manifest_id = old.id
        and (s.status <> 'booked' or s.deleted_at is not null or s.organization_id <> old.organization_id)
    ) then
      raise exception 'Every AWB must be active and booked before submission.';
    end if;

    new.submitted_at := now();
    new.picked_up_at := null;
    new.picked_up_by := null;
    new.received_at := null;
    new.assigned_driver_id := null;

    update public.shipments s
    set status = 'ready_for_pickup'
    from public.pickup_manifest_items i
    where i.manifest_id = old.id and s.id = i.shipment_id;

  elsif old.status = 'ready_for_pickup' and new.status = 'picked_up' then
    if not (select private.can_process_pickups()) then
      if not (select private.is_active_mobile_driver()) or old.assigned_driver_id is distinct from (select auth.uid())
        or old.organization_id is distinct from (select private.current_organization_id())
        or new.assigned_driver_id is distinct from old.assigned_driver_id
        or exists(select 1 from public.pickup_manifest_items i where i.manifest_id=old.id and not exists(select 1 from public.driver_custody_scans c where c.manifest_id=old.id and c.shipment_id=i.shipment_id and c.stage='pickup' and c.driver_id=(select auth.uid()))) then
        raise exception 'Only assigned drivers with all parcel scans or operations staff can confirm pickup.';
      end if;
    end if;
    if new.assigned_driver_id is not null and not exists (
      select 1 from public.profiles p
      where p.id = new.assigned_driver_id
        and p.organization_id = old.organization_id
        and p.role = 'driver'
        and p.status = 'active'
    ) then
      raise exception 'Select an active driver from this organization.';
    end if;

    new.picked_up_at := now();
    new.picked_up_by := (select auth.uid());
    new.received_at := null;

    update public.shipments s
    set status = 'picked_up',
        assigned_driver_id = coalesce(new.assigned_driver_id, s.assigned_driver_id)
    from public.pickup_manifest_items i
    where i.manifest_id = old.id
      and s.id = i.shipment_id
      and s.status = 'ready_for_pickup';

  elsif old.status in ('picked_up', 'partially_received')
    and new.status in ('partially_received', 'received') then
    if not (select private.can_receive_pickups()) then
      raise exception 'Only warehouse staff can receive pickup manifests.';
    end if;

    select count(*) into received_items
    from public.pickup_manifest_items i
    where i.manifest_id = old.id and i.received_at is not null;

    if new.status = 'partially_received'
      and not (received_items > 0 and received_items < total_items) then
      raise exception 'Manifest receipt progress does not match partially received status.';
    end if;
    if new.status = 'received' and received_items <> total_items then
      raise exception 'All AWBs must be received before closing the manifest.';
    end if;

    new.received_at := case when new.status = 'received' then now() else null end;
  else
    raise exception 'Invalid pickup manifest status transition.';
  end if;

  return new;
end;
$$;

