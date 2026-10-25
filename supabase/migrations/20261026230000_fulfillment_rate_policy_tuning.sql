drop policy if exists "fulfillment staff can manage shipper product rates" on public.fulfillment_product_shipper_rates;

create policy "fulfillment staff can add shipper product rates"
on public.fulfillment_product_shipper_rates for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and created_by=(select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
);

create policy "fulfillment staff can update shipper product rates"
on public.fulfillment_product_shipper_rates for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
)
with check (
  organization_id = (select private.current_organization_id())
  and created_by=(select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
);

create policy "fulfillment staff can delete shipper product rates"
on public.fulfillment_product_shipper_rates for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
);
