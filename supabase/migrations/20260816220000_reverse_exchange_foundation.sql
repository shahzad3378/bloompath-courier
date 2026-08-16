-- BloomPath Courier V1
-- Reverse Pickup & Exchange foundation.
--
-- IMPORTANT:
-- This workflow is separate from failed-delivery RTO.
--
-- Reverse Pickup:
-- Delivered order -> customer pickup -> warehouse -> shipper
--
-- Exchange:
-- Replacement shipment delivered + old item collected
-- -> warehouse -> shipper.

create type public.reverse_order_type as enum (
  'reverse_pickup',
  'exchange'
);

create type public.reverse_order_status as enum (
  'requested',
  'ready_for_assignment',
  'assigned',
  'out_for_pickup',
  'collected',
  'warehouse_received',
  'return_ready',
  'out_for_return',
  'returned_to_shipper',
  'completed',
  'cancelled'
);

create sequence public.reverse_order_number_seq
  as bigint
  start with 100001
  increment by 1
  no cycle;


create table public.reverse_orders (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  reverse_number text not null unique,

  order_type public.reverse_order_type not null,

  status public.reverse_order_status not null
    default 'requested',

  -- Seller who owns the original shipment.
  shipper_id uuid not null
    references public.profiles(id)
    on delete restrict,

  -- Original successfully delivered shipment.
  original_shipment_id bigint not null
    references public.shipments(id)
    on delete restrict,

  -- Only required for Exchange.
  -- This is the new/replacement forward AWB.
  replacement_shipment_id bigint
    references public.shipments(id)
    on delete restrict,

  assigned_driver_id uuid
    references public.profiles(id)
    on delete restrict,

  -- Customer collection address snapshot.
  customer_name text not null,
  customer_phone text not null,
  customer_alt_phone text,

  pickup_address text not null,
  pickup_city text not null,
  pickup_area text,

  country_code text
    references public.countries(code)
    on delete restrict,

  postal_code text,

  service_zone_id bigint
    references public.service_zones(id)
    on delete restrict,

  service_zone_name text,

  -- What needs to come back from customer.
  expected_item_description text,
  expected_pieces smallint not null default 1
    check (expected_pieces between 1 and 999),

  reason text,
  customer_notes text,
  internal_notes text,

  -- Exchange behaviour.
  collection_required boolean not null default true,

  -- Normally false.
  -- Allows replacement delivery even if customer does not
  -- hand over old item, but only when explicitly authorized.
  deliver_without_collection_authorized boolean
    not null default false,

  deliver_without_collection_authorized_by uuid
    references public.profiles(id)
    on delete restrict,

  deliver_without_collection_authorized_at timestamptz,

  requested_by uuid not null
    references public.profiles(id)
    on delete restrict,

  requested_at timestamptz not null default now(),

  assigned_at timestamptz,
  collected_at timestamptz,
  warehouse_received_at timestamptz,
  returned_to_shipper_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  -- Driver proof when item is collected from customer.
  collection_proof_path text,

  -- Warehouse proof / condition image if required.
  warehouse_proof_path text,

  -- Seller handover POD.
  shipper_pod_path text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reverse_orders_exchange_replacement_check
    check (
      order_type <> 'exchange'
      or replacement_shipment_id is not null
    ),

  constraint reverse_orders_distinct_shipments_check
    check (
      replacement_shipment_id is null
      or replacement_shipment_id <> original_shipment_id
    ),

  constraint reverse_orders_authorization_check
    check (
      deliver_without_collection_authorized = false
      or (
        order_type = 'exchange'
        and deliver_without_collection_authorized_by is not null
        and deliver_without_collection_authorized_at is not null
      )
    )
);


create table public.reverse_order_events (
  id bigint generated always as identity primary key,

  reverse_order_id bigint not null
    references public.reverse_orders(id)
    on delete cascade,

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  event_type text not null,

  previous_status public.reverse_order_status,
  new_status public.reverse_order_status,

  notes text,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now()
);


create index reverse_orders_org_created_idx
on public.reverse_orders (
  organization_id,
  created_at desc
);

create index reverse_orders_shipper_idx
on public.reverse_orders (
  organization_id,
  shipper_id,
  status
);

create index reverse_orders_driver_idx
on public.reverse_orders (
  organization_id,
  assigned_driver_id,
  status
)
where assigned_driver_id is not null;

create index reverse_orders_original_shipment_idx
on public.reverse_orders (
  original_shipment_id
);

create index reverse_orders_replacement_shipment_idx
on public.reverse_orders (
  replacement_shipment_id
)
where replacement_shipment_id is not null;

create index reverse_order_events_order_idx
on public.reverse_order_events (
  reverse_order_id,
  created_at,
  id
);


