-- Dispatch routes, driver delivery attempts and private proof-of-delivery storage.

create type public.dispatch_run_status as enum ('draft', 'handed_over', 'completed');
create type public.delivery_outcome as enum ('delivered', 'undelivered');

create sequence public.dispatch_run_number_seq as bigint start with 100001 increment by 1 no cycle;

create table public.dispatch_runs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_number text not null unique,
  route_name text not null,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  status public.dispatch_run_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  handed_over_by uuid references public.profiles(id) on delete restrict,
  handed_over_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dispatch_runs_route_name_length check (char_length(route_name) between 2 and 120),
  constraint dispatch_runs_timestamps_consistent check (
    (status = 'draft' and handed_over_at is null and handed_over_by is null and completed_at is null)
    or (status = 'handed_over' and handed_over_at is not null and handed_over_by is not null and completed_at is null)
    or (status = 'completed' and handed_over_at is not null and handed_over_by is not null and completed_at is not null)
  )
);

create table public.dispatch_run_items (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.dispatch_runs(id) on delete cascade,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict,
  outcome public.delivery_outcome,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, shipment_id),
  constraint dispatch_run_items_completion_consistent check ((outcome is null and completed_at is null) or (outcome is not null and completed_at is not null))
);

create table public.delivery_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_item_id bigint not null unique references public.dispatch_run_items(id) on delete restrict,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  attempt_number smallint not null,
  outcome public.delivery_outcome not null,
  undelivered_reason text,
  notes text,
  proof_path text not null unique,
  performed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint delivery_attempts_number_range check (attempt_number between 1 and 4),
  constraint delivery_attempts_reason_consistent check ((outcome = 'delivered' and undelivered_reason is null) or (outcome = 'undelivered' and char_length(undelivered_reason) between 2 and 80)),
  constraint delivery_attempts_notes_length check (notes is null or char_length(notes) <= 500),
  constraint delivery_attempts_proof_path_length check (char_length(proof_path) between 10 and 500)
);

