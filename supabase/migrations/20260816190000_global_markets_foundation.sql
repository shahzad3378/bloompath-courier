-- BloomPath Courier SaaS
-- Global countries, currencies and market-location strategy foundation.

create table public.currencies (
  code text primary key
    check (char_length(code) = 3),

  name text not null,
  symbol text,
  decimal_places smallint not null default 2
    check (decimal_places between 0 and 4),

  is_active boolean not null default true,
  created_at timestamptz not null default now()
);


create table public.countries (
  code text primary key
    check (char_length(code) = 2),

  name text not null,
  iso3 text
    check (iso3 is null or char_length(iso3) = 3),

  default_currency_code text
    references public.currencies(code) on delete restrict,

  location_strategy text not null default 'hybrid'
    check (
      location_strategy in (
        'postal_code',
        'zip_code',
        'postcode',
        'city_zone',
        'hybrid'
      )
    ),

  postal_code_label text,
  postal_code_regex text,

  is_active boolean not null default true,
  created_at timestamptz not null default now()
);


create table public.organization_countries (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  country_code text not null
    references public.countries(code) on delete restrict,

  is_primary boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  unique (organization_id, country_code)
);


create unique index organization_countries_primary_idx
on public.organization_countries (organization_id)
where is_primary;


create table public.organization_currencies (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  currency_code text not null
    references public.currencies(code) on delete restrict,

  is_base boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  unique (organization_id, currency_code)
);


create unique index organization_currencies_base_idx
on public.organization_currencies (organization_id)
where is_base;


create table public.service_zones (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  country_code text not null
    references public.countries(code) on delete restrict,

  name text not null,

  zone_type text not null
    check (
      zone_type in (
        'postal_prefix',
        'postal_range',
        'city',
        'district',
        'area',
        'custom'
      )
    ),

  postal_prefix text,
  postal_from text,
  postal_to text,

  city text,
  district text,
  area text,

  is_active boolean not null default true,

  created_at timestamptz not null default now()
);


create index service_zones_org_country_idx
on public.service_zones (
  organization_id,
  country_code,
  is_active
);


-- Seed common global currencies.
insert into public.currencies (
  code,
  name,
  symbol
)
values
  ('AED', 'UAE Dirham', 'AED'),
  ('SAR', 'Saudi Riyal', 'SAR'),
  ('QAR', 'Qatari Riyal', 'QAR'),
  ('KWD', 'Kuwaiti Dinar', 'KWD'),
  ('OMR', 'Omani Rial', 'OMR'),
  ('USD', 'US Dollar', '$'),
  ('CAD', 'Canadian Dollar', 'C$'),
  ('GBP', 'British Pound', '£'),
  ('EUR', 'Euro', '€'),
  ('PKR', 'Pakistani Rupee', 'Rs'),
  ('AUD', 'Australian Dollar', 'A$'),
  ('CHF', 'Swiss Franc', 'CHF')
on conflict (code) do nothing;


-- Seed initial global markets.
insert into public.countries (
  code,
  name,
  iso3,
  default_currency_code,
  location_strategy,
  postal_code_label
)
values
  ('AE', 'United Arab Emirates', 'ARE', 'AED', 'city_zone', 'Area / Zone'),
  ('SA', 'Saudi Arabia', 'SAU', 'SAR', 'hybrid', 'Postal Code'),
  ('QA', 'Qatar', 'QAT', 'QAR', 'city_zone', 'Area / Zone'),
  ('KW', 'Kuwait', 'KWT', 'KWD', 'city_zone', 'Area / Zone'),
  ('OM', 'Oman', 'OMN', 'OMR', 'hybrid', 'Postal Code'),

  ('US', 'United States', 'USA', 'USD', 'zip_code', 'ZIP Code'),
  ('CA', 'Canada', 'CAN', 'CAD', 'postal_code', 'Postal Code'),
  ('GB', 'United Kingdom', 'GBR', 'GBP', 'postcode', 'Postcode'),

  ('PK', 'Pakistan', 'PAK', 'PKR', 'hybrid', 'Postal Code'),

  ('DE', 'Germany', 'DEU', 'EUR', 'postal_code', 'Postal Code'),
  ('FR', 'France', 'FRA', 'EUR', 'postal_code', 'Postal Code'),
  ('IT', 'Italy', 'ITA', 'EUR', 'postal_code', 'Postal Code'),
  ('ES', 'Spain', 'ESP', 'EUR', 'postal_code', 'Postal Code'),
  ('NL', 'Netherlands', 'NLD', 'EUR', 'postal_code', 'Postal Code'),
  ('BE', 'Belgium', 'BEL', 'EUR', 'postal_code', 'Postal Code'),

  ('AU', 'Australia', 'AUS', 'AUD', 'postal_code', 'Postcode'),
  ('CH', 'Switzerland', 'CHE', 'CHF', 'postal_code', 'Postal Code')
on conflict (code) do nothing;


alter table public.currencies enable row level security;
alter table public.countries enable row level security;
alter table public.organization_countries enable row level security;
alter table public.organization_currencies enable row level security;
alter table public.service_zones enable row level security;


grant select on public.currencies to authenticated;
grant select on public.countries to authenticated;

grant select on public.organization_countries to authenticated;
grant select on public.organization_currencies to authenticated;
grant select on public.service_zones to authenticated;


create policy "authenticated users can read active currencies"
on public.currencies
for select
to authenticated
using (is_active);


create policy "authenticated users can read active countries"
on public.countries
for select
to authenticated
using (is_active);


create policy "organization users can read organization countries"
on public.organization_countries
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
);


create policy "organization users can read organization currencies"
on public.organization_currencies
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
);


create policy "organization users can read service zones"
on public.service_zones
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
);