-- Avoid duplicate active reverse/exchange requests for
-- the same original AWB and operation type.
create unique index reverse_orders_active_original_type_idx
on public.reverse_orders (
  organization_id,
  original_shipment_id,
  order_type
)
where status not in (
  'completed',
  'cancelled'
);


alter table public.reverse_orders
enable row level security;

alter table public.reverse_order_events
enable row level security;


revoke all
on public.reverse_orders
from anon;

revoke all
on public.reverse_order_events
from anon;


grant select, insert, update
on public.reverse_orders
to authenticated;

grant select
on public.reverse_order_events
to authenticated;


-- Tenant isolation.
create policy "organization users can read reverse orders"
on public.reverse_orders
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
);


create policy "organization users can read reverse events"
on public.reverse_order_events
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
);


-- Operational staff can create reverse/exchange jobs.
-- Shipper creation will be added through guarded app logic.
create policy "authorized staff can create reverse orders"
on public.reverse_orders
for insert
to authenticated
with check (
  organization_id =
    (select private.current_organization_id())
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organization_id =
        reverse_orders.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'warehouse_staff',
        'dispatcher',
        'customer_service'
      )
  )
);


create policy "authorized staff can update reverse orders"
on public.reverse_orders
for update
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organization_id =
        reverse_orders.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'warehouse_staff',
        'dispatcher'
      )
  )
)
with check (
  organization_id =
    (select private.current_organization_id())
);


-- Generate reverse/exchange reference automatically.
create or replace function private.prepare_reverse_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  original_record public.shipments%rowtype;
  replacement_record public.shipments%rowtype;
begin
  select *
  into original_record
  from public.shipments
  where id = new.original_shipment_id;

  if original_record.id is null then
    raise exception 'Original AWB was not found.';
  end if;

  if original_record.organization_id <> new.organization_id then
    raise exception 'Original AWB belongs to another organization.';
  end if;

  if original_record.shipper_id is null
    or original_record.shipper_id <> new.shipper_id then
    raise exception 'Original AWB does not belong to the selected shipper.';
  end if;

  -- Reverse/exchange starts from a previously delivered order.
  if original_record.status <> 'delivered' then
    raise exception
      'Reverse pickup or exchange can only be created from a delivered AWB.';
  end if;

  if new.order_type = 'exchange' then

    if new.replacement_shipment_id is null then
      raise exception
        'Exchange requires a replacement AWB.';
    end if;

    select *
    into replacement_record
    from public.shipments
    where id = new.replacement_shipment_id;

    if replacement_record.id is null then
      raise exception
        'Replacement AWB was not found.';
    end if;

    if replacement_record.organization_id <> new.organization_id
      or replacement_record.shipper_id <> new.shipper_id then
      raise exception
        'Replacement AWB must belong to the same shipper and organization.';
    end if;

    if replacement_record.status not in (
      'booked',
      'ready_for_pickup',
      'picked_up',
      'at_warehouse'
    ) then
      raise exception
        'Replacement AWB is not available for exchange.';
    end if;

  else
    new.replacement_shipment_id := null;
  end if;

  new.reverse_number :=
    case
      when new.order_type = 'exchange'
        then 'EXC-'
      else 'REV-'
    end ||
    lpad(
      nextval(
        'public.reverse_order_number_seq'
      )::text,
      7,
      '0'
    );

  new.requested_by := auth.uid();
  new.requested_at := now();
  new.created_at := now();
  new.updated_at := now();
  new.status := 'requested';

  return new;
end;
$$;


create trigger reverse_orders_prepare_insert
before insert
on public.reverse_orders
for each row
execute function private.prepare_reverse_order();


-- Basic audit trail.
create or replace function private.audit_reverse_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then

    insert into public.reverse_order_events (
      reverse_order_id,
      organization_id,
      event_type,
      new_status,
      notes,
      created_by
    )
    values (
      new.id,
      new.organization_id,
      'reverse_requested',
      new.status,
      case
        when new.order_type = 'exchange'
          then 'Exchange order requested.'
        else 'Reverse pickup requested.'
      end,
      auth.uid()
    );

  elsif tg_op = 'UPDATE'
    and old.status is distinct from new.status then

    insert into public.reverse_order_events (
      reverse_order_id,
      organization_id,
      event_type,
      previous_status,
      new_status,
      notes,
      created_by
    )
    values (
      new.id,
      new.organization_id,
      'reverse_status_changed',
      old.status,
      new.status,
      'Reverse / exchange workflow status updated.',
      auth.uid()
    );

  end if;

  return new;
end;
$$;


create trigger reverse_orders_audit_insert
after insert
on public.reverse_orders
for each row
execute function private.audit_reverse_order();

create trigger reverse_orders_audit_update
after update
on public.reverse_orders
for each row
execute function private.audit_reverse_order();
