-- BloomPath Courier V1
-- Shipper settlement workflow and permissions.

grant select, insert, update on public.settlements to authenticated;
grant select, insert on public.settlement_items to authenticated;
grant usage on sequence public.settlements_id_seq to authenticated;
grant usage on sequence public.settlement_items_id_seq to authenticated;


create or replace function private.guard_settlement_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_finance()) then
    raise exception 'Finance access is required.';
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.shipper_id is distinct from old.shipper_id
    or new.settlement_number is distinct from old.settlement_number
    or new.currency is distinct from old.currency
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Settlement identity fields cannot be changed.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if not exists (
      select 1
      from public.settlement_items i
      where i.settlement_id = old.id
    ) then
      raise exception 'Settlement has no AWBs.';
    end if;

    new.approved_by := (select auth.uid());
    new.approved_at := now();
    new.paid_by := null;
    new.paid_at := null;

  elsif old.status = 'approved' and new.status = 'paid' then
    new.paid_by := (select auth.uid());
    new.paid_at := now();

  elsif old.status in ('draft', 'approved') and new.status = 'cancelled' then
    new.paid_by := null;
    new.paid_at := null;

  else
    raise exception 'Invalid settlement status transition.';
  end if;

  new.updated_at := now();

  return new;
end;
$$;

revoke all on function private.guard_settlement_update() from public;

create trigger settlements_guard_update
before update
on public.settlements
for each row
execute function private.guard_settlement_update();


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

  select *
  into settlement_record
  from public.settlements
  where id = new.settlement_id
  for update;

  if settlement_record.id is null
    or settlement_record.organization_id <>
       (select private.current_organization_id())
    or settlement_record.status <> 'draft' then
    raise exception 'Settlement is not open.';
  end if;

  select *
  into ledger_record
  from public.finance_ledger
  where id = new.ledger_id;

  if ledger_record.id is null
    or ledger_record.organization_id <> settlement_record.organization_id
    or ledger_record.shipper_id <> settlement_record.shipper_id then
    raise exception 'Finance ledger entry does not belong to this shipper.';
  end if;

  new.shipment_id := ledger_record.shipment_id;
  new.tracking_number := ledger_record.tracking_number;
  new.cod_amount := ledger_record.cod_amount;
  new.delivery_charge := ledger_record.delivery_charge;
  new.return_charge := ledger_record.return_charge;
  new.total_charges := ledger_record.total_charges;
  new.net_payable := ledger_record.net_payable;

  return new;
end;
$$;

revoke all on function private.guard_settlement_item_insert() from public;

create trigger settlement_items_guard_insert
before insert
on public.settlement_items
for each row
execute function private.guard_settlement_item_insert();
