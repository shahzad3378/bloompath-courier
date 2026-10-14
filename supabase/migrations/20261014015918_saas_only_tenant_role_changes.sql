-- Keep tenant roles and organization ownership under SaaS platform control.
-- Authenticated company users may update operational profile fields, but not roles or tenant assignment.
revoke update on public.profiles from authenticated;
grant update (full_name, email, phone, employee_code, status, can_delete_shipments, last_login_at)
on public.profiles to authenticated;

create or replace function private.protect_tenant_profile_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_admin_count integer;
begin
  if new.role is distinct from old.role
     or new.organization_id is distinct from old.organization_id then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'Only the SaaS platform can change a user role or organization.';
    end if;
  end if;

  if old.role = 'super_admin'::public.app_role
     and old.status = 'active'::public.account_status
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'Only the SaaS platform can change Super Admin access.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text, 0));
    select count(*)::integer into active_admin_count
    from public.profiles p
    where p.organization_id = old.organization_id
      and p.role = 'super_admin'::public.app_role
      and p.status = 'active'::public.account_status
      and p.id <> old.id;

    if active_admin_count = 0 then
      raise exception 'Every company must keep at least one active Super Admin.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.protect_tenant_profile_roles() from public;

drop trigger if exists profiles_protect_tenant_roles on public.profiles;
create trigger profiles_protect_tenant_roles
before update on public.profiles
for each row execute function private.protect_tenant_profile_roles();
