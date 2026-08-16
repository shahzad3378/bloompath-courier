-- BloomPath Courier SaaS
-- Flexible zone-based shipper pricing.
--
-- Existing shipper_rates remains the default/fallback rate card.
-- This table provides optional zone + service-type overrides.

create table public.shipper_zone_rates (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  shipper_id uuid not null
    references public.profiles(id) on delete cascade,

  service_zone_id bigint not null
    references public.service_zones(id) on delete cascade,

  service_type public.service_type not null default 'next_day',

  delivery_rate numeric(12,2) not null default 0
    check (delivery_rate >= 0),

  return_charge_enabled boolean not null default false,

  return_rate numeric(12,2) not null default 0
    check (return_rate >= 0),

  currency text not null
    references public.currencies(code) on delete restrict,

  weight_from_kg numeric(8,3) not null default 0
    check (weight_from_kg >= 0),

  weight_to_kg numeric(8,3)
    check (
      weight_to_kg is null
      or weight_to_kg > weight_from_kg
    ),

  additional_kg_rate numeric(12,2) not null default 0
    check (additional_kg_rate >= 0),

  cod_fee numeric(12,2) not null default 0
    check (cod_fee >= 0),

  is_active boolean not null default true,

  effective_from timestamptz not null default now(),
  effective_to timestamptz,

  created_by uuid
    references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint shipper_zone_rates_period_check
    check (
      effective_to is null
      or effective_to > effective_from
    )
);

create index shipper_zone_rates_lookup_idx
on public.shipper_zone_rates (
  organization_id,
  shipper_id,
  service_zone_id,
  service_type,
  is_active,
  effective_from desc
);

create index shipper_zone_rates_shipper_idx
on public.shipper_zone_rates (
  organization_id,
  shipper_id
);

create index shipper_zone_rates_zone_idx
on public.shipper_zone_rates (
  organization_id,
  service_zone_id
);

alter table public.shipper_zone_rates
enable row level security;

revoke all
on public.shipper_zone_rates
from anon;

grant select, insert, update, delete
on public.shipper_zone_rates
to authenticated;


-- Internal tenant users who manage commercial pricing.
create policy "tenant staff can read zone rates"
on public.shipper_zone_rates
for select
to authenticated
using (
  organization_id = private.current_organization_id()
);


create policy "authorized tenant staff can insert zone rates"
on public.shipper_zone_rates
for insert
to authenticated
with check (
  organization_id = private.current_organization_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organization_id = shipper_zone_rates.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'finance_staff'
      )
  )
);


create policy "authorized tenant staff can update zone rates"
on public.shipper_zone_rates
for update
to authenticated
using (
  organization_id = private.current_organization_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organization_id = shipper_zone_rates.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'finance_staff'
      )
  )
)
with check (
  organization_id = private.current_organization_id()
);


create policy "authorized tenant staff can delete zone rates"
on public.shipper_zone_rates
for delete
to authenticated
using (
  organization_id = private.current_organization_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.organization_id = shipper_zone_rates.organization_id
      and p.status = 'active'
      and p.role in (
        'super_admin',
        'operations_admin',
        'finance_staff'
      )
  )
);
