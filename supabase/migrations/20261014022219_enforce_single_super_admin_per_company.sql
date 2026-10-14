-- A company may have at most one account assigned the Super Admin role.
create unique index if not exists profiles_one_super_admin_per_org_idx
  on public.profiles (organization_id)
  where organization_id is not null and role = 'super_admin';
