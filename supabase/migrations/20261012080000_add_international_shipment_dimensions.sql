alter table public.shipments
  add column if not exists transport_mode text,
  add column if not exists length_cm numeric(12, 2),
  add column if not exists width_cm numeric(12, 2),
  add column if not exists height_cm numeric(12, 2),
  add column if not exists volume_cbm numeric(12, 4),
  add column if not exists volumetric_weight_kg numeric(12, 2),
  add column if not exists chargeable_weight_kg numeric(12, 2),
  add column if not exists chargeable_wm numeric(12, 3),
  add column if not exists hs_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_transport_mode_check'
      and conrelid = 'public.shipments'::regclass
  ) then
    alter table public.shipments
      add constraint shipments_transport_mode_check
      check (transport_mode is null or transport_mode in ('air', 'sea'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_dimensions_positive_check'
      and conrelid = 'public.shipments'::regclass
  ) then
    alter table public.shipments
      add constraint shipments_dimensions_positive_check
      check (
        (length_cm is null or length_cm > 0)
        and (width_cm is null or width_cm > 0)
        and (height_cm is null or height_cm > 0)
      );
  end if;
end
$$;
