-- BloomPath Courier V1
-- Shipper commercial / business profile

create table public.shipper_business_profiles (
  shipper_id uuid primary key
    references public.profiles(id) on delete cascade,

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  company_name text not null,
  contact_person text,
  address text,
  city text,

  cod_cycle_days smallint not null default 7
    check (cod_cycle_days between 1 and 90),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipper_business_profiles_org_idx
on public.shipper_business_profiles (organization_id, company_name);

alter table public.shipper_business_profiles enable row level security;

revoke all on public.shipper_business_profiles from anon;
grant select, insert, update on public.shipper_business_profiles to authenticated;


create policy "authorized users can read shipper business profiles"
on public.shipper_business_profiles
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or shipper_id = (select auth.uid())
  )
);


create policy "authorized staff can create shipper business profiles"
on public.shipper_business_profiles
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
);


create policy "authorized staff can update shipper business profiles"
on public.shipper_business_profiles
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