alter table public.shipments
  add column if not exists delivery_attempt_count smallint not null default 0,
  add column if not exists fourth_attempt_authorized boolean not null default false,
  add column if not exists fourth_attempt_authorized_at timestamptz,
  add column if not exists fourth_attempt_authorized_by uuid references public.profiles(id) on delete restrict,
  add column if not exists last_undelivered_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shipments_delivery_attempt_count_range' and conrelid = 'public.shipments'::regclass) then
    alter table public.shipments add constraint shipments_delivery_attempt_count_range check (delivery_attempt_count between 0 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_fourth_attempt_consistent' and conrelid = 'public.shipments'::regclass) then
    alter table public.shipments add constraint shipments_fourth_attempt_consistent check ((not fourth_attempt_authorized and fourth_attempt_authorized_at is null and fourth_attempt_authorized_by is null) or (fourth_attempt_authorized and fourth_attempt_authorized_at is not null and fourth_attempt_authorized_by is not null));
  end if;
end $$;

create unique index dispatch_run_items_active_shipment_idx on public.dispatch_run_items (shipment_id) where completed_at is null;
create index dispatch_runs_organization_created_idx on public.dispatch_runs (organization_id, created_at desc, id desc);
create index dispatch_runs_driver_active_idx on public.dispatch_runs (driver_id, status, created_at desc) where status <> 'completed';
create index dispatch_runs_created_by_idx on public.dispatch_runs (created_by);
create index dispatch_runs_handed_over_by_idx on public.dispatch_runs (handed_over_by) where handed_over_by is not null;
create index dispatch_run_items_run_id_idx on public.dispatch_run_items (run_id, id);
create index dispatch_run_items_added_by_idx on public.dispatch_run_items (added_by);
create index delivery_attempts_shipment_created_idx on public.delivery_attempts (shipment_id, created_at desc, id desc);
create index delivery_attempts_organization_id_idx on public.delivery_attempts (organization_id);
create index delivery_attempts_performed_by_idx on public.delivery_attempts (performed_by);
create index shipments_fourth_attempt_authorized_by_idx on public.shipments (fourth_attempt_authorized_by) where fourth_attempt_authorized_by is not null;

alter table public.dispatch_runs enable row level security;
alter table public.dispatch_run_items enable row level security;
alter table public.delivery_attempts enable row level security;
revoke all on public.dispatch_runs, public.dispatch_run_items, public.delivery_attempts from anon, authenticated;
revoke all on sequence public.dispatch_run_number_seq from public, anon, authenticated;
grant select, insert, update on public.dispatch_runs to authenticated;
grant select, insert, delete on public.dispatch_run_items to authenticated;
grant select, insert on public.delivery_attempts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_dispatch_shipments() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active' and p.organization_id is not null and p.role in ('super_admin', 'operations_admin', 'warehouse_staff', 'dispatcher'));
$$;
revoke all on function private.can_dispatch_shipments() from public;
grant execute on function private.can_dispatch_shipments() to authenticated;

create or replace function private.assign_dispatch_run_number() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.run_number := 'DR' || to_char(clock_timestamp() at time zone 'UTC', 'YYMMDD') || lpad(nextval('public.dispatch_run_number_seq')::text, 6, '0');
  return new;
end;
$$;
revoke all on function private.assign_dispatch_run_number() from public;
create trigger dispatch_runs_assign_number before insert on public.dispatch_runs for each row execute function private.assign_dispatch_run_number();
create trigger dispatch_runs_set_updated_at before update on public.dispatch_runs for each row execute function private.set_updated_at();

create or replace function private.guard_dispatch_run_transition() returns trigger language plpgsql security definer set search_path = '' as $$
declare total_items integer; completed_items integer;
begin
  if new.organization_id is distinct from old.organization_id or new.run_number is distinct from old.run_number or new.route_name is distinct from old.route_name or new.driver_id is distinct from old.driver_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Dispatch route identity fields cannot be changed.'; end if;
  if new.status = old.status then raise exception 'No dispatch workflow transition was requested.'; end if;
  if not (select private.can_dispatch_shipments()) and old.driver_id <> (select auth.uid()) then raise exception 'You cannot update this dispatch route.'; end if;
  select count(*), count(*) filter (where i.completed_at is not null) into total_items, completed_items from public.dispatch_run_items i where i.run_id = old.id;
  if old.status = 'draft' and new.status = 'handed_over' then
    if not (select private.can_dispatch_shipments()) then raise exception 'Only dispatch staff can hand over routes.'; end if;
    if total_items = 0 then raise exception 'Add at least one AWB before driver handover.'; end if;
    if not exists (select 1 from public.profiles p where p.id = old.driver_id and p.organization_id = old.organization_id and p.role = 'driver' and p.status = 'active') then raise exception 'The assigned driver is not active.'; end if;
    if exists (select 1 from public.dispatch_run_items i join public.shipments s on s.id = i.shipment_id where i.run_id = old.id and (s.deleted_at is not null or s.organization_id <> old.organization_id or not (s.status in ('at_warehouse', 'undelivered') or (s.status = 'return_initiated' and s.delivery_attempt_count = 3 and s.fourth_attempt_authorized)))) then raise exception 'Every AWB must be warehouse-ready or approved for reattempt.'; end if;
    new.handed_over_at := now(); new.handed_over_by := (select auth.uid()); new.completed_at := null;
    update public.shipments s set status = 'out_for_delivery', assigned_driver_id = old.driver_id from public.dispatch_run_items i where i.run_id = old.id and s.id = i.shipment_id;
  elsif old.status = 'handed_over' and new.status = 'completed' then
    if total_items = 0 or completed_items <> total_items then raise exception 'Complete every delivery before closing the route.'; end if;
    new.completed_at := now();
  else raise exception 'Invalid dispatch route status transition.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_dispatch_run_transition() from public;
create trigger dispatch_runs_guard_transition before update on public.dispatch_runs for each row execute function private.guard_dispatch_run_transition();

create or replace function private.guard_dispatch_item_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare run_record public.dispatch_runs%rowtype; shipment_record public.shipments%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then raise exception 'Only dispatch staff can scan route AWBs.'; end if;
  select * into run_record from public.dispatch_runs where id = new.run_id;
  select * into shipment_record from public.shipments where id = new.shipment_id;
  if run_record.id is null or run_record.status <> 'draft' or run_record.organization_id <> (select private.current_organization_id()) then raise exception 'Dispatch route is not open.'; end if;
  if shipment_record.id is null or shipment_record.organization_id <> run_record.organization_id or shipment_record.deleted_at is not null then raise exception 'AWB is not available.'; end if;
  if not (shipment_record.status in ('at_warehouse', 'undelivered') or (shipment_record.status = 'return_initiated' and shipment_record.delivery_attempt_count = 3 and shipment_record.fourth_attempt_authorized)) then raise exception 'AWB is not ready for dispatch.'; end if;
  new.added_by := (select auth.uid()); return new;
end;
$$;
revoke all on function private.guard_dispatch_item_insert() from public;
create trigger dispatch_run_items_guard_insert before insert on public.dispatch_run_items for each row execute function private.guard_dispatch_item_insert();

create or replace function private.guard_delivery_attempt() returns trigger language plpgsql security definer set search_path = '' as $$
declare item_record public.dispatch_run_items%rowtype; run_record public.dispatch_runs%rowtype; shipment_record public.shipments%rowtype; expected_prefix text;
begin
  select * into item_record from public.dispatch_run_items where id = new.run_item_id for update;
  select * into run_record from public.dispatch_runs where id = item_record.run_id for update;
  select * into shipment_record from public.shipments where id = item_record.shipment_id for update;
  if run_record.id is null or run_record.status <> 'handed_over' or run_record.driver_id <> (select auth.uid()) then raise exception 'This delivery is not assigned to you.'; end if;
  if item_record.completed_at is not null then raise exception 'This delivery has already been completed.'; end if;
  if shipment_record.status <> 'out_for_delivery' or shipment_record.assigned_driver_id <> (select auth.uid()) then raise exception 'AWB is not out for delivery with this driver.'; end if;
  new.organization_id := run_record.organization_id; new.shipment_id := shipment_record.id; new.performed_by := (select auth.uid()); new.attempt_number := shipment_record.delivery_attempt_count + 1;
  if new.attempt_number > 3 and not (new.attempt_number = 4 and shipment_record.fourth_attempt_authorized) then raise exception 'A fourth attempt requires shipper authorization.'; end if;
  expected_prefix := run_record.organization_id::text || '/' || (select auth.uid())::text || '/';
  if new.proof_path not like (expected_prefix || '%') or char_length(new.proof_path) > 500 then raise exception 'Invalid proof file path.'; end if;
  if new.outcome = 'undelivered' and new.undelivered_reason not in ('customer_unavailable', 'customer_refused', 'wrong_address', 'phone_unreachable', 'reschedule_requested', 'cash_not_ready', 'restricted_access', 'other') then raise exception 'Select a valid undelivered reason.'; end if;
  new.notes := nullif(btrim(new.notes), '');
  update public.dispatch_run_items set outcome = new.outcome, completed_at = now() where id = item_record.id;
  if new.outcome = 'delivered' then
    update public.shipments set status = 'delivered', delivered_at = now(), delivery_attempt_count = new.attempt_number, last_undelivered_reason = null where id = shipment_record.id;
  else
    update public.shipments set status = case when new.attempt_number >= 3 then 'return_initiated'::public.shipment_status else 'undelivered'::public.shipment_status end, delivered_at = null, delivery_attempt_count = new.attempt_number, last_undelivered_reason = new.undelivered_reason, fourth_attempt_authorized = case when new.attempt_number >= 4 then false else fourth_attempt_authorized end, fourth_attempt_authorized_at = case when new.attempt_number >= 4 then null else fourth_attempt_authorized_at end, fourth_attempt_authorized_by = case when new.attempt_number >= 4 then null else fourth_attempt_authorized_by end where id = shipment_record.id;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_delivery_attempt() from public;
create trigger delivery_attempts_guard_insert before insert on public.delivery_attempts for each row execute function private.guard_delivery_attempt();

create or replace function private.sync_dispatch_run_completion() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_run_id bigint;
begin
  select i.run_id into target_run_id from public.dispatch_run_items i where i.id = new.run_item_id;
  if not exists (select 1 from public.dispatch_run_items i where i.run_id = target_run_id and i.completed_at is null) then update public.dispatch_runs set status = 'completed' where id = target_run_id and status = 'handed_over'; end if;
  return new;
end;
$$;
revoke all on function private.sync_dispatch_run_completion() from public;
create trigger delivery_attempts_sync_run after insert on public.delivery_attempts for each row execute function private.sync_dispatch_run_completion();

create or replace function private.guard_fourth_attempt_authorization() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fourth_attempt_authorized is distinct from old.fourth_attempt_authorized or new.fourth_attempt_authorized_at is distinct from old.fourth_attempt_authorized_at or new.fourth_attempt_authorized_by is distinct from old.fourth_attempt_authorized_by then
    if old.fourth_attempt_authorized and not new.fourth_attempt_authorized then
      if new.delivery_attempt_count <> 4 or new.status <> 'return_initiated' then raise exception 'Fourth-attempt authorization cannot be removed.'; end if;
      return new;
    end if;
    if (to_jsonb(new) - array['fourth_attempt_authorized', 'fourth_attempt_authorized_at', 'fourth_attempt_authorized_by', 'updated_at']) is distinct from (to_jsonb(old) - array['fourth_attempt_authorized', 'fourth_attempt_authorized_at', 'fourth_attempt_authorized_by', 'updated_at']) then raise exception 'Only fourth-attempt authorization may be changed.'; end if;
    if not new.fourth_attempt_authorized or old.fourth_attempt_authorized or old.status <> 'return_initiated' or old.delivery_attempt_count <> 3 then raise exception 'This AWB is not eligible for a fourth attempt.'; end if;
    if not ((select private.can_manage_shipments()) or old.shipper_id = (select auth.uid()) or (old.shipper_id is null and old.created_by = (select auth.uid()))) then raise exception 'You cannot authorize this shipment.'; end if;
    new.fourth_attempt_authorized := true; new.fourth_attempt_authorized_at := now(); new.fourth_attempt_authorized_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.guard_fourth_attempt_authorization() from public;
create trigger shipments_guard_fourth_attempt before update on public.shipments for each row execute function private.guard_fourth_attempt_authorization();

create policy "authorized users can read dispatch runs" on public.dispatch_runs for select to authenticated using (organization_id = (select private.current_organization_id()) and ((select private.can_manage_shipments()) or driver_id = (select auth.uid())));
create policy "dispatch staff can create runs" on public.dispatch_runs for insert to authenticated with check (organization_id = (select private.current_organization_id()) and created_by = (select auth.uid()) and status = 'draft' and (select private.can_dispatch_shipments()));
create policy "dispatch staff and assigned driver can update runs" on public.dispatch_runs for update to authenticated using (organization_id = (select private.current_organization_id()) and ((select private.can_dispatch_shipments()) or driver_id = (select auth.uid()))) with check (organization_id = (select private.current_organization_id()) and ((select private.can_dispatch_shipments()) or driver_id = (select auth.uid())));
create policy "authorized users can read dispatch items" on public.dispatch_run_items for select to authenticated using (exists (select 1 from public.dispatch_runs r where r.id = run_id and r.organization_id = (select private.current_organization_id()) and ((select private.can_manage_shipments()) or r.driver_id = (select auth.uid()))));
create policy "dispatch staff can add route AWBs" on public.dispatch_run_items for insert to authenticated with check ((select private.can_dispatch_shipments()));
create policy "dispatch staff can remove draft AWBs" on public.dispatch_run_items for delete to authenticated using ((select private.can_dispatch_shipments()) and exists (select 1 from public.dispatch_runs r where r.id = run_id and r.status = 'draft' and r.organization_id = (select private.current_organization_id())));
create policy "authorized users can read delivery attempts" on public.delivery_attempts for select to authenticated using (organization_id = (select private.current_organization_id()) and ((select private.can_manage_shipments()) or performed_by = (select auth.uid()) or exists (select 1 from public.shipments s where s.id = shipment_id and (s.shipper_id = (select auth.uid()) or (s.shipper_id is null and s.created_by = (select auth.uid()))))));
create policy "assigned drivers can record delivery attempts" on public.delivery_attempts for insert to authenticated with check (performed_by = (select auth.uid()) and organization_id = (select private.current_organization_id()));
drop policy if exists "internal users can update shipments" on public.shipments;
create policy "authorized users can update shipments" on public.shipments for update to authenticated using (organization_id = (select private.current_organization_id()) and ((select private.can_manage_shipments()) or (status = 'return_initiated' and delivery_attempt_count = 3 and not fourth_attempt_authorized and (shipper_id = (select auth.uid()) or (shipper_id is null and created_by = (select auth.uid())))))) with check (organization_id = (select private.current_organization_id()) and ((select private.can_manage_shipments()) or (fourth_attempt_authorized and (shipper_id = (select auth.uid()) or (shipper_id is null and created_by = (select auth.uid()))))));

drop policy if exists "users can read permitted profiles" on public.profiles;
create policy "users can read permitted profiles" on public.profiles for select to authenticated using (id = (select auth.uid()) or ((select private.is_super_admin()) and organization_id = (select private.current_organization_id())) or ((select private.can_manage_shipments()) and organization_id = (select private.current_organization_id()) and role = 'driver' and status = 'active'));

create policy "drivers can upload delivery proofs" on storage.objects for insert to authenticated with check (bucket_id = 'delivery-proofs' and (storage.foldername(name))[1] = (select private.current_organization_id())::text and (storage.foldername(name))[2] = (select auth.uid())::text and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp') and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver' and p.status = 'active'));
create policy "authorized users can read delivery proofs" on storage.objects for select to authenticated using (bucket_id = 'delivery-proofs' and (storage.foldername(name))[1] = (select private.current_organization_id())::text and (owner_id = (select auth.uid())::text or (select private.can_manage_shipments()) or exists (select 1 from public.delivery_attempts a join public.shipments s on s.id = a.shipment_id where a.proof_path = name and (s.shipper_id = (select auth.uid()) or (s.shipper_id is null and s.created_by = (select auth.uid()))))));
create policy "drivers can remove unlinked delivery proofs" on storage.objects for delete to authenticated using (bucket_id = 'delivery-proofs' and owner_id = (select auth.uid())::text and not exists (select 1 from public.delivery_attempts a where a.proof_path = name));

