-- Allow historical paid settlements to generate invoices.
-- Future workflow remains: approved -> invoice -> paid.

create or replace function public.create_invoice_from_settlement(
  target_settlement_id bigint,
  target_due_date date default null,
  target_tax_rate numeric default 0,
  target_recipient_email text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement_record public.settlements%rowtype;
  invoice_id bigint;
  service_subtotal numeric(12,2);
  calculated_tax numeric(12,2);
begin
  if not (select private.can_manage_finance()) then
    raise exception 'Finance access is required.';
  end if;

  select *
  into settlement_record
  from public.settlements
  where id = target_settlement_id
    and organization_id =
      (select private.current_organization_id())
  for update;

  if settlement_record.id is null then
    raise exception 'Settlement not found.';
  end if;

  if settlement_record.status not in ('approved', 'paid') then
    raise exception
      'Only approved or paid settlements can be invoiced.';
  end if;

  if exists (
    select 1
    from public.invoices
    where settlement_id = settlement_record.id
  ) then
    raise exception
      'An invoice already exists for this settlement.';
  end if;

  service_subtotal :=
    settlement_record.total_charges;

  calculated_tax :=
    round(
      service_subtotal *
      greatest(coalesce(target_tax_rate, 0), 0) /
      100,
      2
    );

  insert into public.invoices (
    organization_id,
    settlement_id,
    shipper_id,
    invoice_number,
    status,
    currency,
    subtotal,
    tax_rate,
    tax_amount,
    total_amount,
    cod_collected,
    net_settlement_payable,
    due_date,
    recipient_email,
    created_by
  )
  values (
    settlement_record.organization_id,
    settlement_record.id,
    settlement_record.shipper_id,
    '',
    'draft',
    settlement_record.currency,
    service_subtotal,
    greatest(coalesce(target_tax_rate, 0), 0),
    calculated_tax,
    service_subtotal + calculated_tax,
    settlement_record.total_cod,
    settlement_record.net_payable,
    target_due_date,
    nullif(btrim(target_recipient_email), ''),
    (select auth.uid())
  )
  returning id into invoice_id;

  insert into public.invoice_items (
    invoice_id,
    settlement_item_id,
    shipment_id,
    tracking_number,
    cod_amount,
    delivery_charge,
    return_charge,
    service_amount
  )
  select
    invoice_id,
    si.id,
    si.shipment_id,
    si.tracking_number,
    si.cod_amount,
    si.delivery_charge,
    si.return_charge,
    si.total_charges
  from public.settlement_items si
  where si.settlement_id = settlement_record.id;

  return invoice_id;
end;
$$;

revoke all on function public.create_invoice_from_settlement(
  bigint,
  date,
  numeric,
  text
) from public;

grant execute on function public.create_invoice_from_settlement(
  bigint,
  date,
  numeric,
  text
) to authenticated;
