-- Cast receipt progress to the pickup manifest enum explicitly.

create or replace function private.sync_pickup_manifest_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  received_items integer;
begin
  select count(*), count(*) filter (where i.received_at is not null)
  into total_items, received_items
  from public.pickup_manifest_items i
  where i.manifest_id = new.manifest_id;

  update public.pickup_manifests
  set status = (
    case when received_items = total_items then 'received' else 'partially_received' end
  )::public.pickup_manifest_status
  where id = new.manifest_id;

  return new;
end;
$$;

revoke all on function private.sync_pickup_manifest_receipt() from public;
