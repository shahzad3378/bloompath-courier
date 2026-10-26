create or replace function private.create_driver_cod_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and new.status='delivered'
    and new.payment_type='cod'
    and new.cod_amount>0
    and new.assigned_driver_id is not null then
    insert into public.driver_cod_entries(
      organization_id,shipment_id,driver_id,tracking_number,cod_amount,delivered_at
    ) values (
      new.organization_id,new.id,new.assigned_driver_id,new.tracking_number,new.cod_amount,
      coalesce(new.delivered_at,now())
    ) on conflict(shipment_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.create_driver_cod_entry() from public;

create or replace function private.sync_terminal_tracking_to_shipment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_tracking_status is distinct from old.customer_tracking_status
    and new.customer_tracking_status in ('delivered','returned_to_shipper')
    and new.status not in ('delivered','returned_to_shipper') then
    update public.shipments s
    set status = new.customer_tracking_status::public.shipment_status,
        delivered_at = case when new.customer_tracking_status='delivered' then coalesce(s.delivered_at,now()) else s.delivered_at end
    where s.id=new.id and s.organization_id=new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_terminal_tracking_to_shipment_status() from public;
create trigger shipments_sync_terminal_tracking_finance
after update of customer_tracking_status on public.shipments
for each row execute function private.sync_terminal_tracking_to_shipment_status();

