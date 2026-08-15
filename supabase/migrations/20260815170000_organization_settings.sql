-- BloomPath Courier V1
-- Organization-level company, branding, print and operational settings.

create table public.organization_settings (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,

  legal_name text,
  display_name text,
  contact_email text,
  contact_phone text,
  website text,
  address text,
  city text,
  trn text,

  awb_brand_name text,
  awb_prefix text not null default 'BP'
    check (char_length(awb_prefix) between 2 and 6),

  default_print_format text not null default '4x6'
    check (default_print_format in ('4x6', 'a4')),

  default_print_copies smallint not null default 1
    check (default_print_copies between 1 and 10),

  default_service_type text not null default 'next_day'
    check (default_service_type in ('same_day', 'next_day', 'standard')),

  standard_delivery_attempts smallint not null default 3
    check (standard_delivery_attempts between 1 and 3),

  fourth_attempt_allowed boolean not null default true,

  currency text not null default 'AED'
    check (char_length(currency) = 3),

  default_cod_cycle_days smallint not null default 7
    check (default_cod_cycle_days between 1 and 90),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

revoke all on public.organization_settings from anon;
grant select, insert, update on public.organization_settings to authenticated;

create policy "organization users can read settings"
on public.organization_settings
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
);

create policy "super admin can create organization settings"
on public.organization_settings
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_super_admin())
);

create policy "super admin can update organization settings"
on public.organization_settings
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_super_admin())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_super_admin())
);

create trigger organization_settings_set_updated_at
before update on public.organization_settings
for each row
execute function private.set_updated_at();

insert into public.organization_settings (
  organization_id,
  display_name,
  awb_brand_name
)
select
  id,
  name,
  name
from public.organizations
on conflict (organization_id) do nothing;
