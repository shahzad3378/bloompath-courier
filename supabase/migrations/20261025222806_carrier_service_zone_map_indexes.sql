-- Cover the composite foreign keys as well as the common lookup path.
create index if not exists carrier_service_zone_map_rate_card_org_fkey_idx
  on public.carrier_service_zone_map (rate_card_id, organization_id);
create index if not exists carrier_service_zone_map_zone_org_fkey_idx
  on public.carrier_service_zone_map (service_zone_id, organization_id);
create index if not exists carrier_service_zone_map_created_by_idx
  on public.carrier_service_zone_map (created_by);
