create table public.bloompath_shipper_agreements (
  shipper_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade
    check (organization_id = 'd89203fd-4ae6-460b-a27a-43c703f710b1'::uuid),
  enabled boolean not null default true,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  fulfillment_fee numeric(8,2) not null check (fulfillment_fee >= 0),
  fulfillment_checkpoint text not null check (fulfillment_checkpoint in ('dispatched', 'delivered')),
  customer_rates jsonb not null check (jsonb_typeof(customer_rates) = 'object'),
  carrier_costs jsonb not null check (jsonb_typeof(carrier_costs) = 'array'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.bloompath_shipper_agreements enable row level security;
revoke all on public.bloompath_shipper_agreements from public, anon, authenticated;
grant select, insert, update on public.bloompath_shipper_agreements to service_role;
