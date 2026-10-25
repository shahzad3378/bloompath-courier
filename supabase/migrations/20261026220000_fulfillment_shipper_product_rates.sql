create table public.fulfillment_product_shipper_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  shipper_id uuid not null,
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id, shipper_id),
  foreign key (product_id, organization_id) references public.fulfillment_products(id, organization_id) on delete cascade,
  foreign key (shipper_id, organization_id) references public.profiles(id, organization_id) on delete cascade
);

create index fulfillment_product_shipper_rates_lookup_idx
  on public.fulfillment_product_shipper_rates (organization_id, shipper_id, product_id);

alter table public.fulfillment_product_shipper_rates enable row level security;
revoke all on public.fulfillment_product_shipper_rates from anon;
grant select, insert, update, delete on public.fulfillment_product_shipper_rates to authenticated;

create policy "fulfillment staff can read shipper product rates"
on public.fulfillment_product_shipper_rates for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff'))
);

create policy "fulfillment staff can manage shipper product rates"
on public.fulfillment_product_shipper_rates for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
)
with check (
  organization_id = (select private.current_organization_id())
  and created_by=(select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))
);

create or replace function public.fulfillment_import_products(p_shipper_id uuid, p_products jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := (select private.current_organization_id());
  v_actor uuid := (select auth.uid());
  v_row jsonb;
  v_product_id uuid;
  v_sku text;
  v_name text;
  v_location text;
  v_cost numeric(12,2);
  v_currency text;
  v_count integer := 0;
begin
  if not exists (select 1 from public.profiles p where p.id=v_actor and p.organization_id=v_org and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')) then
    raise exception 'Active fulfillment staff required';
  end if;
  if not exists (select 1 from public.profiles p where p.id=p_shipper_id and p.organization_id=v_org and p.role='shipper' and p.status='active') then
    raise exception 'Select an active shipper';
  end if;
  if jsonb_typeof(p_products)<>'array' or jsonb_array_length(p_products)<1 or jsonb_array_length(p_products)>5000 then
    raise exception 'Upload must contain between 1 and 5000 products';
  end if;
  for v_row in select value from jsonb_array_elements(p_products) loop
    v_sku := upper(trim(coalesce(v_row->>'sku','')));
    v_name := trim(coalesce(v_row->>'name',''));
    v_location := coalesce(nullif(trim(coalesce(v_row->>'location','')),''),'MAIN');
    v_cost := (v_row->>'unit_cost')::numeric;
    v_currency := upper(trim(coalesce(v_row->>'currency','')));
    if char_length(v_sku) not between 1 and 80 or char_length(v_name) not between 1 and 180
      or char_length(v_location) > 80 or v_cost < 0 or v_currency !~ '^[A-Z]{3}$' then
      raise exception 'Invalid product or rate values';
    end if;
    insert into public.fulfillment_products (organization_id,sku,name,location)
    values (v_org,v_sku,v_name,v_location)
    on conflict (organization_id,sku) do nothing;
    select id into v_product_id from public.fulfillment_products
      where organization_id=v_org and sku=v_sku and active for update;
    if not found then raise exception 'Product SKU % is inactive or unavailable', v_sku; end if;
    insert into public.fulfillment_product_shipper_rates
      (organization_id,product_id,shipper_id,unit_cost,currency,created_by,updated_at)
    values (v_org,v_product_id,p_shipper_id,v_cost,v_currency,v_actor,now())
    on conflict (organization_id,product_id,shipper_id)
    do update set unit_cost=excluded.unit_cost,currency=excluded.currency,created_by=excluded.created_by,updated_at=now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.fulfillment_import_products(uuid,jsonb) from public, anon;
grant execute on function public.fulfillment_import_products(uuid,jsonb) to authenticated;
