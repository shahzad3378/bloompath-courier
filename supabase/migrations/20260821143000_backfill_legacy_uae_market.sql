-- Backfill the UAE market foundation for organizations created before
-- organization-level country and currency configuration was introduced.

insert into public.organization_countries (
  organization_id,
  country_code,
  is_primary,
  is_active
)
select
  organization.id,
  'AE',
  true,
  true
from public.organizations as organization
where not exists (
  select 1
  from public.organization_countries as configured_country
  where configured_country.organization_id = organization.id
)
on conflict (organization_id, country_code) do nothing;

insert into public.organization_currencies (
  organization_id,
  currency_code,
  is_base,
  is_active
)
select
  organization.id,
  'AED',
  true,
  true
from public.organizations as organization
where not exists (
  select 1
  from public.organization_currencies as configured_currency
  where configured_currency.organization_id = organization.id
)
on conflict (organization_id, currency_code) do nothing;
