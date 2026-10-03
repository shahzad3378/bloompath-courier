-- Carrier response/labels are internal, separate from customer-facing shipments.
create table public.gta_airskip_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  shipment_id bigint not null references public.shipments(id),
  is_test boolean not null,
  status text not null default 'pending' check (status in ('pending', 'needs_review', 'generated', 'ready')),
  requested_service text not null,
  base_url text not null,
  load_number text,
  partner_tracking_number text,
  label_base64 text,
  label_format text check (label_format in ('png', 'zpl')),
  response_metadata jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, shipment_id, is_test)
);
create index gta_airskip_bookings_shipment_idx on public.gta_airskip_bookings (shipment_id);
create index gta_airskip_bookings_actor_idx on public.gta_airskip_bookings (created_by);
alter table public.gta_airskip_bookings enable row level security;
revoke all on public.gta_airskip_bookings from public, anon, authenticated;
grant select, insert, update on public.gta_airskip_bookings to service_role;

-- Serialize with shipment operations. Only a trusted, role-authorized server calls this.
create function public.reserve_gta_airskip_booking(p_organization_id uuid, p_shipment_id bigint, p_is_test boolean, p_service text, p_base_url text, p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare shipment_record public.shipments%rowtype; booking_id uuid;
begin
  select * into shipment_record from public.shipments
    where id = p_shipment_id and organization_id = p_organization_id and deleted_at is null for update;
  if not found or shipment_record.status not in ('booked', 'ready_for_pickup', 'picked_up', 'at_warehouse')
    or shipment_record.assigned_driver_id is not null then
    raise exception 'Shipment is not eligible for carrier booking.';
  end if;
  if exists (select 1 from public.third_party_shipment_links where shipment_id = p_shipment_id) then
    raise exception 'Shipment already has a delivery partner.';
  end if;
  if not p_is_test and exists (select 1 from public.broadreach_bookings where shipment_id = p_shipment_id and not is_test) then
    raise exception 'Shipment already reserved for another carrier.';
  end if;
  insert into public.gta_airskip_bookings (organization_id, shipment_id, is_test, requested_service, base_url, created_by)
    values (p_organization_id, p_shipment_id, p_is_test, p_service, p_base_url, p_actor) returning id into booking_id;
  return booking_id;
end;
$$;
revoke all on function public.reserve_gta_airskip_booking(uuid, bigint, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_gta_airskip_booking(uuid, bigint, boolean, text, text, uuid) to service_role;

-- Local finalization can be retried without sending another carrier booking.
create function public.finalize_gta_airskip_booking(p_booking_id uuid, p_organization_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare booking public.gta_airskip_bookings%rowtype; carrier_id uuid; linked public.third_party_shipment_links%rowtype;
begin
  -- Lock shipment first, matching the rest of the custody workflow's lock order.
  perform 1 from public.shipments where id = (select shipment_id from public.gta_airskip_bookings where id = p_booking_id and organization_id = p_organization_id) for update;
  select * into booking from public.gta_airskip_bookings where id = p_booking_id and organization_id = p_organization_id for update;
  if not found or booking.status not in ('generated', 'ready') or booking.partner_tracking_number is null or booking.label_base64 is null then
    raise exception 'No confirmed carrier label is available.';
  end if;
  if booking.status = 'ready' then return; end if;
  if not booking.is_test then
    if not exists (select 1 from public.shipments where id = booking.shipment_id
      and organization_id = booking.organization_id and deleted_at is null
      and assigned_driver_id is null and status in ('booked', 'ready_for_pickup', 'picked_up', 'at_warehouse')) then
      raise exception 'Shipment is no longer eligible for partner assignment.';
    end if;
    insert into public.third_party_carriers (organization_id, name, code, integration_mode, created_by)
      values (booking.organization_id, 'GTA AirSkip', 'GTA_AIRSKIP', 'api', booking.created_by)
      on conflict (organization_id, code) do nothing;
    select id into carrier_id from public.third_party_carriers where organization_id = booking.organization_id and code = 'GTA_AIRSKIP' and is_active;
    if carrier_id is null then raise exception 'GTA AirSkip carrier is disabled.'; end if;
    select * into linked from public.third_party_shipment_links where shipment_id = booking.shipment_id;
    if found then
      if linked.organization_id <> booking.organization_id or linked.carrier_id <> carrier_id or linked.partner_tracking_number is distinct from booking.partner_tracking_number then
        raise exception 'Shipment already has another carrier booking.';
      end if;
    else
      insert into public.third_party_shipment_links (organization_id, shipment_id, carrier_id, partner_tracking_number, partner_status, created_by)
        values (booking.organization_id, booking.shipment_id, carrier_id, booking.partner_tracking_number, 'label_generated', booking.created_by);
    end if;
    update public.shipments set fulfillment_mode = 'third_party'
      where id = booking.shipment_id and organization_id = booking.organization_id;
  end if;
  -- Label generation is not physical handover; shipment status/custody remain intact.
  update public.gta_airskip_bookings set status = 'ready' where id = booking.id;
end;
$$;
revoke all on function public.finalize_gta_airskip_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_gta_airskip_booking(uuid, uuid) to service_role;

create or replace function public.reserve_broadreach_booking(p_organization_id uuid, p_shipment_id bigint, p_is_test boolean, p_service text, p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare shipment_record public.shipments%rowtype; booking_id uuid;
begin
  select * into shipment_record from public.shipments
    where id = p_shipment_id and organization_id = p_organization_id and deleted_at is null for update;
  if not found or shipment_record.status not in ('booked', 'ready_for_pickup', 'picked_up', 'at_warehouse')
    or shipment_record.assigned_driver_id is not null then
    raise exception 'Shipment is not eligible for carrier booking.';
  end if;
  if exists (select 1 from public.third_party_shipment_links where shipment_id = p_shipment_id) then
    raise exception 'Shipment already has a delivery partner.';
  end if;
  if not p_is_test and exists (select 1 from public.gta_airskip_bookings where shipment_id = p_shipment_id and not is_test) then
    raise exception 'Shipment already reserved for another carrier.';
  end if;
  insert into public.broadreach_bookings (organization_id, shipment_id, is_test, requested_service, created_by)
    values (p_organization_id, p_shipment_id, p_is_test, p_service, p_actor) returning id into booking_id;
  return booking_id;
end;
$$;
