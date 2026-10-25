-- Map an internal service zone to a carrier's own zone code for rate comparison.
-- This does not change shipper/customer delivery tariffs or service-zone rules.

alter table public.service_zones
  add constraint service_zones_id_org_unique unique (id, organization_id);

create table public.carrier_service_zone_map (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rate_card_id uuid not null,
  service_zone_id bigint not null,
  zone_code text not null check (char_length(zone_code) between 1 and 30),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carrier_service_zone_map_unique unique (rate_card_id, service_zone_id),
  constraint carrier_service_zone_map_card_org_fkey
    foreign key (rate_card_id, organization_id)
    references public.carrier_rate_cards(id, organization_id) on delete cascade,
  constraint carrier_service_zone_map_zone_org_fkey
    foreign key (service_zone_id, organization_id)
    references public.service_zones(id, organization_id) on delete cascade
);

create index carrier_service_zone_map_lookup_idx
  on public.carrier_service_zone_map (organization_id, rate_card_id, service_zone_id);

alter table public.carrier_service_zone_map enable row level security;
revoke all on public.carrier_service_zone_map from anon;
grant select on public.carrier_service_zone_map to authenticated;

create policy "staff can read carrier service zone maps"
on public.carrier_service_zone_map for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.organization_id = carrier_service_zone_map.organization_id
      and p.status = 'active'
      and p.role in ('super_admin', 'operations_admin', 'finance_staff')
  )
);

create or replace function public.apply_carrier_service_zone_mappings(
  p_organization_id uuid,
  p_actor_id uuid,
  p_rate_card_id uuid,
  p_mappings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.carrier_rate_cards%rowtype;
  v_actor public.profiles%rowtype;
  v_row jsonb;
  v_zone_id bigint;
  v_action text;
  v_zone_code text;
  v_mapped integer := 0;
  v_unmapped integer := 0;
begin
  select * into v_actor
  from public.profiles
  where id = p_actor_id
    and organization_id = p_organization_id
    and status = 'active'
    and role in ('super_admin', 'operations_admin');
  if not found then
    raise exception 'Not authorized to manage carrier zone mappings';
  end if;

  select * into v_card
  from public.carrier_rate_cards
  where id = p_rate_card_id
    and organization_id = p_organization_id
    and import_status = 'active';
  if not found then
    raise exception 'Active rate card was not found';
  end if;

  if jsonb_typeof(p_mappings) <> 'array' or jsonb_array_length(p_mappings) > 3000 then
    raise exception 'Mapping file must contain at most 3000 rows';
  end if;

  for v_row in select value from jsonb_array_elements(p_mappings)
  loop
    v_action := upper(coalesce(v_row->>'action', ''));
    v_zone_id := nullif(v_row->>'service_zone_id', '')::bigint;
    v_zone_code := upper(trim(coalesce(v_row->>'zone_code', '')));

    if v_action not in ('MAP', 'UNMAP') or v_zone_id is null or v_zone_id <= 0 then
      raise exception 'Each row needs MAP or UNMAP and a valid service_zone_id';
    end if;
    if not exists (
      select 1 from public.service_zones z
      where z.id = v_zone_id
        and z.organization_id = p_organization_id
        and z.country_code = v_card.country_code
        and z.is_active
    ) then
      raise exception 'Service zone % is inactive, missing, or for another market', v_zone_id;
    end if;

    if v_action = 'UNMAP' then
      delete from public.carrier_service_zone_map
      where organization_id = p_organization_id
        and rate_card_id = p_rate_card_id
        and service_zone_id = v_zone_id;
      v_unmapped := v_unmapped + 1;
    else
      if v_zone_code = '' or not exists (
        select 1 from public.carrier_rate_grid g
        where g.organization_id = p_organization_id
          and g.rate_card_id = p_rate_card_id
          and g.zone_code = v_zone_code
      ) then
        raise exception '3PL zone code % is not present in this rate card', v_zone_code;
      end if;

      insert into public.carrier_service_zone_map (
        organization_id, rate_card_id, service_zone_id, zone_code, created_by, updated_at
      ) values (
        p_organization_id, p_rate_card_id, v_zone_id, v_zone_code, p_actor_id, now()
      )
      on conflict (rate_card_id, service_zone_id)
      do update set zone_code = excluded.zone_code, created_by = excluded.created_by, updated_at = now();
      v_mapped := v_mapped + 1;
    end if;
  end loop;

  return jsonb_build_object('mapped', v_mapped, 'unmapped', v_unmapped);
end;
$$;

revoke all on function public.apply_carrier_service_zone_mappings(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_carrier_service_zone_mappings(uuid, uuid, uuid, jsonb) to service_role;
