-- BloomPath Courier V1
-- Driver operational profile

create table public.driver_profiles (
  driver_id uuid primary key
    references public.profiles(id) on delete cascade,

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  vehicle_number text,
  plate_number text,
  driving_licence_number text,
  licence_expiry date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index driver_profiles_org_idx
on public.driver_profiles (organization_id, driver_id);

alter table public.driver_profiles enable row level security;

revoke all on public.driver_profiles from anon;
grant select, insert, update on public.driver_profiles to authenticated;

create policy "organization staff can read driver profiles"
on public.driver_profiles
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
);

create policy "super admin can create driver profiles"
on public.driver_profiles
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_super_admin())
);

create policy "super admin can update driver profiles"
on public.driver_profiles
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

create trigger driver_profiles_set_updated_at
before update on public.driver_profiles
for each row
execute function private.set_updated_at();
