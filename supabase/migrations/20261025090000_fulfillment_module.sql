-- Tenant-scoped storage inventory and basic fulfillment order workflow.
create table public.fulfillment_products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null check (char_length(sku) between 1 and 80), name text not null check (char_length(name) between 1 and 180),
  location text not null default 'MAIN' check (char_length(location) between 1 and 80), quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, sku), unique (id, organization_id)
);
create index fulfillment_products_org_name_idx on public.fulfillment_products (organization_id, name);
create table public.fulfillment_orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null, recipient_name text not null check (char_length(recipient_name) between 2 and 160), recipient_phone text not null check (char_length(recipient_phone) between 3 and 50),
  delivery_address text not null check (char_length(delivery_address) between 5 and 500), product_id uuid not null, sku text not null, product_name text not null,
  quantity integer not null check (quantity > 0), status text not null default 'queued' check (status in ('queued','picking','packed','dispatched','cancelled')),
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, order_number), foreign key (product_id, organization_id) references public.fulfillment_products(id, organization_id) on delete restrict
);
create index fulfillment_orders_org_status_idx on public.fulfillment_orders (organization_id, status, created_at desc);
create table public.fulfillment_inventory_movements (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null, movement_type text not null check (movement_type in ('received','reserved','released','dispatched','adjusted')),
  quantity integer not null check (quantity > 0), note text, order_id uuid references public.fulfillment_orders(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  foreign key (product_id, organization_id) references public.fulfillment_products(id, organization_id) on delete cascade
);
create index fulfillment_movements_product_idx on public.fulfillment_inventory_movements (organization_id, product_id, created_at desc);
alter table public.fulfillment_products enable row level security;
alter table public.fulfillment_orders enable row level security;
alter table public.fulfillment_inventory_movements enable row level security;
revoke all on public.fulfillment_products, public.fulfillment_orders, public.fulfillment_inventory_movements from anon;
grant select, insert, update on public.fulfillment_products, public.fulfillment_orders, public.fulfillment_inventory_movements to authenticated;
grant usage, select on sequence public.fulfillment_inventory_movements_id_seq to authenticated;
create policy "fulfillment staff can read products" on public.fulfillment_products for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create policy "fulfillment staff can manage products" on public.fulfillment_products for all to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))) with check (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create policy "fulfillment staff can read orders" on public.fulfillment_orders for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create policy "fulfillment staff can manage orders" on public.fulfillment_orders for all to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff'))) with check (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create policy "fulfillment staff can read movements" on public.fulfillment_inventory_movements for select to authenticated using (organization_id = (select private.current_organization_id()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create policy "fulfillment staff can add movements" on public.fulfillment_inventory_movements for insert to authenticated with check (organization_id = (select private.current_organization_id()) and created_by=(select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active' and p.role in ('super_admin','operations_admin','warehouse_staff')));
create or replace function public.fulfillment_receive_stock(p_product_id uuid, p_quantity integer, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_org uuid := (select private.current_organization_id());
begin
 if p_quantity < 1 or p_quantity > 100000 then raise exception 'Quantity must be between 1 and 100000'; end if;
 update public.fulfillment_products set quantity_on_hand=quantity_on_hand+p_quantity, updated_at=now() where id=p_product_id and organization_id=v_org and active;
 if not found then raise exception 'Product not found or inactive'; end if;
 insert into public.fulfillment_inventory_movements (organization_id,product_id,movement_type,quantity,note,created_by) values (v_org,p_product_id,'received',p_quantity,nullif(left(trim(coalesce(p_note,'')),240),''),(select auth.uid()));
end $$;
revoke all on function public.fulfillment_receive_stock(uuid,integer,text) from public, anon;
grant execute on function public.fulfillment_receive_stock(uuid,integer,text) to authenticated;
create or replace function public.fulfillment_create_order(p_product_id uuid, p_quantity integer, p_recipient_name text, p_recipient_phone text, p_delivery_address text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_org uuid := (select private.current_organization_id()); v_product public.fulfillment_products%rowtype; v_order_id uuid;
begin
 if p_quantity < 1 or p_quantity > 1000 then raise exception 'Quantity must be between 1 and 1000'; end if;
 if char_length(trim(p_recipient_name)) not between 2 and 160 or char_length(trim(p_recipient_phone)) not between 3 and 50 or char_length(trim(p_delivery_address)) not between 5 and 500 then raise exception 'Check recipient details'; end if;
 select * into v_product from public.fulfillment_products where id=p_product_id and organization_id=v_org and active for update;
 if not found or v_product.quantity_on_hand-v_product.quantity_reserved < p_quantity then raise exception 'Insufficient available stock'; end if;
 insert into public.fulfillment_orders (organization_id,order_number,recipient_name,recipient_phone,delivery_address,product_id,sku,product_name,quantity,created_by)
 values (v_org,'FUL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),trim(p_recipient_name),trim(p_recipient_phone),trim(p_delivery_address),v_product.id,v_product.sku,v_product.name,p_quantity,(select auth.uid())) returning id into v_order_id;
 update public.fulfillment_products set quantity_reserved=quantity_reserved+p_quantity,updated_at=now() where id=v_product.id;
 insert into public.fulfillment_inventory_movements (organization_id,product_id,movement_type,quantity,note,order_id,created_by) values (v_org,v_product.id,'reserved',p_quantity,'Fulfillment order',v_order_id,(select auth.uid()));
 return v_order_id;
end $$;
revoke all on function public.fulfillment_create_order(uuid,integer,text,text,text) from public, anon;
grant execute on function public.fulfillment_create_order(uuid,integer,text,text,text) to authenticated;

create or replace function public.fulfillment_advance_order(p_order_id uuid, p_next_status text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_org uuid := (select private.current_organization_id()); v_order public.fulfillment_orders%rowtype;
begin
 select * into v_order from public.fulfillment_orders where id=p_order_id and organization_id=v_org for update;
 if not found then raise exception 'Order not found'; end if;
 if not ((v_order.status='queued' and p_next_status='picking') or (v_order.status='picking' and p_next_status='packed') or (v_order.status='packed' and p_next_status='dispatched')) then raise exception 'Invalid fulfillment status transition'; end if;
 update public.fulfillment_orders set status=p_next_status, updated_at=now() where id=v_order.id;
 if p_next_status='dispatched' then
   update public.fulfillment_products set quantity_on_hand=quantity_on_hand-v_order.quantity, quantity_reserved=quantity_reserved-v_order.quantity, updated_at=now()
   where id=v_order.product_id and organization_id=v_org and quantity_on_hand>=v_order.quantity and quantity_reserved>=v_order.quantity;
   if not found then raise exception 'Reserved stock could not be released'; end if;
   insert into public.fulfillment_inventory_movements (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
   values (v_org,v_order.product_id,'dispatched',v_order.quantity,'Fulfillment dispatched',v_order.id,(select auth.uid()));
 end if;
end $$;
revoke all on function public.fulfillment_advance_order(uuid,text) from public, anon;
grant execute on function public.fulfillment_advance_order(uuid,text) to authenticated;
