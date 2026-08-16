-- BloomPath Courier SaaS
-- Invoice workflow with AWB-level finance traceability.

create table public.invoices (
  id bigint generated always as identity primary key,

  organization_id uuid not null
    references public.organizations(id) on delete restrict,

  settlement_id bigint not null unique
    references public.settlements(id) on delete restrict,

  shipper_id uuid not null
    references public.profiles(id) on delete restrict,

  invoice_number text not null unique,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'issued',
        'sent',
        'paid',
        'overdue',
        'cancelled'
      )
    ),

  currency text not null default 'AED',

  subtotal numeric(12,2) not null default 0
    check (subtotal >= 0),

  tax_rate numeric(6,3) not null default 0
    check (tax_rate >= 0),

  tax_amount numeric(12,2) not null default 0
    check (tax_amount >= 0),

  total_amount numeric(12,2) not null default 0
    check (total_amount >= 0),

  cod_collected numeric(12,2) not null default 0
    check (cod_collected >= 0),

  total_delivery_charges numeric(12,2) not null default 0
    check (total_delivery_charges >= 0),

  total_return_charges numeric(12,2) not null default 0
    check (total_return_charges >= 0),

  net_settlement_payable numeric(12,2) not null default 0,

  invoice_date date not null default current_date,
  due_date date,

  recipient_email text,

  issued_at timestamptz,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete restrict,

  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete restrict,

  payment_reference text,
  notes text,

  created_by uuid not null
    references public.profiles(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    due_date is null
    or due_date >= invoice_date
  )
);

create index invoices_org_status_idx
on public.invoices (
  organization_id,
  status,
  invoice_date desc
);

create index invoices_shipper_idx
on public.invoices (
  organization_id,
  shipper_id,
  invoice_date desc
);


create table public.invoice_items (
  id bigint generated always as identity primary key,

  invoice_id bigint not null
    references public.invoices(id) on delete cascade,

  settlement_item_id bigint not null
    references public.settlement_items(id) on delete restrict,

  ledger_id bigint not null
    references public.finance_ledger(id) on delete restrict,

  shipment_id bigint not null
    references public.shipments(id) on delete restrict,

  tracking_number text not null,

  delivered_at timestamptz,

  consignee_name text,
  consignee_city text,

  cod_amount numeric(12,2) not null default 0,
  delivery_charge numeric(12,2) not null default 0,
  return_charge numeric(12,2) not null default 0,
  total_charges numeric(12,2) not null default 0,
  net_payable numeric(12,2) not null default 0,

  created_at timestamptz not null default now(),

  unique (invoice_id, settlement_item_id),
  unique (invoice_id, ledger_id)
);

create index invoice_items_invoice_idx
on public.invoice_items(invoice_id);

create index invoice_items_shipment_idx
on public.invoice_items(shipment_id);

create index invoice_items_tracking_idx
on public.invoice_items(tracking_number);


create sequence if not exists public.invoice_number_seq
start 1;


create or replace function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seq bigint;
begin
  if new.invoice_number is null
     or btrim(new.invoice_number) = '' then

    seq := nextval('public.invoice_number_seq');

    new.invoice_number :=
      'INV-' ||
      to_char(now() at time zone 'Asia/Dubai', 'YYYY') ||
      '-' ||
      lpad(seq::text, 6, '0');
  end if;

  return new;
end;
$$;

revoke all on function private.assign_invoice_number() from public;

create trigger invoices_assign_number
before insert on public.invoices
for each row
execute function private.assign_invoice_number();


create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function private.set_updated_at();


alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoices from anon;
revoke all on public.invoice_items from anon;

grant select, insert, update on public.invoices to authenticated;
grant select, insert on public.invoice_items to authenticated;

grant usage on sequence public.invoices_id_seq to authenticated;
grant usage on sequence public.invoice_items_id_seq to authenticated;


create policy "finance can manage invoices"
on public.invoices
for all
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
  and (select private.can_manage_finance())
)
with check (
  organization_id =
    (select private.current_organization_id())
  and (select private.can_manage_finance())
);


create policy "shipper can read own invoices"
on public.invoices
for select
to authenticated
using (
  organization_id =
    (select private.current_organization_id())
  and shipper_id = (select auth.uid())
  and status in (
    'issued',
    'sent',
    'paid',
    'overdue'
  )
);


create policy "finance can manage invoice items"
on public.invoice_items
for all
to authenticated
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.organization_id =
        (select private.current_organization_id())
      and (select private.can_manage_finance())
  )
)
with check (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.organization_id =
        (select private.current_organization_id())
      and (select private.can_manage_finance())
  )
);


