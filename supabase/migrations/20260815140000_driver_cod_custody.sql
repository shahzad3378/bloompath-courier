-- BloomPath Courier V1
-- Driver COD custody, finance receipt audit and next-day dispatch restriction.

create or replace function private.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = (select private.current_organization_id())
      and p.status = 'active'
      and p.role in ('super_admin', 'operations_admin', 'finance_staff')
  );
$$;

revoke all on function private.can_manage_finance() from public;
grant execute on function private.can_manage_finance() to authenticated;


create table public.driver_cod_entries (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  shipment_id bigint not null
    references public.shipments(id) on delete restrict,

  driver_id uuid not null
    references public.profiles(id) on delete restrict,

  tracking_number text not null,

  cod_amount numeric(12,2) not null
    check (cod_amount > 0),

  received_amount numeric(12,2) not null default 0
    check (received_amount >= 0),

  outstanding_amount numeric(12,2)
    generated always as (cod_amount - received_amount) stored,

  delivered_at timestamptz not null,

  cleared_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (shipment_id),

  check (received_amount <= cod_amount)
);

create index driver_cod_entries_driver_idx
on public.driver_cod_entries
(organization_id, driver_id, delivered_at desc);

create index driver_cod_entries_outstanding_idx
on public.driver_cod_entries
(organization_id, driver_id)
where received_amount < cod_amount;


create table public.driver_cod_receipts (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  driver_cod_entry_id bigint not null
    references public.driver_cod_entries(id) on delete restrict,

  driver_id uuid not null
    references public.profiles(id) on delete restrict,

  shipment_id bigint not null
    references public.shipments(id) on delete restrict,

  tracking_number text not null,

  amount_received numeric(12,2) not null
    check (amount_received > 0),

  received_by uuid not null
    references public.profiles(id) on delete restrict,

  notes text,

  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index driver_cod_receipts_driver_idx
on public.driver_cod_receipts
(organization_id, driver_id, received_at desc);


alter table public.driver_cod_entries enable row level security;
alter table public.driver_cod_receipts enable row level security;

revoke all on public.driver_cod_entries from anon;
revoke all on public.driver_cod_receipts from anon;

grant select on public.driver_cod_entries to authenticated;
grant select, insert on public.driver_cod_receipts to authenticated;


-- Driver can see own COD custody.
-- Finance/Admin can see all COD custody in their organization.
create policy "authorized users can read driver COD entries"
on public.driver_cod_entries
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    driver_id = (select auth.uid())
    or (select private.can_manage_finance())
  )
);


create policy "authorized users can read driver COD receipts"
on public.driver_cod_receipts
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    driver_id = (select auth.uid())
    or (select private.can_manage_finance())
  )
);


create policy "finance can receive driver COD"
on public.driver_cod_receipts
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and received_by = (select auth.uid())
  and (select private.can_manage_finance())
);


-- Automatically create driver COD custody when a COD AWB is delivered.
create or replace function private.create_driver_cod_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and new.status = 'delivered'
    and new.payment_type = 'cod'
    and new.cod_amount > 0 then

    if new.assigned_driver_id is null then
      raise exception 'Delivered COD AWB % has no assigned driver.', new.tracking_number;
    end if;

    insert into public.driver_cod_entries (
      organization_id,
      shipment_id,
      driver_id,
      tracking_number,
      cod_amount,
      delivered_at
    )
    values (
      new.organization_id,
      new.id,
      new.assigned_driver_id,
      new.tracking_number,
      new.cod_amount,
      coalesce(new.delivered_at, now())
    )
    on conflict (shipment_id) do nothing;

  end if;

  return new;
end;
$$;

revoke all on function private.create_driver_cod_entry() from public;

create trigger shipments_create_driver_cod_entry
after update of status
on public.shipments
for each row
execute function private.create_driver_cod_entry();


-- Finance receipt validation and custody update.
create or replace function private.apply_driver_cod_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cod_record public.driver_cod_entries%rowtype;
begin
  if not (select private.can_manage_finance()) then
    raise exception 'Finance access is required to receive driver COD.';
  end if;

  select *
  into cod_record
  from public.driver_cod_entries
  where id = new.driver_cod_entry_id
  for update;

  if cod_record.id is null
    or cod_record.organization_id <> (select private.current_organization_id()) then
    raise exception 'Driver COD entry was not found.';
  end if;

  if cod_record.outstanding_amount <= 0 then
    raise exception 'This COD entry is already cleared.';
  end if;

  if new.amount_received > cod_record.outstanding_amount then
    raise exception
      'Received amount cannot exceed outstanding COD of AED %.',
      cod_record.outstanding_amount;
  end if;

  new.organization_id := cod_record.organization_id;
  new.driver_id := cod_record.driver_id;
  new.shipment_id := cod_record.shipment_id;
  new.tracking_number := cod_record.tracking_number;
  new.received_by := (select auth.uid());
  new.received_at := now();
  new.notes := nullif(btrim(new.notes), '');

  update public.driver_cod_entries
  set
    received_amount = received_amount + new.amount_received,
    cleared_at = case
      when received_amount + new.amount_received = cod_amount
        then now()
      else null
    end,
    updated_at = now()
  where id = cod_record.id;

  return new;
end;
$$;

revoke all on function private.apply_driver_cod_receipt() from public;

create trigger driver_cod_receipts_apply
before insert
on public.driver_cod_receipts
for each row
execute function private.apply_driver_cod_receipt();


-- Do not hand a NEW delivery route to a driver who still holds COD
-- from an earlier UAE calendar day.
create or replace function private.block_dispatch_for_uncleared_cod()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uncleared_cod numeric(12,2);
begin
  if old.status = 'draft'
    and new.status = 'handed_over' then

    select coalesce(sum(e.outstanding_amount), 0)
    into uncleared_cod
    from public.driver_cod_entries e
    where e.organization_id = old.organization_id
      and e.driver_id = old.driver_id
      and e.outstanding_amount > 0
      and (e.delivered_at at time zone 'Asia/Dubai')::date
          < (now() at time zone 'Asia/Dubai')::date;

    if uncleared_cod > 0 then
      raise exception
        'Driver has uncleared previous-day COD of AED %. Clear COD before assigning a new delivery route.',
        uncleared_cod;
    end if;

  end if;

  return new;
end;
$$;

revoke all on function private.block_dispatch_for_uncleared_cod() from public;

create trigger dispatch_runs_block_uncleared_cod
before update of status
on public.dispatch_runs
for each row
execute function private.block_dispatch_for_uncleared_cod();
