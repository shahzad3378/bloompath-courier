create or replace function private.refresh_settlement_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_settlement_id bigint;
begin
  target_settlement_id := coalesce(new.settlement_id, old.settlement_id);
  update public.settlements s
  set total_cod = totals.total_cod,
      total_delivery_charges = totals.total_delivery_charges,
      total_return_charges = totals.total_return_charges,
      total_fulfillment_charges = totals.total_fulfillment_charges,
      total_charges = totals.total_charges,
      net_payable = totals.net_payable,
      updated_at = now()
  from (
    select coalesce(sum(i.cod_amount),0)::numeric(12,2) as total_cod,
      coalesce(sum(i.delivery_charge),0)::numeric(12,2) as total_delivery_charges,
      coalesce(sum(i.return_charge),0)::numeric(12,2) as total_return_charges,
      coalesce(sum(i.fulfillment_charge),0)::numeric(12,2) as total_fulfillment_charges,
      coalesce(sum(i.total_charges),0)::numeric(12,2) as total_charges,
      coalesce(sum(i.net_payable),0)::numeric(12,2) as net_payable
    from public.settlement_items i where i.settlement_id=target_settlement_id
  ) totals
  where s.id=target_settlement_id;
  return coalesce(new,old);
end;
$$;
revoke all on function private.refresh_settlement_totals() from public;

create or replace function private.guard_settlement_item_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement_record public.settlements%rowtype;
  ledger_record public.finance_ledger%rowtype;
begin
  if not (select private.can_manage_finance()) then
    raise exception 'Finance access is required.';
  end if;
  select * into settlement_record from public.settlements where id=new.settlement_id for update;
  if settlement_record.id is null
    or settlement_record.organization_id<>(select private.current_organization_id())
    or settlement_record.status<>'draft' then raise exception 'Settlement is not open.'; end if;
  select * into ledger_record from public.finance_ledger where id=new.ledger_id;
  if ledger_record.id is null
    or ledger_record.organization_id<>settlement_record.organization_id
    or ledger_record.shipper_id<>settlement_record.shipper_id then
    raise exception 'Finance ledger entry does not belong to this shipper.';
  end if;
  new.shipment_id:=ledger_record.shipment_id;
  new.tracking_number:=ledger_record.tracking_number;
  new.cod_amount:=ledger_record.cod_amount;
  new.delivery_charge:=ledger_record.delivery_charge;
  new.return_charge:=ledger_record.return_charge;
  new.fulfillment_charge:=ledger_record.fulfillment_charge;
  new.total_charges:=ledger_record.total_charges;
  new.net_payable:=ledger_record.net_payable;
  return new;
end;
$$;
revoke all on function private.guard_settlement_item_insert() from public;


alter table public.settlements disable trigger settlements_guard_update;

update public.settlement_items si
set fulfillment_charge=fl.fulfillment_charge,total_charges=fl.total_charges,net_payable=fl.net_payable
from public.finance_ledger fl where fl.id=si.ledger_id;
update public.settlements s
set total_cod=x.total_cod,total_delivery_charges=x.total_delivery_charges,total_return_charges=x.total_return_charges,
    total_fulfillment_charges=x.total_fulfillment_charges,total_charges=x.total_charges,net_payable=x.net_payable
from (select si.settlement_id,coalesce(sum(si.cod_amount),0)::numeric(12,2) total_cod,
    coalesce(sum(si.delivery_charge),0)::numeric(12,2) total_delivery_charges,
    coalesce(sum(si.return_charge),0)::numeric(12,2) total_return_charges,
    coalesce(sum(si.fulfillment_charge),0)::numeric(12,2) total_fulfillment_charges,
    coalesce(sum(si.total_charges),0)::numeric(12,2) total_charges,
    coalesce(sum(si.net_payable),0)::numeric(12,2) net_payable
  from public.settlement_items si group by si.settlement_id)x where s.id=x.settlement_id;
 
alter table public.settlements enable trigger settlements_guard_update;
