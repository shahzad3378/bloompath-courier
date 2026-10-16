-- Keep fixed package rates, minimum charges, and per-weight-unit rates distinct.
alter table public.carrier_rate_cards
  add column rate_notes text;

alter table public.carrier_rate_grid
  add column rate_basis text not null default 'weight_break'
    check (rate_basis in ('weight_break', 'minimum_per_package', 'per_weight_unit'));

alter table public.carrier_rate_grid
  drop constraint if exists carrier_rate_grid_weight_value_check;

alter table public.carrier_rate_grid
  add constraint carrier_rate_grid_weight_basis_check
  check (weight_value >= 0 and (weight_value > 0 or rate_basis = 'minimum_per_package'));

alter table public.carrier_rate_grid
  drop constraint if exists carrier_rate_grid_unique;

alter table public.carrier_rate_grid
  add constraint carrier_rate_grid_unique unique
    (rate_card_id, service_code, origin_terminal, zone_code, weight_value, weight_unit, rate_basis);
