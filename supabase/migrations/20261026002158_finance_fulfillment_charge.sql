update public.finance_ledger fl
set fulfillment_charge = case
  when fl.transaction_type = 'delivered' then coalesce((
    select c.amount
    from public.shipments s
    join public.fulfillment_orders fo
      on fo.id = s.fulfillment_order_id
     and fo.organization_id = s.organization_id
    join public.fulfillment_order_service_charges c
      on c.organization_id = fo.organization_id
     and c.order_number = fo.order_number
    where s.id = fl.shipment_id
  ),0)
  else 0
end;

create or replace function private.create_shipment_finance_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  default_rate public.shipper_rates%rowtype;
  zone_rate public.shipper_zone_rates%rowtype;

  has_default_rate boolean := false;
  has_zone_rate boolean := false;

  ledger_type text;
  ledger_cod numeric(12,2) := 0;

  base_delivery_charge numeric(12,2) := 0;
  extra_weight_charge numeric(12,2) := 0;
  cod_fee_charge numeric(12,2) := 0;

  applied_delivery_charge numeric(12,2) := 0;
  applied_return_charge numeric(12,2) := 0;
  fulfillment_charge_amount numeric(12,2) := 0;

  applied_currency text;
  rate_source text := 'default';

  excess_weight numeric(12,3) := 0;
  extra_units numeric(12,3) := 0;
