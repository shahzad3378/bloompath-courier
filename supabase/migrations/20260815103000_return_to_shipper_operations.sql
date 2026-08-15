-- BloomPath Courier V1
-- Return to Shipper (RTS) operational workflow.

create table public.return_runs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_number text not null unique,
  route_name text not null,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'handed_over', 'completed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  handed_over_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  handed_over_at timestamptz,
  completed_at timestamptz
);

create sequence public.return_run_number_seq
  as bigint
  start with 1001
  increment by 1
  no cycle;

create table public.return_run_items (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id bigint not null references public.return_runs(id) on delete cascade,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default now(),
  completed_at timestamptz,
  proof_path text,
  notes text,
  unique (run_id, shipment_id)
);

create unique index return_run_items_active_shipment_idx
  on public.return_run_items (shipment_id)
  where completed_at is null;

create index return_runs_org_created_idx
  on public.return_runs (organization_id, created_at desc);

create index return_runs_driver_idx
  on public.return_runs (driver_id, status);

create index return_run_items_run_idx
  on public.return_run_items (run_id);

alter table public.return_runs enable row level security;
alter table public.return_run_items enable row level security;

revoke all on public.return_runs from anon, authenticated;
revoke all on public.return_run_items from anon, authenticated;
revoke all on sequence public.return_runs_id_seq from public, anon, authenticated;
revoke all on sequence public.return_run_items_id_seq from public, anon, authenticated;
revoke all on sequence public.return_run_number_seq from public, anon, authenticated;

grant select, insert, update on public.return_runs to authenticated;
grant select, insert, update, delete on public.return_run_items to authenticated;
grant usage on sequence public.return_runs_id_seq to authenticated;
grant usage on sequence public.return_run_items_id_seq to authenticated;
grant usage on sequence public.return_run_number_seq to authenticated;


create or replace function private.guard_return_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception 'Only dispatch staff can create RTS routes.';
  end if;

  if new.organization_id <> (select private.current_organization_id()) then
    raise exception 'Invalid organization.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.driver_id
      and p.organization_id = new.organization_id
      and p.role = 'driver'
      and p.status = 'active'
  ) then
    raise exception 'Selected RTS driver is not active.';
  end if;

  new.run_number :=
    'RTS-' || lpad(nextval('public.return_run_number_seq')::text, 6, '0');

  new.status := 'draft';
  new.created_by := (select auth.uid());
  new.created_at := now();

  return new;
end;
$$;

revoke all on function private.guard_return_run_insert() from public;

create trigger return_runs_guard_insert
before insert on public.return_runs
for each row execute function private.guard_return_run_insert();


create or replace function private.guard_return_item_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.return_runs%rowtype;
  shipment_record public.shipments%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception 'Only dispatch staff can scan RTS AWBs.';
  end if;

  select * into run_record
  from public.return_runs
  where id = new.run_id;

  select * into shipment_record
  from public.shipments
  where id = new.shipment_id
  for update;

  if run_record.id is null
    or run_record.status <> 'draft'
    or run_record.organization_id <> (select private.current_organization_id()) then
    raise exception 'RTS route is not open.';
  end if;

  if shipment_record.id is null
    or shipment_record.organization_id <> run_record.organization_id
    or shipment_record.deleted_at is not null then
    raise exception 'AWB is not available.';
  end if;

  if shipment_record.status <> 'return_initiated'
    or shipment_record.warehouse_received_at is null
    or shipment_record.assigned_driver_id is not null then
    raise exception 'AWB must be physically received at warehouse and ready for RTS.';
  end if;

  -- A normal third-attempt return with shipper-authorized fourth attempt
  -- belongs to delivery dispatch, not RTS.
  if shipment_record.delivery_attempt_count = 3
    and shipment_record.fourth_attempt_authorized then
    raise exception 'AWB has an authorized fourth delivery attempt and cannot enter RTS.';
  end if;

  new.organization_id := run_record.organization_id;
  new.added_by := (select auth.uid());
  new.added_at := now();

  return new;
end;
$$;

revoke all on function private.guard_return_item_insert() from public;

create trigger return_run_items_guard_insert
before insert on public.return_run_items
for each row execute function private.guard_return_item_insert();


