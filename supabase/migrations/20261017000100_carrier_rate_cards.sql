-- Carrier tariffs and carrier-specific postal zoning are separate from
-- service_zones / shipper_zone_rates, which represent last-mile customer billing.
alter table public.profiles add constraint profiles_id_org_unique unique (id, organization_id);
alter table public.third_party_carriers add constraint third_party_carriers_id_org_unique unique (id, organization_id);

create table public.carrier_rate_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipper_id uuid references public.profiles(id) on delete cascade,
  carrier_id uuid not null references public.third_party_carriers(id) on delete restrict,
  card_name text not null check (char_length(card_name) between 2 and 160),
  country_code text not null references public.countries(code) on delete restrict,
  currency text not null references public.currencies(code) on delete restrict,
  source_filename text not null check (char_length(source_filename) <= 240),
  effective_from date not null,
  import_status text not null default 'importing'
    check (import_status in ('importing', 'active', 'failed')),
  is_active boolean not null default false,
  grid_row_count integer not null default 0 check (grid_row_count >= 0),
  postal_mapping_count integer not null default 0 check (postal_mapping_count >= 0),
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint carrier_rate_cards_id_org_unique unique (id, organization_id),
  constraint carrier_rate_cards_shipper_org_fkey foreign key (shipper_id, organization_id)
    references public.profiles(id, organization_id) on delete cascade,
  constraint carrier_rate_cards_carrier_org_fkey foreign key (carrier_id, organization_id)
    references public.third_party_carriers(id, organization_id) on delete restrict
);

create index carrier_rate_cards_scope_idx
on public.carrier_rate_cards (organization_id, shipper_id, carrier_id, country_code, is_active, effective_from desc);

create table public.carrier_rate_grid (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rate_card_id uuid not null references public.carrier_rate_cards(id) on delete cascade,
  service_code text not null check (char_length(service_code) between 1 and 120),
  origin_terminal text not null default 'ANY' check (char_length(origin_terminal) between 1 and 20),
  zone_code text not null check (char_length(zone_code) between 1 and 30),
  weight_value numeric(10,3) not null check (weight_value > 0),
  weight_unit text not null check (weight_unit in ('kg', 'lb')),
  base_rate numeric(12,4) not null check (base_rate >= 0),
  fuel_surcharge_pct numeric(8,5) not null default 0 check (fuel_surcharge_pct >= 0),
  created_at timestamptz not null default now(),
  constraint carrier_rate_grid_card_org_check foreign key (rate_card_id, organization_id)
    references public.carrier_rate_cards(id, organization_id) on delete cascade,
  constraint carrier_rate_grid_unique unique (rate_card_id, service_code, origin_terminal, zone_code, weight_value, weight_unit)
);

create index carrier_rate_grid_lookup_idx
on public.carrier_rate_grid (organization_id, rate_card_id, service_code, origin_terminal, zone_code, weight_unit, weight_value);

create table public.carrier_postal_zone_map (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rate_card_id uuid not null references public.carrier_rate_cards(id) on delete cascade,
  service_code text not null check (char_length(service_code) between 1 and 120),
  origin_terminal text not null default 'ANY' check (char_length(origin_terminal) between 1 and 20),
  postal_code text not null check (postal_code ~ '^[A-Z0-9]{3,10}$'),
  zone_code text not null check (char_length(zone_code) between 1 and 30),
  created_at timestamptz not null default now(),
  constraint carrier_postal_zone_map_card_org_check foreign key (rate_card_id, organization_id)
    references public.carrier_rate_cards(id, organization_id) on delete cascade,
  constraint carrier_postal_zone_map_unique unique (rate_card_id, service_code, origin_terminal, postal_code)
);

create index carrier_postal_zone_lookup_idx
on public.carrier_postal_zone_map (organization_id, rate_card_id, service_code, origin_terminal, postal_code);

alter table public.carrier_rate_cards enable row level security;
alter table public.carrier_rate_grid enable row level security;
alter table public.carrier_postal_zone_map enable row level security;

revoke all on public.carrier_rate_cards, public.carrier_rate_grid, public.carrier_postal_zone_map from anon;
grant select on public.carrier_rate_cards, public.carrier_rate_grid, public.carrier_postal_zone_map to authenticated;

create policy "staff can read carrier rate cards"
on public.carrier_rate_cards for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.organization_id = carrier_rate_cards.organization_id
      and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')
  )
);

create policy "staff can read carrier rate grid"
on public.carrier_rate_grid for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.organization_id = carrier_rate_grid.organization_id
      and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')
  )
);

create policy "staff can read carrier postal zones"
on public.carrier_postal_zone_map for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.organization_id = carrier_postal_zone_map.organization_id
      and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')
  )
);
