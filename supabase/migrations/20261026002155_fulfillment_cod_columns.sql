-- COD-enabled fulfillment orders and financial settlement integration.

alter table public.fulfillment_orders
  add column if not exists payment_type public.payment_type not null default 'cod',
  add column if not exists cod_amount numeric(12,2) not null default 0
    check (cod_amount >= 0);

alter table public.finance_ledger
  add column if not exists fulfillment_charge numeric(12,2) not null default 0
    check (fulfillment_charge >= 0);

alter table public.finance_ledger
  drop column total_charges,
  drop column net_payable;
alter table public.finance_ledger
  add column total_charges numeric(12,2)
    generated always as (delivery_charge + return_charge + fulfillment_charge) stored,
  add column net_payable numeric(12,2)
    generated always as (cod_amount - delivery_charge - return_charge - fulfillment_charge) stored;

alter table public.settlements
  add column if not exists total_fulfillment_charges numeric(12,2) not null default 0;
alter table public.settlement_items
  add column if not exists fulfillment_charge numeric(12,2) not null default 0;

alter table public.invoices
  add column if not exists total_delivery_charges numeric(12,2) not null default 0,
  add column if not exists total_return_charges numeric(12,2) not null default 0,
  add column if not exists total_fulfillment_charges numeric(12,2) not null default 0;
alter table public.invoice_items
  add column if not exists fulfillment_charge numeric(12,2) not null default 0,
  add column if not exists delivered_at timestamptz,
  add column if not exists consignee_name text,
  add column if not exists consignee_city text,
  add column if not exists total_charges numeric(12,2) not null default 0,
  add column if not exists net_payable numeric(12,2) not null default 0;

