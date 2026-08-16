-- BloomPath Courier V1
-- RTS handovers are shipper-based.
-- Driver assignment will happen later in the operational return dispatch flow.

alter table public.return_runs
alter column driver_id drop not null;


create or replace function private.guard_return_run_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shipper_record public.profiles%rowtype;
begin
  if not (select private.can_dispatch_shipments()) then
    raise exception
      'Only authorized staff can create return handovers.';
  end if;

  if new.organization_id <>
     (select private.current_organization_id()) then
    raise exception 'Invalid organization.';
  end if;

  if new.shipper_id is null then
    raise exception
      'Select a shipper for this return handover.';
  end if;

  select *
  into shipper_record
  from public.profiles p
  where p.id = new.shipper_id
    and p.organization_id = new.organization_id
    and p.role = 'shipper'
    and p.status = 'active';

  if shipper_record.id is null then
    raise exception
      'Selected shipper is not active.';
  end if;

  -- Driver is intentionally not selected at RTS creation.
  new.driver_id := null;

  new.run_number :=
    'RTH-' ||
    lpad(
      nextval('public.return_run_number_seq')::text,
      6,
      '0'
    );

  new.route_name :=
    coalesce(
      nullif(btrim(shipper_record.full_name), ''),
      nullif(btrim(shipper_record.email), ''),
      'Shipper Return'
    );

  new.status := 'draft';
  new.created_by := auth.uid();
  new.created_at := now();

  return new;
end;
$$;
