drop policy if exists "staff can read fulfillment order charges" on public.fulfillment_order_service_charges;
drop policy if exists "shippers can read own fulfillment order charges" on public.fulfillment_order_service_charges;
create policy "authorized users can read fulfillment order charges"
on public.fulfillment_order_service_charges for select to authenticated
using (
  organization_id=(select private.current_organization_id())
  and (
    shipper_id=(select auth.uid())
    or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff'))
  )
);
