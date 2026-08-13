-- Controlled AWB archival, audit retention and delegated delete permission.

alter table public.profiles
  add column if not exists can_delete_shipments boolean not null default false;

alter table public.shipments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete restrict,
  add column if not exists delete_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_archive_fields_consistent'
      and conrelid = 'public.shipments'::regclass
  ) then
    alter table public.shipments
      add constraint shipments_archive_fields_consistent check (
        (deleted_at is null and deleted_by is null and delete_reason is null)
        or (
          deleted_at is not null
          and deleted_by is not null
          and char_length(delete_reason) between 3 and 500
        )
      );
  end if;
end
$$;

create index if not exists shipments_deleted_by_idx
  on public.shipments (deleted_by)
  where deleted_by is not null;

create index if not exists shipments_active_organization_created_idx
  on public.shipments (organization_id, created_at desc, id desc)
  where deleted_at is null;

drop index if exists public.shipments_organization_reference_unique_idx;
create unique index shipments_organization_reference_unique_idx
  on public.shipments (organization_id, reference_number)
  where reference_number is not null and deleted_at is null;

create or replace function private.can_delete_shipments()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.organization_id is not null
      and (
        p.role = 'super_admin'
        or (
          p.can_delete_shipments
          and p.role in (
            'operations_admin',
            'warehouse_staff',
            'dispatcher',
            'finance_staff',
            'customer_service'
          )
        )
      )
  );
$$;

revoke all on function private.can_delete_shipments() from public;
grant execute on function private.can_delete_shipments() to authenticated;

create or replace function private.guard_shipment_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Archived shipments cannot be modified.';
  end if;

  if new.deleted_at is not null then
    if not (select private.can_delete_shipments()) then
      raise exception 'You do not have permission to archive AWBs.';
    end if;

    if old.status <> 'booked' then
      raise exception 'Only booked AWBs can be archived.';
    end if;

    if new.delete_reason is null
      or char_length(btrim(new.delete_reason)) not between 3 and 500 then
      raise exception 'Archive reason must be between 3 and 500 characters.';
    end if;

    new.deleted_at := now();
    new.deleted_by := (select auth.uid());
    new.delete_reason := btrim(new.delete_reason);
  elsif new.deleted_by is not null or new.delete_reason is not null then
    raise exception 'Archive metadata requires an archive timestamp.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_shipment_archive() from public;

drop trigger if exists shipments_guard_archive on public.shipments;
create trigger shipments_guard_archive
before update on public.shipments
for each row execute function private.guard_shipment_archive();

create or replace function private.record_shipment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'shipment_booked', new.status,
      'Shipment booked and AWB generated.', new.created_by
    );
  elsif old.deleted_at is null and new.deleted_at is not null then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'shipment_archived', old.status, new.status,
      'AWB archived: ' || new.delete_reason, new.deleted_by
    );
  elsif old.status is distinct from new.status then
    insert into public.shipment_events (
      shipment_id, organization_id, event_type, previous_status, new_status, notes, created_by
    ) values (
      new.id, new.organization_id, 'status_changed', old.status, new.status,
      null, (select auth.uid())
    );
  end if;

  return new;
end;
$$;

revoke all on function private.record_shipment_event() from public;

drop trigger if exists shipments_record_archive_event on public.shipments;
create trigger shipments_record_archive_event
after update of deleted_at on public.shipments
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function private.record_shipment_event();

