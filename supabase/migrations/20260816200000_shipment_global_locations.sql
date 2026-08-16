-- Connect shipments to BloomPath global market + service-zone foundation.

alter table public.shipments
  add column if not exists sender_country_code text,
  add column if not exists sender_postal_code text,
  add column if not exists consignee_country_code text,
  add column if not exists consignee_postal_code text,
  add column if not exists service_zone_id bigint,
  add column if not exists service_zone_name text;

alter table public.shipments
  add constraint shipments_sender_country_code_fkey
  foreign key (sender_country_code)
  references public.countries(code)
  on delete restrict;

alter table public.shipments
  add constraint shipments_consignee_country_code_fkey
  foreign key (consignee_country_code)
  references public.countries(code)
  on delete restrict;

alter table public.shipments
  add constraint shipments_service_zone_id_fkey
  foreign key (service_zone_id)
  references public.service_zones(id)
  on delete restrict;

create index if not exists shipments_org_country_idx
on public.shipments (
  organization_id,
  consignee_country_code,
  created_at desc
);

create index if not exists shipments_service_zone_idx
on public.shipments (
  organization_id,
  service_zone_id
)
where service_zone_id is not null;

create index if not exists shipments_postal_code_idx
on public.shipments (
  organization_id,
  consignee_country_code,
  consignee_postal_code
)
where consignee_postal_code is not null;

comment on column public.shipments.sender_country_code is
  'ISO 3166-1 alpha-2 pickup country code.';

comment on column public.shipments.consignee_country_code is
  'ISO 3166-1 alpha-2 delivery country code.';

comment on column public.shipments.consignee_postal_code is
  'Destination postal/ZIP code where applicable.';

comment on column public.shipments.service_zone_id is
  'Automatically resolved courier service zone at booking time.';

comment on column public.shipments.service_zone_name is
  'Snapshot of resolved service zone name at booking time.';
