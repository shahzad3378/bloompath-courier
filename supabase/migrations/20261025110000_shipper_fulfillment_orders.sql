alter table public.fulfillment_orders
  add column if not exists shipper_id uuid references public.profiles(id) on delete set null,
  add column if not exists shipper_reference text;

drop policy if exists "fulfillment staff can read products" on public.fulfillment_products;
create policy "fulfillment users can read products"
on public.fulfillment_products for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
      and p.role in ('super_admin','operations_admin','warehouse_staff','shipper')
  )
);

drop policy if exists "fulfillment staff can read orders" on public.fulfillment_orders;
create policy "fulfillment staff and owners can read orders"
on public.fulfillment_orders for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
      and (
        p.role in ('super_admin','operations_admin','warehouse_staff')
        or (p.role = 'shipper' and fulfillment_orders.shipper_id = p.id)
      )
  )
);

create or replace function public.fulfillment_create_shipper_orders(p_orders jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_row jsonb;
  v_product public.fulfillment_products%rowtype;
  v_quantity integer;
  v_name text;
  v_phone text;
  v_address text;
  v_order_id uuid;
  v_count integer := 0;
begin
  select * into v_actor from public.profiles where id = (select auth.uid()) and status = 'active';
  if not found or v_actor.role <> 'shipper' or v_actor.organization_id is null then
    raise exception 'Active shipper account required';
  end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) < 1 or jsonb_array_length(p_orders) > 200 then
    raise exception 'Upload must contain between 1 and 200 order rows';
  end if;

  for v_row in select value from jsonb_array_elements(p_orders)
  loop
    v_quantity := (v_row->>'quantity')::integer;
    v_name := left(trim(coalesce(v_row->>'recipient_name','')),160);
    v_phone := left(trim(coalesce(v_row->>'recipient_phone','')),50);
    v_address := left(trim(coalesce(v_row->>'delivery_address','')),500);
    if v_quantity < 1 or v_quantity > 1000 or char_length(v_name) not between 2 and 160
      or char_length(v_phone) not between 3 and 50 or char_length(v_address) not between 5 and 500 then
      raise exception 'Invalid recipient or quantity in row %', v_count + 1;
    end if;

    select * into v_product from public.fulfillment_products
    where id = (v_row->>'product_id')::uuid
      and organization_id = v_actor.organization_id and active
    for update;
    if not found or v_product.quantity_on_hand - v_product.quantity_reserved < v_quantity then
      raise exception 'Insufficient stock or product unavailable in row %', v_count + 1;
    end if;

    insert into public.fulfillment_orders (
      organization_id, order_number, shipper_id, shipper_reference,
      recipient_name, recipient_phone, delivery_address, product_id, sku,
      product_name, quantity, created_by
    ) values (
      v_actor.organization_id,
      'FUL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      v_actor.id, nullif(left(trim(coalesce(v_row->>'order_reference','')),120),''),
      v_name, v_phone, v_address, v_product.id, v_product.sku,
      v_product.name, v_quantity, v_actor.id
    ) returning id into v_order_id;

    update public.fulfillment_products
    set quantity_reserved = quantity_reserved + v_quantity, updated_at = now()
    where id = v_product.id and organization_id = v_actor.organization_id;
    insert into public.fulfillment_inventory_movements
      (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
    values
      (v_actor.organization_id,v_product.id,'reserved',v_quantity,'Shipper fulfillment order',v_order_id,v_actor.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.fulfillment_create_shipper_orders(jsonb) from public, anon;
grant execute on function public.fulfillment_create_shipper_orders(jsonb) to authenticated;