create or replace function private.record_shipment_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then insert into public.shipment_events (shipment_id, organization_id, event_type, new_status, notes, created_by) values (new.id, new.organization_id, 'shipment_booked', new.status, 'Shipment booked and AWB generated.', new.created_by);
  elsif old.deleted_at is null and new.deleted_at is not null then insert into public.shipment_events (shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by) values (new.id, new.organization_id, 'shipment_archived', old.status, new.status, 'AWB archived: ' || new.delete_reason, new.deleted_by);
  elsif old.status is distinct from new.status then
    insert into public.shipment_events (shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by) values (new.id, new.organization_id, 'status_changed', old.status, new.status,
      case new.status when 'ready_for_pickup' then 'AWB added to a submitted pickup manifest.' when 'picked_up' then 'Shipment picked up from shipper.' when 'at_warehouse' then 'Shipment received at warehouse · ' || coalesce(new.warehouse_location, 'Location pending') when 'out_for_delivery' then 'Shipment handed over to delivery driver.' when 'delivered' then 'Shipment delivered with proof · Attempt ' || new.delivery_attempt_count when 'undelivered' then 'Undelivered · ' || replace(coalesce(new.last_undelivered_reason, 'reason pending'), '_', ' ') || ' · Attempt ' || new.delivery_attempt_count when 'return_initiated' then 'Delivery attempts exhausted; return initiated · Attempt ' || new.delivery_attempt_count else null end, (select auth.uid()));
  end if;
  return new;
end;
$$;
revoke all on function private.record_shipment_event() from public;
