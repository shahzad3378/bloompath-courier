-- BloomPath Courier V1
-- Reverse AWB support + tenant-aware AWB prefixes.

alter table public.shipments
add column if not exists shipment_flow text not null default 'forward'
check (
  shipment_flow in (
    'forward',
    'reverse_pickup'
  )
);

alter table public.shipments
add column if not exists reverse_order_id bigint
references public.reverse_orders(id)
on delete restrict;

create unique index if not exists
shipments_reverse_order_unique_idx
on public.shipments(reverse_order_id)
where reverse_order_id is not null;


alter table public.reverse_orders
add column if not exists reverse_shipment_id bigint
references public.shipments(id)
on delete restrict;

create unique index if not exists
reverse_orders_reverse_shipment_unique_idx
on public.reverse_orders(reverse_shipment_id)
where reverse_shipment_id is not null;


-- Fix AWB generation:
-- use organization-specific prefix instead of hard-coded BP.
-- Reverse AWBs get an R marker after the tenant prefix.
create or replace function private.assign_shipment_tracking_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_prefix text;
  flow_marker text := '';
begin
  select upper(os.awb_prefix)
  into configured_prefix
  from public.organization_settings os
  where os.organization_id = new.organization_id
  limit 1;

  configured_prefix :=
    coalesce(
      nullif(btrim(configured_prefix), ''),
      'BP'
    );

  if new.shipment_flow = 'reverse_pickup' then
    flow_marker := 'R';
  end if;

  new.tracking_number :=
    configured_prefix
    || flow_marker
    || to_char(
      clock_timestamp() at time zone 'UTC',
      'YYMMDD'
    )
    || lpad(
      nextval('public.shipment_tracking_seq')::text,
      8,
      '0'
    );

  return new;
end;
$$;

revoke all
on function private.assign_shipment_tracking_number()
from public;
