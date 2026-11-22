create table public.manual_undelivered_notes (
  event_id bigint primary key references public.customer_tracking_events(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 500)
);

alter table public.manual_undelivered_notes enable row level security;
revoke all on public.manual_undelivered_notes from public, anon, authenticated;
grant select, insert on public.manual_undelivered_notes to authenticated;

create policy "staff can read company manual delivery notes"
on public.manual_undelivered_notes for select to authenticated using (
  exists (
    select 1 from public.customer_tracking_events e
    join public.profiles p on p.id = (select auth.uid()) and p.organization_id = e.organization_id
    where e.id = event_id and p.status = 'active'
      and p.role in ('super_admin','operations_admin','warehouse_staff','dispatcher','finance_staff','customer_service')
  )
);

create policy "staff can add notes for their manual attempts"
on public.manual_undelivered_notes for insert to authenticated with check (
  exists (
    select 1 from public.customer_tracking_events e
    join public.profiles p on p.id = (select auth.uid()) and p.organization_id = e.organization_id
    where e.id = event_id and e.recorded_by = p.id and e.source = 'manual'
      and e.status = 'undelivered' and p.status = 'active'
      and p.role in ('super_admin','operations_admin','warehouse_staff')
  )
);

create function public.record_manual_undelivered_other(
  p_shipment_id bigint, p_organization_id uuid, p_occurred_at timestamptz, p_note text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_event_id bigint;
begin
  insert into public.customer_tracking_events (shipment_id, organization_id, status, source, recorded_by, created_at)
  values (p_shipment_id, p_organization_id, 'undelivered', 'manual', auth.uid(), p_occurred_at)
  returning id into v_event_id;

  insert into public.manual_undelivered_notes (event_id, note)
  values (v_event_id, btrim(p_note));
end;
$$;

revoke all on function public.record_manual_undelivered_other(bigint, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_manual_undelivered_other(bigint, uuid, timestamptz, text) to authenticated;
