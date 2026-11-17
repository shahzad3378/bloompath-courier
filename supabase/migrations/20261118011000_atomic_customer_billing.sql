-- Select completed AWBs and create the settlement + invoice as one transaction.
-- No cross-tenant mutation, email delivery or payment is performed here.
create or replace function public.create_invoice_from_awbs(
  target_shipper_id uuid,
  target_ledger_ids bigint[],
  target_due_date date default null,
  target_tax_rate numeric default 0,
  target_recipient_email text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  org uuid := (select private.current_organization_id());
  selected_count integer;
  selected_currency text;
  settlement_id bigint;
  invoice_id bigint;
begin
  if org is null or not (select private.can_manage_finance()) then
    raise exception 'Finance access is required.';
  end if;
  selected_count := cardinality(target_ledger_ids);
  if selected_count is null or selected_count < 1 or selected_count > 5000
    or selected_count <> (select count(distinct x) from unnest(target_ledger_ids) x)
    or target_tax_rate is null or target_tax_rate < 0 or target_tax_rate > 100 then
    raise exception 'Invalid invoice selection.';
  end if;
  if not exists(select 1 from public.profiles where id=target_shipper_id and organization_id=org and role='shipper') then
    raise exception 'Shipper not found.';
  end if;
  -- Stable lock order serializes overlapping selections and prevents double billing.
  perform l.id from public.finance_ledger l
    where l.organization_id=org and l.id=any(target_ledger_ids) order by l.id for update;
  if (select count(*) from public.finance_ledger l join public.shipments s on s.id=l.shipment_id
      and s.organization_id=l.organization_id
      where l.organization_id=org and l.shipper_id=target_shipper_id and l.id=any(target_ledger_ids)
      and l.transaction_type in ('delivered','returned_to_shipper') and s.status::text=l.transaction_type) <> selected_count then
    raise exception 'Selection includes an unavailable or incomplete shipment.';
  end if;
  if (select count(distinct currency) from public.finance_ledger where id=any(target_ledger_ids) and organization_id=org) <> 1 then
    raise exception 'Create a separate invoice for each currency.';
  end if;
  if exists(select 1 from public.settlement_items where ledger_id=any(target_ledger_ids)) then
    raise exception 'An AWB is already in a settlement. Open that settlement to continue billing.';
  end if;
  select currency into selected_currency from public.finance_ledger where id=target_ledger_ids[1] and organization_id=org;
  insert into public.settlements(organization_id,shipper_id,status,currency,period_from,period_to,created_by)
    select org,target_shipper_id,'draft',selected_currency,
      min(coalesce(s.delivered_at,l.transaction_at)),max(coalesce(s.delivered_at,l.transaction_at)),(select auth.uid())
    from public.finance_ledger l join public.shipments s on s.id=l.shipment_id
    where l.organization_id=org and l.id=any(target_ledger_ids)
    returning id into settlement_id;
  insert into public.settlement_items(settlement_id,ledger_id,shipment_id,tracking_number,cod_amount,
    delivery_charge,return_charge,fulfillment_charge,total_charges,net_payable)
    select settlement_id,l.id,l.shipment_id,l.tracking_number,l.cod_amount,l.delivery_charge,
      l.return_charge,l.fulfillment_charge,l.total_charges,l.net_payable
    from public.finance_ledger l where l.organization_id=org and l.id=any(target_ledger_ids);
  update public.settlements set status='approved' where id=settlement_id and organization_id=org;
  invoice_id := public.create_invoice_from_settlement(settlement_id,target_due_date,target_tax_rate,target_recipient_email);
  update public.invoices set net_settlement_payable=cod_collected-total_amount
    where id=invoice_id and organization_id=org;
  return invoice_id;
end;
$$;
revoke all on function public.create_invoice_from_awbs(uuid,bigint[],date,numeric,text) from public;
grant execute on function public.create_invoice_from_awbs(uuid,bigint[],date,numeric,text) to authenticated;
