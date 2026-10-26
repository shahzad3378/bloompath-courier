alter table public.fulfillment_orders
  add constraint fulfillment_orders_id_organization_unique unique (id, organization_id);

alter table public.shipments
  add column fulfillment_order_id uuid;

alter table public.shipments
  add constraint shipments_fulfillment_order_tenant_fkey
  foreign key (fulfillment_order_id, organization_id)
  references public.fulfillment_orders (id, organization_id)
  on delete restrict;

create unique index shipments_fulfillment_order_once_idx
  on public.shipments (organization_id, fulfillment_order_id)
  where fulfillment_order_id is not null;
