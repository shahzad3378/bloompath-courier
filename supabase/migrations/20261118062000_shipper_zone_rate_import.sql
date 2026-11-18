create or replace function public.import_shipper_zone_rates(target_shipper_id uuid, target_rates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  org uuid := (select private.current_organization_id());
  actor uuid := (select auth.uid());
  base_currency text;
  item record;
  n integer;
  starts_at timestamptz := clock_timestamp();
begin
  if org is null or not (select private.can_manage_finance()) then raise exception 'Finance access is required.'; end if;
  if not exists(select 1 from public.profiles where id=target_shipper_id and organization_id=org and role='shipper') then raise exception 'Shipper not found in your courier company.'; end if;
  if jsonb_typeof(target_rates) is distinct from 'array' then raise exception 'Invalid rates file.'; end if;
  n := jsonb_array_length(target_rates);
  if n < 1 or n > 5000 then raise exception 'Import between 1 and 5000 rates.'; end if;
  select coalesce(
    (select currency_code from public.organization_currencies where organization_id=org and is_active and is_base limit 1),
    (select currency from public.organization_settings where organization_id=org),
    (select c.default_currency_code from public.organization_countries oc join public.countries c on c.code=oc.country_code where oc.organization_id=org and oc.is_primary and oc.is_active limit 1),
    'AED') into base_currency;
  -- Serialize imports for this shipper without changing other customer accounts.
  perform pg_advisory_xact_lock(hashtextextended(org::text || ':' || target_shipper_id::text, 0));
  if (select count(*) from (select value->>'service_zone_id',value->>'service_type', (value->>'weight_from_kg')::numeric from jsonb_array_elements(target_rates) group by 1,2,3) t) <> n then
    raise exception 'Duplicate zone/service/weight tiers in the file.';
  end if;
  for item in select * from jsonb_to_recordset(target_rates) as r(service_zone_id bigint,service_type text,currency text,delivery_rate numeric,return_charge_enabled boolean,return_rate numeric,weight_from_kg numeric,weight_to_kg numeric,additional_kg_rate numeric,cod_fee numeric)
  loop
    if not exists(select 1 from public.service_zones where id=item.service_zone_id and organization_id=org and is_active) then raise exception 'A zone is not active in your courier company.'; end if;
    if item.currency is distinct from base_currency then raise exception 'Use the courier company billing currency: %.',base_currency; end if;
    if item.service_type is null or item.service_type not in ('same_day','next_day','standard')
      or item.delivery_rate is null or item.return_rate is null or item.weight_from_kg is null or item.additional_kg_rate is null or item.cod_fee is null or item.return_charge_enabled is null
      or item.delivery_rate < 0 or item.delivery_rate >= 10000000000 or item.delivery_rate <> round(item.delivery_rate,2)
      or item.return_rate < 0 or item.return_rate >= 10000000000 or item.return_rate <> round(item.return_rate,2)
      or item.additional_kg_rate < 0 or item.additional_kg_rate >= 10000000000 or item.additional_kg_rate <> round(item.additional_kg_rate,2)
      or item.cod_fee < 0 or item.cod_fee >= 10000000000 or item.cod_fee <> round(item.cod_fee,2)
      or item.weight_from_kg < 0 or item.weight_from_kg > 99999.999 or item.weight_from_kg <> round(item.weight_from_kg,3)
      or (item.weight_to_kg is not null and (item.weight_to_kg <= item.weight_from_kg or item.weight_to_kg > 99999.999 or item.weight_to_kg <> round(item.weight_to_kg,3)))
      or (not item.return_charge_enabled and item.return_rate <> 0) then raise exception 'Invalid rate values.';
    end if;
    if exists(select 1 from public.shipper_zone_rates where organization_id=org and shipper_id=target_shipper_id and service_zone_id=item.service_zone_id and service_type::text=item.service_type and currency=item.currency and weight_from_kg=item.weight_from_kg and is_active and effective_from>=starts_at) then
      raise exception 'A future rate already exists for one of these tiers. Review it before replacing rates.';
    end if;
    update public.shipper_zone_rates set is_active=false,effective_to=starts_at
      where organization_id=org and shipper_id=target_shipper_id and service_zone_id=item.service_zone_id and service_type::text=item.service_type and currency=item.currency and weight_from_kg=item.weight_from_kg and is_active;
    insert into public.shipper_zone_rates(organization_id,shipper_id,service_zone_id,service_type,currency,delivery_rate,return_charge_enabled,return_rate,weight_from_kg,weight_to_kg,additional_kg_rate,cod_fee,effective_from,created_by)
      values(org,target_shipper_id,item.service_zone_id,item.service_type::public.service_type,item.currency,item.delivery_rate,item.return_charge_enabled,item.return_rate,item.weight_from_kg,item.weight_to_kg,item.additional_kg_rate,item.cod_fee,starts_at,actor);
  end loop;
  return n;
end;
$$;
revoke all on function public.import_shipper_zone_rates(uuid,jsonb) from public,anon;
grant execute on function public.import_shipper_zone_rates(uuid,jsonb) to authenticated;
