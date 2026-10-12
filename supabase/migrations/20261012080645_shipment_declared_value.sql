-- Store a declared shipment value separately from cash-on-delivery collection.
alter table public.shipments
  add column declared_value numeric(12,2) not null default 0;

alter table public.shipments
  add constraint shipments_declared_value_nonnegative check (declared_value >= 0);
