-- BloomPath Courier V1: organization-scoped identity and access foundation.
-- Authorization is stored in public.profiles; never trust raw_user_meta_data for roles.

create schema if not exists private;

create type public.app_role as enum (
  'super_admin', 'operations_admin', 'warehouse_staff', 'dispatcher',
  'driver', 'finance_staff', 'customer_service', 'shipper'
);

create type public.account_status as enum ('pending', 'active', 'suspended', 'inactive');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  full_name text not null default '',
  email text not null,
  phone text,
  employee_code text,
  role public.app_role not null default 'shipper',
  status public.account_status not null default 'pending',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code),
  constraint active_profile_requires_organization
    check (status <> 'active' or organization_id is not null)
);

create index profiles_organization_role_idx on public.profiles (organization_id, role);
create index profiles_status_idx on public.profiles (status);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

revoke all on public.organizations from anon;
revoke all on public.profiles from anon;
grant select on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
  limit 1;
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
      and p.status = 'active'
  );
$$;

revoke all on function private.current_organization_id() from public;
revoke all on function private.is_super_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_organization_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;

create policy "active users can read their organization"
on public.organizations for select to authenticated
using (id = (select private.current_organization_id()) and is_active);

create policy "users can read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "super admins can read organization profiles"
on public.profiles for select to authenticated
using (
  (select private.is_super_admin())
  and organization_id = (select private.current_organization_id())
);

create policy "super admins can update organization profiles"
on public.profiles for update to authenticated
using (
  (select private.is_super_admin())
  and organization_id = (select private.current_organization_id())
)
with check (
  (select private.is_super_admin())
  and organization_id = (select private.current_organization_id())
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Bootstrap after creating the first Auth user in the Dashboard:
-- 1) insert into public.organizations (name, slug) values ('BloomPath Courier', 'bloompath-courier');
-- 2) update public.profiles set organization_id = '<organization-id>', role = 'super_admin', status = 'active' where email = '<admin-email>';
