-- Cover the shipment event actor foreign key for profile deletion and audit queries.
create index shipment_events_created_by_idx
  on public.shipment_events (created_by);