create policy "shipper can read own invoice items"
on public.invoice_items
for select
to authenticated
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and i.organization_id =
        (select private.current_organization_id())
      and i.shipper_id = (select auth.uid())
      and i.status in (
        'issued',
        'sent',
        'paid',
        'overdue'
      )
  )
);


create or replace function public.create_invoice_from_settlement(
  target_settlement_id bigint,
  target_due_date date default null,
  target_tax_rate numeric default 0,
  target_recipient_email text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement_record public.settlements%rowtype;
  invoice_id bigint;
  service_subtotal numeric(12,2);
  calculated_tax numeric(12,2);
begin
  if not (select private.can_manage_finance()) then
    raise exception 'Finance access is required.';
  end if;

  select *
  into settlement_record
  from public.settlements
  where id = target_settlement_id
    and organization_id =
      (select private.current_organization_id())
  for update;

  if settlement_record.id is null then
    raise exception 'Settlement not found.';
  end if;

  if settlement_record.status <> 'approved' then
    raise exception 'Only approved settlements can be invoiced.';
  end if;

  if exists (
    select 1
    from public.invoices
    where settlement_id = settlement_record.id
  ) then
    raise exception 'An invoice already exists for this settlement.';
  end if;

  service_subtotal :=
    settlement_record.total_charges;

  calculated_tax :=
    round(
      service_subtotal *
      greatest(coalesce(target_tax_rate, 0), 0) /
      100,
      2
    );

  insert into public.invoices (
    organization_id,
    settlement_id,
    shipper_id,
    invoice_number,
    status,
    currency,
    subtotal,
    tax_rate,
    tax_amount,
    total_amount,
    cod_collected,
    total_delivery_charges,
    total_return_charges,
    net_settlement_payable,
    due_date,
    recipient_email,
    created_by
  )
  values (
    settlement_record.organization_id,
    settlement_record.id,
    settlement_record.shipper_id,
    '',
    'draft',
    settlement_record.currency,
    service_subtotal,
    greatest(coalesce(target_tax_rate, 0), 0),
    calculated_tax,
    service_subtotal + calculated_tax,
    settlement_record.total_cod,
    settlement_record.total_delivery_charges,
    settlement_record.total_return_charges,
    settlement_record.net_payable,
    target_due_date,
    nullif(btrim(target_recipient_email), ''),
    (select auth.uid())
  )
  returning id into invoice_id;

  insert into public.invoice_items (
    invoice_id,
    settlement_item_id,
    ledger_id,
    shipment_id,
    tracking_number,
    delivered_at,
    consignee_name,
    consignee_city,
    cod_amount,
    delivery_charge,
    return_charge,
    total_charges,
    net_payable
  )
  select
    invoice_id,
    si.id,
    si.ledger_id,
    si.shipment_id,
    si.tracking_number,
    s.delivered_at,
    s.consignee_name,
    s.consignee_city,
    si.cod_amount,
    si.delivery_charge,
    si.return_charge,
    si.total_charges,
    si.net_payable
  from public.settlement_items si
  join public.shipments s
    on s.id = si.shipment_id
  where si.settlement_id = settlement_record.id;

  return invoice_id;
end;
$$;

revoke all on function public.create_invoice_from_settlement(
  bigint,
  date,
  numeric,
  text
) from public;

grant execute on function public.create_invoice_from_settlement(
  bigint,
  date,
  numeric,
  text
) to authenticated;

-- AWB finance traceability helper view.
create or replace view public.awb_finance_trace
with (security_invoker = true)
as
select
  fl.organization_id,
  fl.shipment_id,
  fl.tracking_number,

  s.id as settlement_id,
  s.settlement_number,
  s.status as settlement_status,

  i.id as invoice_id,
  i.invoice_number,
  i.status as invoice_status,
  i.invoice_date,
  i.due_date,
  i.sent_at,
  i.paid_at,
  i.payment_reference,

  ii.cod_amount,
  ii.delivery_charge,
  ii.return_charge,
  ii.total_charges,
  ii.net_payable

from public.finance_ledger fl

left join public.settlement_items si
  on si.ledger_id = fl.id

left join public.settlements s
  on s.id = si.settlement_id

left join public.invoice_items ii
  on ii.ledger_id = fl.id

left join public.invoices i
  on i.id = ii.invoice_id;


grant select
on public.awb_finance_trace
to authenticated;

