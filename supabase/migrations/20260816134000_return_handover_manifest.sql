-- BloomPath Courier V1
-- Consolidated signed Return Handover manifest workflow.

alter table public.return_runs
add column if not exists signed_manifest_path text,
add column if not exists received_by_name text,
add column if not exists manifest_notes text,
add column if not exists manifest_uploaded_by uuid
  references public.profiles(id) on delete restrict,
add column if not exists manifest_uploaded_at timestamptz;


-- Dedicated private storage for signed seller manifests.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'return-manifests',
  'return-manifests',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- Internal operational staff can upload signed manifests.
create policy "return staff can upload signed manifests"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'return-manifests'
  and (storage.foldername(name))[1] =
      (select private.current_organization_id())::text
  and (
    (select private.can_manage_shipments())
    or (select private.can_dispatch_shipments())
  )
);


-- Internal users and the assigned driver can read manifests.
create policy "authorized users can read signed manifests"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'return-manifests'
  and (storage.foldername(name))[1] =
      (select private.current_organization_id())::text
  and (
    (select private.can_manage_shipments())
    or (select private.can_dispatch_shipments())
    or exists (
      select 1
      from public.return_runs r
      where r.signed_manifest_path = name
        and r.organization_id =
            (select private.current_organization_id())
        and r.driver_id = (select auth.uid())
    )
  )
);


-- Allow signed-manifest metadata to be attached while handover
-- remains handed_over. Existing status workflow stays protected.
create or replace function private.guard_return_run_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_items integer;
  completed_items integer;
  manifest_metadata_changed boolean;
begin
  if new.organization_id is distinct from old.organization_id
    or new.run_number is distinct from old.run_number
    or new.route_name is distinct from old.route_name
    or new.shipper_id is distinct from old.shipper_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Return handover identity fields cannot be changed.';
  end if;

  manifest_metadata_changed :=
       new.signed_manifest_path is distinct from old.signed_manifest_path
    or new.received_by_name is distinct from old.received_by_name
    or new.manifest_notes is distinct from old.manifest_notes
    or new.manifest_uploaded_by is distinct from old.manifest_uploaded_by
    or new.manifest_uploaded_at is distinct from old.manifest_uploaded_at;

  -- Permit internal staff to attach the signed consolidated manifest
  -- without changing the handover status yet.
  if new.status = old.status then
    if not manifest_metadata_changed then
      raise exception 'No return workflow transition was requested.';
    end if;

    if old.status <> 'handed_over' then
      raise exception 'Signed manifest can only be attached after driver handover.';
    end if;

    if not (
      (select private.can_manage_shipments())
      or (select private.can_dispatch_shipments())
    ) then
      raise exception 'Only authorized staff can upload the signed return manifest.';
    end if;

    if new.signed_manifest_path is null
      or new.signed_manifest_path not like (
        old.organization_id::text || '/%'
      )
      or char_length(new.signed_manifest_path) > 500 then
      raise exception 'Invalid signed return manifest path.';
    end if;

    new.received_by_name :=
      nullif(btrim(new.received_by_name), '');

    new.manifest_notes :=
      nullif(btrim(new.manifest_notes), '');

    new.manifest_uploaded_by := (select auth.uid());
    new.manifest_uploaded_at := now();

    return new;
  end if;

  select
    count(*),
    count(*) filter (where completed_at is not null)
  into
    total_items,
    completed_items
  from public.return_run_items
  where run_id = old.id;

  if old.status = 'draft'
    and new.status = 'handed_over' then

    if not (select private.can_dispatch_shipments()) then
      raise exception 'Only authorized staff can hand over returns.';
    end if;

    if total_items = 0 then
      raise exception 'Add at least one return AWB before handover.';
    end if;

    if exists (
      select 1
      from public.return_run_items i
      join public.shipments s
        on s.id = i.shipment_id
      where i.run_id = old.id
        and (
          s.status <> 'return_initiated'
          or s.warehouse_received_at is null
          or s.assigned_driver_id is not null
          or (
            s.delivery_attempt_count = 3
            and s.fourth_attempt_authorized
          )
          or (
            old.shipper_id is not null
            and s.shipper_id is distinct from old.shipper_id
          )
        )
    ) then
      raise exception
        'Every return AWB must be warehouse-ready and belong to the selected shipper.';
    end if;

    new.handed_over_at := now();
    new.handed_over_by := (select auth.uid());
    new.completed_at := null;

    update public.shipments s
    set assigned_driver_id = old.driver_id
    from public.return_run_items i
    where i.run_id = old.id
      and s.id = i.shipment_id;

  elsif old.status = 'handed_over'
    and new.status = 'completed' then

    if total_items = 0
      or completed_items <> total_items then
      raise exception
        'Complete every seller return before closing the handover.';
    end if;

    new.completed_at := now();

  else
    raise exception 'Invalid return handover status transition.';
  end if;

  return new;
end;
$$;


-- Existing individual driver POD remains supported.
-- New internal consolidated-manifest completion is also supported.
create or replace function private.guard_return_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.return_runs%rowtype;
  shipment_record public.shipments%rowtype;
  expected_driver_prefix text;
  internal_manifest_completion boolean;
begin
  if old.completed_at is not null then
    raise exception 'This seller return is already completed.';
  end if;

  select *
  into run_record
  from public.return_runs
  where id = old.run_id
  for update;

  select *
  into shipment_record
  from public.shipments
  where id = old.shipment_id
  for update;

  if run_record.status <> 'handed_over' then
    raise exception 'Return handover is not active.';
  end if;

  internal_manifest_completion :=
    (
      (select private.can_manage_shipments())
      or (select private.can_dispatch_shipments())
    )
    and run_record.signed_manifest_path is not null
    and new.proof_path = run_record.signed_manifest_path;

  if not internal_manifest_completion then
    if run_record.driver_id <> (select auth.uid()) then
      raise exception 'This RTS shipment is not assigned to you.';
    end if;

    if shipment_record.status <> 'return_initiated'
      or shipment_record.assigned_driver_id <> (select auth.uid()) then
      raise exception 'AWB is not assigned for seller return.';
    end if;

    expected_driver_prefix :=
      run_record.organization_id::text || '/' ||
      (select auth.uid())::text || '/';

    if new.proof_path is null
      or new.proof_path not like (expected_driver_prefix || '%')
      or char_length(new.proof_path) > 500 then
      raise exception 'Valid seller POD proof is required.';
    end if;
  else
    if shipment_record.status <> 'return_initiated'
      or shipment_record.assigned_driver_id <> run_record.driver_id then
      raise exception 'AWB is not assigned to this return handover.';
    end if;
  end if;

  if new.completed_at is null then
    raise exception 'Seller return completion time is required.';
  end if;

  new.notes := nullif(btrim(new.notes), '');
  new.completed_at := now();

  update public.shipments
  set
    status = 'returned_to_shipper',
    assigned_driver_id = null
  where id = shipment_record.id;

  return new;
end;
$$;
