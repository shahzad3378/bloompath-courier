create or replace function public.create_invoice_from_settlement(
  target_settlement_id bigint,
  target_due_date date default null,
  target_tax_rate numeric default 0,
  target_recipient_email text default null
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  settlement_record public.settlements%rowtype;
  invoice_id bigint;
  service_subtotal numeric(12,2);
  calculated_tax numeric(12,2);
begin
  if not (select private.can_manage_finance()) then raise exception 'Finance access is required.'; end if;
  select * into settlement_record from public.settlements
  where id=target_settlement_id and organization_id=(select private.current_organization_id()) for update;
  if settlement_record.id is null then raise exception 'Settlement not found.'; end if;
  if settlement_record.status not in ('approved','paid') then raise exception 'Only approved or paid settlements can be invoiced.'; end if;
  if exists(select 1 from public.invoices where settlement_id=settlement_record.id) then raise exception 'An invoice already exists for this settlement.'; end if;
  service_subtotal:=settlement_record.total_charges;
  calculated_tax:=round(service_subtotal*greatest(coalesce(target_tax_rate,0),0)/100,2);
  insert into public.invoices(
    organization_id,settlement_id,shipper_id,invoice_number,status,currency,subtotal,tax_rate,tax_amount,
    total_amount,cod_collected,total_delivery_charges,total_return_charges,total_fulfillment_charges,
    net_settlement_payable,due_date,recipient_email,created_by
  ) values (
    settlement_record.organization_id,settlement_record.id,settlement_record.shipper_id,'','draft',
    settlement_record.currency,service_subtotal,greatest(coalesce(target_tax_rate,0),0),calculated_tax,
    service_subtotal+calculated_tax,settlement_record.total_cod,settlement_record.total_delivery_charges,
    settlement_record.total_return_charges,settlement_record.total_fulfillment_charges,
    settlement_record.net_payable,target_due_date,nullif(btrim(target_recipient_email),''),(select auth.uid())
  ) returning id into invoice_id;
  insert into public.invoice_items(
    invoice_id,settlement_item_id,shipment_id,tracking_number,delivered_at,consignee_name,consignee_city,
    cod_amount,delivery_charge,return_charge,fulfillment_charge,total_charges,net_payable,service_amount
  )
  select invoice_id,si.id,si.shipment_id,si.tracking_number,s.delivered_at,s.consignee_name,s.consignee_city,
    si.cod_amount,si.delivery_charge,si.return_charge,si.fulfillment_charge,si.total_charges,si.net_payable,si.total_charges
  from public.settlement_items si join public.shipments s on s.id=si.shipment_id
  where si.settlement_id=settlement_record.id;
  return invoice_id;
end;
$$;
revoke all on function public.create_invoice_from_settlement(bigint,date,numeric,text) from public;
grant execute on function public.create_invoice_from_settlement(bigint,date,numeric,text) to authenticated;


update public.invoice_items ii
set fulfillment_charge=si.fulfillment_charge,total_charges=si.total_charges,net_payable=si.net_payable,
    service_amount=si.total_charges,delivered_at=s.delivered_at,consignee_name=s.consignee_name,consignee_city=s.consignee_city
from public.settlement_items si join public.shipments s on s.id=si.shipment_id
where ii.settlement_item_id=si.id;
update public.invoices i
set total_delivery_charges=s.total_delivery_charges,total_return_charges=s.total_return_charges,
    total_fulfillment_charges=s.total_fulfillment_charges,subtotal=s.total_charges,
    tax_amount=round(s.total_charges*i.tax_rate/100,2),total_amount=s.total_charges+round(s.total_charges*i.tax_rate/100,2),
    net_settlement_payable=s.net_payable
from public.settlements s where i.settlement_id=s.id;
