-- BloomPath Courier V1
-- Automatic settlement numbering and totals

create sequence if not exists public.settlement_number_seq
  as bigint
  start with 1001
  increment by 1
  no cycle;

alter table public.settlements
  alter column settlement_number
  set default (
    'SET-' || lpad(nextval('public.settlement_number_seq')::text, 6, '0')
  );

grant usage on sequence public.settlement_number_seq to authenticated;


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
  set
    total_cod = totals.total_cod,
    total_delivery_charges = totals.total_delivery_charges,
    total_return_charges = totals.total_return_charges,
    total_charges = totals.total_charges,
    net_payable = totals.net_payable,
    updated_at = now()
  from (
    select
      coalesce(sum(i.cod_amount), 0)::numeric(12,2) as total_cod,
      coalesce(sum(i.delivery_charge), 0)::numeric(12,2) as total_delivery_charges,
      coalesce(sum(i.return_charge), 0)::numeric(12,2) as total_return_charges,
      coalesce(sum(i.total_charges), 0)::numeric(12,2) as total_charges,
      coalesce(sum(i.net_payable), 0)::numeric(12,2) as net_payable
    from public.settlement_items i
    where i.settlement_id = target_settlement_id
  ) totals
  where s.id = target_settlement_id;

  return coalesce(new, old);
end;
$$;

revoke all on function private.refresh_settlement_totals() from public;

create trigger settlement_items_refresh_totals
after insert or update or delete
on public.settlement_items
for each row
execute function private.refresh_settlement_totals();
