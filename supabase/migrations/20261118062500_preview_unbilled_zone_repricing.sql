-- Explicit preview/apply for correcting unbilled snapshots after rates are uploaded.
create or replace function public.reprice_unbilled_zone_charges(target_shipper_id uuid, target_apply boolean default false, target_preview_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  org uuid := (select private.current_organization_id());
  row_data record;
  delivery numeric(12,2);
  returned numeric(12,2);
  after_charge numeric(12,2);
  changed integer := 0;
  skipped integer := 0;
  totals jsonb := '{}'::jsonb;
  previous jsonb;
  signature text := '';
  preview_token text;
begin
  if org is null or not (select private.can_manage_finance()) then raise exception 'Finance access is required.'; end if;
  if not exists(select 1 from public.profiles where id=target_shipper_id and organization_id=org and role='shipper') then raise exception 'Shipper not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text || ':' || target_shipper_id::text,0));
  -- Lock in the same order as invoice creation. Recheck billing links after locking.
  perform l.id from public.finance_ledger l where l.organization_id=org and l.shipper_id=target_shipper_id
    and not exists(select 1 from public.settlement_items si where si.ledger_id=l.id) order by l.id for update;
  for row_data in
    select l.*,s.weight_kg,z.id as zone_rate_id,z.delivery_rate as zone_delivery,z.return_charge_enabled,z.return_rate as zone_return,
      z.weight_to_kg,z.additional_kg_rate,z.cod_fee
    from public.finance_ledger l join public.shipments s on s.id=l.shipment_id and s.organization_id=l.organization_id
    left join lateral (
      select r.* from public.shipper_zone_rates r
      where r.organization_id=org and r.shipper_id=target_shipper_id and r.service_zone_id=s.service_zone_id
        and r.service_type=s.service_type and r.currency=l.currency and r.is_active
        and r.effective_from<=now() and (r.effective_to is null or r.effective_to>now()) and r.weight_from_kg<=s.weight_kg
      order by r.weight_from_kg desc,r.effective_from desc,r.id desc limit 1
    ) z on true
    where l.organization_id=org and l.shipper_id=target_shipper_id
      and l.transaction_type in ('delivered','returned_to_shipper') and s.status::text=l.transaction_type and s.deleted_at is null
      and not exists(select 1 from public.settlement_items si where si.ledger_id=l.id)
    order by l.id
  loop
    if row_data.zone_rate_id is null then skipped:=skipped+1; signature:=signature || row_data.id::text || ':skip;'; continue; end if;
    delivery:=0; returned:=0;
    if row_data.transaction_type='delivered' then
      delivery:=row_data.zone_delivery
        + case when row_data.weight_to_kg is not null then ceil(greatest(row_data.weight_kg-row_data.weight_to_kg,0))*row_data.additional_kg_rate else 0 end
        + case when row_data.payment_type='cod' then row_data.cod_fee else 0 end;
    elsif row_data.return_charge_enabled then returned:=row_data.zone_return;
    end if;
    signature:=signature || format('%s:%s:%s:%s:%s:%s:%s:%s:%s;',row_data.id,row_data.zone_rate_id,row_data.delivery_charge,row_data.return_charge,delivery,returned,row_data.fulfillment_charge,row_data.cod_amount,row_data.currency);
    if row_data.delivery_charge=delivery and row_data.return_charge=returned then continue; end if;
    changed:=changed+1;
    after_charge:=delivery+returned+row_data.fulfillment_charge;
    previous:=coalesce(totals->row_data.currency,'{"before":0,"after":0}'::jsonb);
    totals:=totals || jsonb_build_object(row_data.currency,jsonb_build_object(
      'before',(previous->>'before')::numeric+row_data.total_charges,
      'after',(previous->>'after')::numeric+after_charge));
    if target_apply then
      update public.finance_ledger set delivery_charge=delivery,return_charge=returned,
        rate_snapshot=coalesce(rate_snapshot,'{}'::jsonb) || jsonb_build_object('zone_rate_id',row_data.zone_rate_id,'rate_source','zone','repriced_by',auth.uid(),'repriced_at',now(),'previous_delivery_charge',row_data.delivery_charge,'previous_return_charge',row_data.return_charge)
        where id=row_data.id and organization_id=org;
    end if;
  end loop;
  preview_token:=md5(signature);
  if target_apply and target_preview_token is distinct from preview_token then raise exception 'Rates or unbilled shipments changed. Refresh the preview before applying.'; end if;
  return jsonb_build_object('preview_token',preview_token,'changed',changed,'skipped',skipped,'totals',totals,'applied',coalesce(target_apply,false));
end;
$$;
revoke all on function public.reprice_unbilled_zone_charges(uuid,boolean,text) from public,anon;
grant execute on function public.reprice_unbilled_zone_charges(uuid,boolean,text) to authenticated;
