-- BloomPath Courier V1
-- Automatic finance ledger generation

create or replace function private.create_shipment_finance_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_rate public.shipper_rates%rowtype;
  applied_delivery_rate numeric(12,2) := 0;
  applied_return_rate numeric(12,2) := 0;
  ledger_cod numeric(12,2) := 0;
  ledger_type text;
begin
  -- Only react when shipment reaches a financially final status.
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('delivered', 'returned_to_shipper') then
    return new;
  end if;

  -- A finance transaction requires a shipper.
  if new.shipper_id is null then
    return new;
  end if;

  -- Pick the rate active when the financial event happens.
  select *
  into active_rate
  from public.shipper_rates r
  where r.organization_id = new.organization_id
    and r.shipper_id = new.shipper_id
    and r.effective_from <= now()
    and (r.effective_to is null or r.effective_to > now())
  order by r.effective_from desc
  limit 1;

  if not found then
    raise exception 'Shipper rate not configured for AWB %.', new.tracking_number;
  end if;

  if new.status = 'delivered' then
    ledger_type := 'delivered';
    applied_delivery_rate := active_rate.delivery_rate;

    if new.payment_type = 'cod' then
      ledger_cod := new.cod_amount;
    else
      ledger_cod := 0;
    end if;

  elsif new.status = 'returned_to_shipper' then
    ledger_type := 'returned_to_shipper';
    ledger_cod := 0;

    if found and active_rate.return_charge_enabled then
      applied_return_rate := active_rate.return_rate;
    end if;
  end if;

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
    applied_delivery_rate,
    applied_return_rate,
    coalesce(active_rate.currency, 'AED'),
    jsonb_build_object(
      'rate_id', active_rate.id,
      'delivery_rate', coalesce(active_rate.delivery_rate, 0),
      'return_charge_enabled', coalesce(active_rate.return_charge_enabled, false),
      'return_rate', coalesce(active_rate.return_rate, 0),
      'effective_from', active_rate.effective_from
    ),
    now()
  )
  on conflict (shipment_id, transaction_type) do nothing;

  return new;
end;
$$;

revoke all on function private.create_shipment_finance_ledger() from public;


create trigger shipments_create_finance_ledger
after update of status
on public.shipments
for each row
execute function private.create_shipment_finance_ledger();
