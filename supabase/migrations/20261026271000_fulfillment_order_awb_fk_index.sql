create index shipments_fulfillment_order_fk_idx
  on public.shipments (fulfillment_order_id, organization_id)
  where fulfillment_order_id is not null;
