-- BloomPath Courier V1
-- COD & Finance foundation

create table public.shipper_rates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipper_id uuid not null references public.profiles(id) on delete cascade,

  delivery_rate numeric(12,2) not null default 0
    check (delivery_rate >= 0),

  return_charge_enabled boolean not null default false,

  return_rate numeric(12,2) not null default 0
    check (return_rate >= 0),

  currency text not null default 'AED',

  effective_from timestamptz not null default now(),
  effective_to timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete restrict,

  check (effective_to is null or effective_to > effective_from)
);

create index shipper_rates_shipper_idx
on public.shipper_rates (organization_id, shipper_id, effective_from desc);


create table public.finance_ledger (
  id bigint generated always as identity primary key,

  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipment_id bigint not null references public.shipments(id) on delete restrict,
  shipper_id uuid not null references public.profiles(id) on delete restrict,

  tracking_number text not null,

  transaction_type text not null
    check (transaction_type in ('delivered', 'returned_to_shipper')),

  payment_type public.payment_type not null,

  cod_amount numeric(12,2) not null default 0
    check (cod_amount >= 0),

  delivery_charge numeric(12,2) not null default 0
    check (delivery_charge >= 0),

  return_charge numeric(12,2) not null default 0
    check (return_charge >= 0),

  total_charges numeric(12,2)
    generated always as (delivery_charge + return_charge) stored,

  net_payable numeric(12,2)
    generated always as (cod_amount - delivery_charge - return_charge) stored,

  currency text not null default 'AED',

  rate_snapshot jsonb not null default '{}'::jsonb,

  transaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (shipment_id, transaction_type)
);

create index finance_ledger_shipper_idx
on public.finance_ledger
(organization_id, shipper_id, transaction_at desc);


create table public.settlements (
  id bigint generated always as identity primary key,

  organization_id uuid not null references public.organizations(id) on delete restrict,
  shipper_id uuid not null references public.profiles(id) on delete restrict,

  settlement_number text not null unique,

  status text not null default 'draft'
    check (status in ('draft', 'approved', 'paid', 'cancelled')),

  currency text not null default 'AED',

  total_cod numeric(12,2) not null default 0,
  total_delivery_charges numeric(12,2) not null default 0,
  total_return_charges numeric(12,2) not null default 0,
  total_charges numeric(12,2) not null default 0,
  net_payable numeric(12,2) not null default 0,

  period_from timestamptz,
  period_to timestamptz,

  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  paid_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table public.settlement_items (
  id bigint generated always as identity primary key,

  settlement_id bigint not null
    references public.settlements(id) on delete cascade,

  ledger_id bigint not null
    references public.finance_ledger(id) on delete restrict,

  shipment_id bigint not null
    references public.shipments(id) on delete restrict,

  tracking_number text not null,

  cod_amount numeric(12,2) not null default 0,
  delivery_charge numeric(12,2) not null default 0,
  return_charge numeric(12,2) not null default 0,
  total_charges numeric(12,2) not null default 0,
  net_payable numeric(12,2) not null default 0,

  created_at timestamptz not null default now(),

  unique (settlement_id, ledger_id)
);

create unique index settlement_items_unsettled_ledger_idx
on public.settlement_items (ledger_id);


alter table public.shipper_rates enable row level security;
alter table public.finance_ledger enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_items enable row level security;


create policy "finance staff can manage shipper rates"
on public.shipper_rates
for all
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
);


create policy "finance staff can read ledger"
on public.finance_ledger
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
);


create policy "finance staff can manage settlements"
on public.settlements
for all
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.can_manage_shipments())
);


create policy "finance staff can manage settlement items"
on public.settlement_items
for all
to authenticated
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_id
      and s.organization_id = (select private.current_organization_id())
      and (select private.can_manage_shipments())
  )
)
with check (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_id
      and s.organization_id = (select private.current_organization_id())
      and (select private.can_manage_shipments())
  )
);
