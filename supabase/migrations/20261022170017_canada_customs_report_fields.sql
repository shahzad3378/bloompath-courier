alter table public.shipments
  add column if not exists sender_address_3 text,
  add column if not exists consignee_address_3 text,
  add column if not exists consignee_email text,
  add column if not exists incoterms text,
  add column if not exists item_quantity integer,
  add column if not exists item_value numeric(12, 2),
  add column if not exists country_of_origin text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shipments_item_quantity_positive' and conrelid = 'public.shipments'::regclass) then
    alter table public.shipments add constraint shipments_item_quantity_positive check (item_quantity is null or item_quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_item_value_nonnegative' and conrelid = 'public.shipments'::regclass) then
    alter table public.shipments add constraint shipments_item_value_nonnegative check (item_value is null or item_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shipments_country_of_origin_code' and conrelid = 'public.shipments'::regclass) then
    alter table public.shipments add constraint shipments_country_of_origin_code check (country_of_origin is null or country_of_origin ~ '^[A-Z]{2}$');
  end if;
end
$$;
