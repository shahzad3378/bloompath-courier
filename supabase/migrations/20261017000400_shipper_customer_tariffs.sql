create table public.shipper_tariff_cards (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  shipper_id uuid not null, card_name text not null check (char_length(card_name) between 2 and 160),
  client_account_name text not null check (char_length(client_account_name) between 2 and 160),
  external_account_number text not null check (char_length(external_account_number) between 2 and 80),
  country_code text not null references public.countries(code) on delete restrict, currency text not null references public.currencies(code) on delete restrict,
  source_filename text not null check (char_length(source_filename) <= 240), effective_from date not null, is_active boolean not null default false,
  grid_row_count integer not null default 0 check (grid_row_count >= 0), postal_mapping_count integer not null default 0 check (postal_mapping_count >= 0),
  imported_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), activated_at timestamptz,
  constraint shipper_tariff_cards_id_org_unique unique (id, organization_id),
  constraint shipper_tariff_cards_shipper_org_fkey foreign key (shipper_id, organization_id) references public.profiles(id, organization_id) on delete cascade
);
create unique index shipper_tariff_cards_active_scope_idx on public.shipper_tariff_cards (organization_id, shipper_id, country_code) where is_active;
create index shipper_tariff_cards_lookup_idx on public.shipper_tariff_cards (organization_id, shipper_id, country_code, is_active, effective_from desc);
create table public.shipper_tariff_grid (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade, rate_card_id uuid not null,
  band_code text not null check (char_length(band_code) between 1 and 30), weight_from_kg numeric(10,3) not null check (weight_from_kg >= 0),
  weight_to_kg numeric(10,3) not null check (weight_to_kg > weight_from_kg), rate numeric(12,4) not null check (rate >= 0),
  constraint shipper_tariff_grid_card_org_check foreign key (rate_card_id, organization_id) references public.shipper_tariff_cards(id, organization_id) on delete cascade,
  constraint shipper_tariff_grid_unique unique (rate_card_id, band_code, weight_to_kg)
);
create index shipper_tariff_grid_lookup_idx on public.shipper_tariff_grid (organization_id, rate_card_id, band_code, weight_to_kg);
create table public.shipper_tariff_postal_map (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade, rate_card_id uuid not null,
  postal_prefix text not null check (postal_prefix ~ '^[A-Z0-9]{3}$'), band_code text not null check (char_length(band_code) between 1 and 30),
  constraint shipper_tariff_postal_card_org_check foreign key (rate_card_id, organization_id) references public.shipper_tariff_cards(id, organization_id) on delete cascade,
  constraint shipper_tariff_postal_unique unique (rate_card_id, postal_prefix)
);
create index shipper_tariff_postal_lookup_idx on public.shipper_tariff_postal_map (organization_id, rate_card_id, postal_prefix);
alter table public.shipper_tariff_cards enable row level security;
alter table public.shipper_tariff_grid enable row level security;
alter table public.shipper_tariff_postal_map enable row level security;
revoke all on public.shipper_tariff_cards, public.shipper_tariff_grid, public.shipper_tariff_postal_map from anon;
grant select on public.shipper_tariff_cards, public.shipper_tariff_grid, public.shipper_tariff_postal_map to authenticated;
create policy "staff can read shipper tariff cards" on public.shipper_tariff_cards for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = shipper_tariff_cards.organization_id and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')));
create policy "staff can read shipper tariff grid" on public.shipper_tariff_grid for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = shipper_tariff_grid.organization_id and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')));
create policy "staff can read shipper tariff postal map" on public.shipper_tariff_postal_map for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.organization_id = shipper_tariff_postal_map.organization_id and p.status = 'active' and p.role in ('super_admin','operations_admin','finance_staff')));