begin
  -- Only react to real status transitions.
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in (
    'delivered',
    'returned_to_shipper'
  ) then
    return new;
  end if;

  if new.shipper_id is null then
    return new;
  end if;


  if new.status = 'delivered' and new.fulfillment_order_id is not null then
    select coalesce((
      select c.amount
      from public.fulfillment_orders fo
      join public.fulfillment_order_service_charges c
        on c.organization_id = fo.organization_id
       and c.order_number = fo.order_number
      where fo.id = new.fulfillment_order_id
        and fo.organization_id = new.organization_id
      limit 1
    ), 0)
    into fulfillment_charge_amount;
  end if;

  -- -------------------------------------------------------
  -- Default shipper rate
  -- -------------------------------------------------------

  select *
  into default_rate
  from public.shipper_rates r
  where r.organization_id = new.organization_id
    and r.shipper_id = new.shipper_id
    and r.effective_from <= now()
    and (
      r.effective_to is null
      or r.effective_to > now()
    )
  order by r.effective_from desc
  limit 1;

  has_default_rate := found;


  -- -------------------------------------------------------
  -- Zone-specific override
  --
  -- Weight tiers:
  -- choose the active rate with the highest weight_from_kg
  -- that does not exceed shipment weight.
  --
  -- weight_to_kg represents weight included in that tier.
  -- If shipment exceeds it, additional_kg_rate applies.
  -- -------------------------------------------------------

  if new.service_zone_id is not null then

    select *
    into zone_rate
    from public.shipper_zone_rates zr
    where zr.organization_id = new.organization_id
      and zr.shipper_id = new.shipper_id
      and zr.service_zone_id = new.service_zone_id
      and zr.service_type = new.service_type
      and zr.is_active = true
      and zr.effective_from <= now()
      and (
        zr.effective_to is null
        or zr.effective_to > now()
      )
      and zr.weight_from_kg <= new.weight_kg
    order by
      zr.weight_from_kg desc,
      zr.effective_from desc
    limit 1;

    has_zone_rate := found;

  end if;


  if not has_zone_rate
    and not has_default_rate then
    raise exception
      'No commercial rate configured for AWB %.',
      new.tracking_number;
  end if;


  -- -------------------------------------------------------
  -- Zone pricing
  -- -------------------------------------------------------

  if has_zone_rate then

    rate_source := 'zone';
    applied_currency := zone_rate.currency;

    base_delivery_charge :=
      coalesce(zone_rate.delivery_rate, 0);

    -- Extra-weight charging starts above weight_to_kg.
    if zone_rate.weight_to_kg is not null
      and new.weight_kg > zone_rate.weight_to_kg
      and zone_rate.additional_kg_rate > 0 then

      excess_weight :=
        new.weight_kg - zone_rate.weight_to_kg;

      -- Charge every started additional kilogram.
      extra_units := ceil(excess_weight);

      extra_weight_charge :=
        extra_units * zone_rate.additional_kg_rate;

    end if;

    if new.payment_type = 'cod' then
      cod_fee_charge :=
        coalesce(zone_rate.cod_fee, 0);
    end if;

  else

    -- -----------------------------------------------------
    -- Existing default shipper rate fallback
    -- -----------------------------------------------------

    rate_source := 'default';

    applied_currency :=
      coalesce(
        new.currency,
        default_rate.currency,
        'AED'
      );

    base_delivery_charge :=
      coalesce(default_rate.delivery_rate, 0);

  end if;


  -- -------------------------------------------------------
  -- Delivered
  -- -------------------------------------------------------

  if new.status = 'delivered' then

    ledger_type := 'delivered';

    if new.payment_type = 'cod' then
      ledger_cod := new.cod_amount;
    else
      ledger_cod := 0;
    end if;

    if has_zone_rate then

      applied_delivery_charge :=
        base_delivery_charge
        + extra_weight_charge
        + cod_fee_charge;

    else

      applied_delivery_charge :=
        base_delivery_charge;

    end if;


  -- -------------------------------------------------------
  -- Returned to shipper
  -- -------------------------------------------------------

  elsif new.status = 'returned_to_shipper' then

    ledger_type := 'returned_to_shipper';
    ledger_cod := 0;

    if has_zone_rate then

      if zone_rate.return_charge_enabled then
        applied_return_charge :=
          coalesce(zone_rate.return_rate, 0);
      end if;

    elsif default_rate.return_charge_enabled then

      applied_return_charge :=
        coalesce(default_rate.return_rate, 0);

    end if;

  end if;


  -- -------------------------------------------------------
  -- Ledger snapshot
  -- -------------------------------------------------------

  insert into public.finance_ledger (
    organization_id,
    shipment_id,
    shipper_id,
    tracking_number,
    transaction_type,
    payment_type,
    cod_amount,
    delivery_charge,
    return_charge,
    fulfillment_charge,
    currency,
    rate_snapshot,
    transaction_at
  )
  values (
    new.organization_id,
    new.id,
    new.shipper_id,
    new.tracking_number,
    ledger_type,
    new.payment_type,
    ledger_cod,
    applied_delivery_charge,
    applied_return_charge,
    fulfillment_charge_amount,
    applied_currency,

    case
      when has_zone_rate then
        jsonb_build_object(
          'rate_source', 'zone',
          'zone_rate_id', zone_rate.id,
          'service_zone_id', new.service_zone_id,
          'service_zone_name', new.service_zone_name,
          'service_type', new.service_type,
          'currency', zone_rate.currency,

          'base_delivery_rate',
            coalesce(zone_rate.delivery_rate, 0),

          'weight_kg',
            new.weight_kg,

          'weight_from_kg',
            zone_rate.weight_from_kg,

          'weight_to_kg',
            zone_rate.weight_to_kg,

          'additional_kg_rate',
            coalesce(zone_rate.additional_kg_rate, 0),

          'extra_weight_charge',
            extra_weight_charge,

          'cod_fee',
            cod_fee_charge,

          'applied_delivery_charge',
            applied_delivery_charge,

          'return_charge_enabled',
            zone_rate.return_charge_enabled,

          'return_rate',
            coalesce(zone_rate.return_rate, 0),

          'applied_return_charge',
            applied_return_charge,

          'fulfillment_charge',
            fulfillment_charge_amount,

          'effective_from',
            zone_rate.effective_from
        )

      else
        jsonb_build_object(
          'rate_source', 'default',
          'rate_id', default_rate.id,
          'service_zone_id', new.service_zone_id,
          'service_zone_name', new.service_zone_name,
          'service_type', new.service_type,
          'currency',
            coalesce(
              new.currency,
              default_rate.currency,
              'AED'
            ),

          'delivery_rate',
            coalesce(default_rate.delivery_rate, 0),

          'return_charge_enabled',
            coalesce(
              default_rate.return_charge_enabled,
              false
            ),

          'return_rate',
            coalesce(default_rate.return_rate, 0),

          'fulfillment_charge',
            fulfillment_charge_amount,

          'effective_from',
            default_rate.effective_from
        )
    end,

    now()
  )
  on conflict (
    shipment_id,
    transaction_type
  )
  do nothing;

  return new;
end;
$function$;
revoke all on function private.create_shipment_finance_ledger() from public;

