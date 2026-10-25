alter table public.fulfillment_product_shipper_rates
  add column fulfillment_group text not null default 'GENERAL'
    check (fulfillment_group ~ '^[A-Z0-9_ -]{1,60}$');

create table public.fulfillment_group_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_code text not null check (group_code ~ '^[A-Z0-9_ -]{1,60}$'),
  group_name text not null check (char_length(group_name) between 1 and 80),
  order_charge numeric(12,2) not null check (order_charge >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, group_code)
);
create index fulfillment_group_charges_org_idx on public.fulfillment_group_charges (organization_id, group_code);
alter table public.fulfillment_group_charges enable row level security;
revoke all on public.fulfillment_group_charges from anon;
grant select, insert, update on public.fulfillment_group_charges to authenticated;
create policy "fulfillment staff can read group charges" on public.fulfillment_group_charges for select to authenticated
using (organization_id=(select private.current_organization_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff')));
create policy "fulfillment staff can add group charges" on public.fulfillment_group_charges for insert to authenticated
with check (organization_id=(select private.current_organization_id()) and created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff')));
create policy "fulfillment staff can update group charges" on public.fulfillment_group_charges for update to authenticated
using (organization_id=(select private.current_organization_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff')))
with check (organization_id=(select private.current_organization_id()) and created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff')));

insert into public.fulfillment_group_charges (organization_id,group_code,group_name,order_charge,currency)
select id,'FACE_CREAM','Face Cream',6,'AED' from public.organizations
on conflict (organization_id,group_code) do nothing;
insert into public.fulfillment_group_charges (organization_id,group_code,group_name,order_charge,currency)
select id,'GENERAL','General Item',5,'AED' from public.organizations
on conflict (organization_id,group_code) do nothing;

alter table public.fulfillment_product_shipper_rates
  add constraint fulfillment_product_shipper_rates_group_fkey
  foreign key (organization_id,fulfillment_group)
  references public.fulfillment_group_charges(organization_id,group_code)
  on update cascade on delete restrict;

create table public.fulfillment_order_service_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  shipper_id uuid references public.profiles(id) on delete set null,
  group_code text not null,
  group_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create index fulfillment_order_service_charges_shipper_idx on public.fulfillment_order_service_charges (organization_id,shipper_id,created_at desc);
alter table public.fulfillment_order_service_charges enable row level security;
revoke all on public.fulfillment_order_service_charges from anon;
grant select on public.fulfillment_order_service_charges to authenticated;
create policy "staff can read fulfillment order charges" on public.fulfillment_order_service_charges for select to authenticated
using (organization_id=(select private.current_organization_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff','finance_staff')));
create policy "shippers can read own fulfillment order charges" on public.fulfillment_order_service_charges for select to authenticated
using (organization_id=(select private.current_organization_id()) and shipper_id=(select auth.uid()));

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
  v_group text;
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
    v_group := upper(trim(coalesce(v_row->>'fulfillment_group','GENERAL')));
    if char_length(v_sku) not between 1 and 80 or char_length(v_name) not between 1 and 180
      or char_length(v_location) > 80 or v_cost < 0 or v_currency !~ '^[A-Z]{3}$'
      or v_group !~ '^[A-Z0-9_ -]{1,60}$' then
      raise exception 'Invalid product, group or rate values';
    end if;
    if not exists(select 1 from public.fulfillment_group_charges where organization_id=v_org and group_code=v_group) then
      raise exception 'Fulfillment group % has no configured order charge',v_group;
    end if;
    insert into public.fulfillment_products (organization_id,sku,name,location)
    values (v_org,v_sku,v_name,v_location)
    on conflict (organization_id,sku) do nothing;
    select id into v_product_id from public.fulfillment_products
      where organization_id=v_org and sku=v_sku and active for update;
    if not found then raise exception 'Product SKU % is inactive or unavailable', v_sku; end if;
    insert into public.fulfillment_product_shipper_rates
      (organization_id,product_id,shipper_id,unit_cost,currency,fulfillment_group,created_by,updated_at)
    values (v_org,v_product_id,p_shipper_id,v_cost,v_currency,v_group,v_actor,now())
    on conflict (organization_id,product_id,shipper_id)
    do update set unit_cost=excluded.unit_cost,currency=excluded.currency,fulfillment_group=excluded.fulfillment_group,created_by=excluded.created_by,updated_at=now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.fulfillment_import_products(uuid,jsonb) from public, anon;
grant execute on function public.fulfillment_import_products(uuid,jsonb) to authenticated;

create or replace function public.fulfillment_create_shipper_orders(p_orders jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.profiles%rowtype;
  v_order jsonb;
  v_item jsonb;
  v_product public.fulfillment_products%rowtype;
  v_quantity integer;
  v_name text;
  v_phone text;
  v_address text;
  v_reference text;
  v_order_number text;
  v_order_id uuid;
  v_count integer := 0;
  v_group_code text;
  v_group_name text;
  v_group_charge numeric(12,2);
  v_order_group_code text;
  v_order_group_name text;
  v_order_charge numeric(12,2);
  v_currency text;
begin
  select * into v_actor from public.profiles where id=(select auth.uid()) and status='active';
  if not found or v_actor.role not in ('shipper','super_admin','operations_admin','warehouse_staff') or v_actor.organization_id is null then raise exception 'Active fulfillment user required'; end if;
  if jsonb_typeof(p_orders)<>'array' or jsonb_array_length(p_orders)<1 or jsonb_array_length(p_orders)>200 then raise exception 'Upload must contain between 1 and 200 customer orders'; end if;
  for v_order in select value from jsonb_array_elements(p_orders) loop
    v_name:=left(trim(coalesce(v_order->>'recipient_name','')),160);
    v_phone:=left(trim(coalesce(v_order->>'recipient_phone','')),50);
    v_address:=left(trim(coalesce(v_order->>'delivery_address','')),500);
    v_reference:=nullif(left(trim(coalesce(v_order->>'order_reference','')),120),'');
    if char_length(v_name) not between 2 and 160 or char_length(v_phone) not between 3 and 50 or char_length(v_address) not between 5 and 500 then raise exception 'Invalid recipient details for order %',v_count+1; end if;
    if jsonb_typeof(v_order->'items')<>'array' or jsonb_array_length(v_order->'items')<1 or jsonb_array_length(v_order->'items')>50 then raise exception 'Each order must contain between 1 and 50 products'; end if;
    v_order_number:='FUL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    v_order_group_code:=null;v_order_group_name:=null;v_order_charge:=-1;v_currency:='AED';
    for v_item in select value from jsonb_array_elements(v_order->'items') loop
      v_quantity:=(v_item->>'quantity')::integer;
      if v_quantity<1 or v_quantity>1000 then raise exception 'Product quantity must be between 1 and 1,000'; end if;
      select * into v_product from public.fulfillment_products where id=(v_item->>'product_id')::uuid and organization_id=v_actor.organization_id and active for update;
      if not found or v_product.quantity_on_hand-v_product.quantity_reserved<v_quantity then raise exception 'Insufficient stock or product unavailable'; end if;
      insert into public.fulfillment_orders (organization_id,order_number,shipper_id,shipper_reference,recipient_name,recipient_phone,delivery_address,product_id,sku,product_name,quantity,created_by)
      values (v_actor.organization_id,v_order_number,case when v_actor.role='shipper' then v_actor.id else null end,v_reference,v_name,v_phone,v_address,v_product.id,v_product.sku,v_product.name,v_quantity,v_actor.id)
      returning id into v_order_id;
      update public.fulfillment_products set quantity_reserved=quantity_reserved+v_quantity,updated_at=now() where id=v_product.id and organization_id=v_actor.organization_id;
      insert into public.fulfillment_inventory_movements (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
      values (v_actor.organization_id,v_product.id,'reserved',v_quantity,'Fulfillment order',v_order_id,v_actor.id);
      select coalesce(r.fulfillment_group,'GENERAL') into v_group_code
        from public.fulfillment_products p
        left join public.fulfillment_product_shipper_rates r on r.organization_id=p.organization_id and r.product_id=p.id and r.shipper_id=case when v_actor.role='shipper' then v_actor.id else null end
        where p.id=v_product.id;
      if v_group_code is null then v_group_code:='GENERAL'; end if;
      select group_name,order_charge,currency into v_group_name,v_group_charge,v_currency from public.fulfillment_group_charges
        where organization_id=v_actor.organization_id and group_code=v_group_code;
      if not found then raise exception 'No fulfillment charge is configured for group %',v_group_code; end if;
      if v_order_charge < 0 or v_group_charge > v_order_charge then
        v_order_charge:=v_group_charge;v_order_group_code:=v_group_code;v_order_group_name:=v_group_name;
      end if;
    end loop;
    if v_order_charge < 0 then raise exception 'No fulfillment charge could be calculated'; end if;
    insert into public.fulfillment_order_service_charges (organization_id,order_number,shipper_id,group_code,group_name,amount,currency)
    values (v_actor.organization_id,v_order_number,case when v_actor.role='shipper' then v_actor.id else null end,v_order_group_code,v_order_group_name,v_order_charge,v_currency);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.fulfillment_create_shipper_orders(jsonb) from public, anon;
grant execute on function public.fulfillment_create_shipper_orders(jsonb) to authenticated;
