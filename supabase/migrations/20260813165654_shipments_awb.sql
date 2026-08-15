-- BloomPath Courier V1: shipment booking, lifecycle audit and AWB foundation.

create type public.shipment_status as enum (
  'booked',
  'ready_for_pickup',
  'picked_up',
  'at_warehouse',
  'out_for_delivery',
  'delivered',
  'undelivered',
  'return_initiated',
  'returned_to_shipper',
  'cancelled'
);

create type public.payment_type as enum ('cod', 'prepaid');
create type public.service_type as enum ('same_day', 'next_day', 'standard');

create sequence public.shipment_tracking_seq
  as bigint
  start with 10000001
  increment by 1
  no cycle;

create table public.shipments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tracking_number text not null unique,
  reference_number text,
  shipper_id uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_driver_id uuid references public.profiles(id) on delete restrict,
  status public.shipment_status not null default 'booked',
  service_type public.service_type not null default 'next_day',
  payment_type public.payment_type not null default 'cod',
  sender_name text not null,
  sender_phone text not null,
  sender_address text not null,
  sender_city text not null,
  consignee_name text not null,
  consignee_phone text not null,
  consignee_alt_phone text,
  consignee_address text not null,
  consignee_city text not null,
  consignee_area text,
  consignee_landmark text,
  pieces smallint not null default 1,
  weight_kg numeric(8,3) not null default 1,
  parcel_description text not null,
  cod_amount numeric(12,2) not null default 0,
  delivery_instructions text,
  booked_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipments_reference_length check (
    reference_number is null or char_length(reference_number) between 1 and 80
  ),
  constraint shipments_sender_name_length check (char_length(sender_name) between 2 and 120),
  constraint shipments_consignee_name_length check (char_length(consignee_name) between 2 and 120),
  constraint shipments_sender_phone_length check (char_length(sender_phone) between 7 and 20),
  constraint shipments_consignee_phone_length check (char_length(consignee_phone) between 7 and 20),
  constraint shipments_alt_phone_length check (
    consignee_alt_phone is null or char_length(consignee_alt_phone) between 7 and 20
  ),
  constraint shipments_sender_address_length check (char_length(sender_address) between 5 and 500),
  constraint shipments_consignee_address_length check (char_length(consignee_address) between 5 and 500),
  constraint shipments_pieces_range check (pieces between 1 and 999),
  constraint shipments_weight_range check (weight_kg > 0 and weight_kg <= 1000),
  constraint shipments_cod_nonnegative check (cod_amount >= 0),
  constraint shipments_payment_amount check (payment_type = 'cod' or cod_amount = 0),
  constraint shipments_delivery_timestamp check (
    (status = 'delivered' and delivered_at is not null)
    or (status <> 'delivered' and delivered_at is null)
  )
);

create table public.shipment_events (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null,
  previous_status public.shipment_status,
  new_status public.shipment_status,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shipment_events_type_length check (char_length(event_type) between 2 and 60),
  constraint shipment_events_notes_length check (notes is null or char_length(notes) <= 1000)
);

create index shipments_organization_created_idx
  on public.shipments (organization_id, created_at desc, id desc);
create unique index shipments_organization_reference_unique_idx
  on public.shipments (organization_id, reference_number)
  where reference_number is not null;
create index shipments_organization_status_created_idx
  on public.shipments (organization_id, status, created_at desc);
create index shipments_shipper_id_idx on public.shipments (shipper_id);
create index shipments_created_by_idx on public.shipments (created_by);
create index shipments_assigned_driver_id_idx
  on public.shipments (assigned_driver_id)
  where assigned_driver_id is not null;
create index shipment_events_shipment_created_idx
  on public.shipment_events (shipment_id, created_at, id);
create index shipment_events_organization_id_idx
  on public.shipment_events (organization_id);

alter table public.shipments enable row level security;
alter table public.shipment_events enable row level security;

revoke all on public.shipments from anon;
revoke all on public.shipment_events from anon;
revoke all on public.shipments from authenticated;
revoke all on public.shipment_events from authenticated;
revoke all on sequence public.shipment_tracking_seq from public, anon, authenticated;

grant select, insert, update on public.shipments to authenticated;
grant select on public.shipment_events to authenticated;

create or replace function private.can_manage_shipments()
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
      and p.status = 'active'
      and p.organization_id is not null
      and p.role in (
        'super_admin',
        'operations_admin',
        'warehouse_staff',
        'dispatcher',
        'finance_staff',
        'customer_service'
      )
  );
$$;

revoke all on function private.can_manage_shipments() from public;
grant execute on function private.can_manage_shipments() to authenticated;

create or replace function private.assign_shipment_tracking_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.tracking_number := 'BP'
    || to_char(clock_timestamp() at time zone 'UTC', 'YYMMDD')
    || lpad(nextval('public.shipment_tracking_seq')::text, 8, '0');
  return new;
end;
$$;

revoke all on function private.assign_shipment_tracking_number() from public;

create trigger shipments_assign_tracking_number
before insert on public.shipments
for each row execute function private.assign_shipment_tracking_number();

create or replace function private.validate_shipment_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shipper_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = new.shipper_id
      and p.organization_id = new.organization_id
      and p.role = 'shipper'
      and p.status = 'active'
  ) then
    raise exception 'Invalid or inactive shipper for this organization.';
  end if;

  if new.assigned_driver_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = new.assigned_driver_id
      and p.organization_id = new.organization_id
      and p.role = 'driver'
      and p.status = 'active'
  ) then
    raise exception 'Invalid or inactive driver for this organization.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_shipment_participants() from public;

create trigger shipments_validate_participants
before insert or update of organization_id, shipper_id, assigned_driver_id
on public.shipments
for each row execute function private.validate_shipment_participants();

create trigger shipments_set_updated_at
before update on public.shipments
for each row execute function private.set_updated_at();

create or replace function private.record_shipment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_events (
      shipment_id,
      organization_id,
      event_type,
      new_status,
      notes,
      created_by
    ) values (
      new.id,
      new.organization_id,
      'shipment_booked',
      new.status,
      'Shipment booked and AWB generated.',
      new.created_by
    );
  elsif old.status is distinct from new.status then
    insert into public.shipment_events (
      shipment_id,
      organization_id,
      event_type,
      previous_status,
      new_status,
      notes,
      created_by
    ) values (
      new.id,
      new.organization_id,
      'status_changed',
      old.status,
      new.status,
      null,
      (select auth.uid())
    );
  end if;

  return new;
end;
$$;

revoke all on function private.record_shipment_event() from public;

create trigger shipments_record_insert_event
after insert on public.shipments
for each row execute function private.record_shipment_event();

create trigger shipments_record_status_event
after update of status on public.shipments
for each row execute function private.record_shipment_event();

create policy "authorized users can read shipments"
on public.shipments
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or created_by = (select auth.uid())
    or shipper_id = (select auth.uid())
    or assigned_driver_id = (select auth.uid())
  )
);

create policy "authorized users can book shipments"
on public.shipments
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by = (select auth.uid())
  and (
    (select private.can_manage_shipments())
    or shipper_id = (select auth.uid())
  )
);

create policy "internal users can update shipments"
on public.shipments
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
);

create policy "authorized users can read shipment events"
on public.shipment_events
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1
    from public.shipments s
    where s.id = shipment_events.shipment_id
  )
);
