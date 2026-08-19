-- BloomPath Courier SaaS
-- Seller / shipper VAT commercial configuration.

alter table public.shipper_rates
add column if not exists vat_applicable boolean not null default false;

alter table public.shipper_rates
add column if not exists vat_rate numeric(6,3) not null default 0
check (vat_rate >= 0 and vat_rate <= 100);

alter table public.shipper_rates
add column if not exists vat_inclusive boolean not null default false;

alter table public.shipper_rates
add column if not exists tax_registration_number text;


comment on column public.shipper_rates.vat_applicable is
'Whether VAT/tax applies to courier service charges for this shipper.';

comment on column public.shipper_rates.vat_rate is
'VAT percentage applicable to service charges, for example 5.000.';

comment on column public.shipper_rates.vat_inclusive is
'True when configured courier rates already include VAT; false when VAT is added on top.';

comment on column public.shipper_rates.tax_registration_number is
'Seller/customer tax registration number displayed on invoices when applicable.';