create or replace function private.guard_return_run_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  completed_items integer;
begin
  if new.organization_id is distinct from old.organization_id
    or new.run_number is distinct from old.run_number
    or new.route_name is distinct from old.route_name
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'RTS route identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    raise exception 'No RTS workflow transition was requested.';
  end if;

  select count(*),
         count(*) filter (where completed_at is not null)
  into total_items, completed_items
  from public.return_run_items
  where run_id = old.id;

  if old.status = 'draft' and new.status = 'handed_over' then

    if not (select private.can_dispatch_shipments()) then
      raise exception 'Only dispatch staff can hand over RTS routes.';
    end if;

    if total_items = 0 then
      raise exception 'Add at least one RTS AWB before handover.';
    end if;

    if exists (
      select 1
      from public.return_run_items i
      join public.shipments s on s.id = i.shipment_id
      where i.run_id = old.id
        and (
          s.status <> 'return_initiated'
          or s.warehouse_received_at is null
          or s.assigned_driver_id is not null
          or (
            s.delivery_attempt_count = 3
            and s.fourth_attempt_authorized
          )
        )
    ) then
      raise exception 'Every RTS AWB must be physically ready at warehouse.';
    end if;

    new.handed_over_at := now();
    new.handed_over_by := (select auth.uid());
    new.completed_at := null;

    update public.shipments s
    set assigned_driver_id = old.driver_id
    from public.return_run_items i
    where i.run_id = old.id
      and s.id = i.shipment_id;

  elsif old.status = 'handed_over' and new.status = 'completed' then

    if total_items = 0 or completed_items <> total_items then
      raise exception 'Complete every seller return before closing the RTS route.';
    end if;

    new.completed_at := now();

  else
    raise exception 'Invalid RTS route status transition.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_return_run_update() from public;

create trigger return_runs_guard_update
before update on public.return_runs
for each row execute function private.guard_return_run_update();


create or replace function private.guard_return_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.return_runs%rowtype;
  shipment_record public.shipments%rowtype;
  expected_prefix text;
begin
  if old.completed_at is not null then
    raise exception 'This seller return is already completed.';
  end if;

  select * into run_record
  from public.return_runs
  where id = old.run_id
  for update;

  select * into shipment_record
  from public.shipments
  where id = old.shipment_id
  for update;

  if run_record.status <> 'handed_over'
    or run_record.driver_id <> (select auth.uid()) then
    raise exception 'This RTS shipment is not assigned to you.';
  end if;

  if shipment_record.status <> 'return_initiated'
    or shipment_record.assigned_driver_id <> (select auth.uid()) then
    raise exception 'AWB is not assigned for seller return.';
  end if;

  if new.completed_at is null then
    raise exception 'Seller return completion time is required.';
  end if;

  expected_prefix :=
    run_record.organization_id::text || '/' ||
    (select auth.uid())::text || '/';

  if new.proof_path is null
    or new.proof_path not like (expected_prefix || '%')
    or char_length(new.proof_path) > 500 then
    raise exception 'Valid seller POD proof is required.';
  end if;

  new.notes := nullif(btrim(new.notes), '');
  new.completed_at := now();

  update public.shipments
  set status = 'returned_to_shipper',
      assigned_driver_id = null
  where id = shipment_record.id;

  return new;
end;
$$;

revoke all on function private.guard_return_completion() from public;

create trigger return_run_items_guard_update
before update on public.return_run_items
for each row
when (old.completed_at is null and new.completed_at is not null)
execute function private.guard_return_completion();


create or replace function private.sync_return_run_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.return_run_items i
    where i.run_id = new.run_id
      and i.completed_at is null
  ) then
    update public.return_runs
    set status = 'completed'
    where id = new.run_id
      and status = 'handed_over';
  end if;

  return new;
end;
$$;

revoke all on function private.sync_return_run_completion() from public;

create trigger return_run_items_sync_run
after update on public.return_run_items
for each row
when (old.completed_at is null and new.completed_at is not null)
execute function private.sync_return_run_completion();


create policy "authorized users can read return runs"
on public.return_runs
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or driver_id = (select auth.uid())
  )
);

create policy "dispatch staff can create return runs"
on public.return_runs
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and (select private.can_dispatch_shipments())
);

create policy "dispatch staff and assigned driver can update return runs"
on public.return_runs
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_dispatch_shipments())
    or driver_id = (select auth.uid())
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_dispatch_shipments())
    or driver_id = (select auth.uid())
  )
);

create policy "authorized users can read return items"
on public.return_run_items
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or exists (
      select 1
      from public.return_runs r
      where r.id = run_id
        and r.driver_id = (select auth.uid())
    )
  )
);

create policy "dispatch staff can create return items"
on public.return_run_items
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and added_by = (select auth.uid())
  and (select private.can_dispatch_shipments())
);

create policy "dispatch staff can remove draft return items"
on public.return_run_items
for delete
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_dispatch_shipments())
  and exists (
    select 1
    from public.return_runs r
    where r.id = run_id
      and r.status = 'draft'
  )
);

create policy "assigned driver can complete return items"
on public.return_run_items
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.return_runs r
    where r.id = run_id
      and r.driver_id = (select auth.uid())
      and r.status = 'handed_over'
  )
)
with check (
  organization_id = (select private.current_organization_id())
);
