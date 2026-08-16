-- BloomPath Courier SaaS
-- Tenant branding / company logo support.

alter table public.organization_settings
add column if not exists logo_url text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  array[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tenant admins upload branding" on storage.objects;
drop policy if exists "tenant admins update branding" on storage.objects;
drop policy if exists "tenant admins delete branding" on storage.objects;

create policy "tenant admins upload branding"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tenant-branding'
  and (storage.foldername(name))[1]
      = (select private.current_organization_id())::text
  and (select private.is_super_admin())
);

create policy "tenant admins update branding"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tenant-branding'
  and (storage.foldername(name))[1]
      = (select private.current_organization_id())::text
  and (select private.is_super_admin())
)
with check (
  bucket_id = 'tenant-branding'
  and (storage.foldername(name))[1]
      = (select private.current_organization_id())::text
  and (select private.is_super_admin())
);

create policy "tenant admins delete branding"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-branding'
  and (storage.foldername(name))[1]
      = (select private.current_organization_id())::text
  and (select private.is_super_admin())
);
