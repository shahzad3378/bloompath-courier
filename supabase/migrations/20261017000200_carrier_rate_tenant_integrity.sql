-- The composite keys already enforce organization ownership; remove redundant
-- single-column FKs so PostgREST exposes one unambiguous relationship per table.
alter table public.carrier_rate_cards
  drop constraint if exists carrier_rate_cards_shipper_id_fkey,
  drop constraint if exists carrier_rate_cards_carrier_id_fkey;

alter table public.carrier_rate_grid
  drop constraint if exists carrier_rate_grid_rate_card_id_fkey;

alter table public.carrier_postal_zone_map
  drop constraint if exists carrier_postal_zone_map_rate_card_id_fkey;
