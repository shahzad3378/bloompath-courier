-- Let fulfillment staff create the same stock-reserving, multi-SKU orders as shippers.
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
begin
  select * into v_actor from public.profiles where id = (select auth.uid()) and status = 'active';
  if not found or v_actor.role not in ('shipper','super_admin','operations_admin','warehouse_staff') or v_actor.organization_id is null then
    raise exception 'Active fulfillment user required';
  end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) < 1 or jsonb_array_length(p_orders) > 200 then
    raise exception 'Upload must contain between 1 and 200 customer orders';
  end if;
  for v_order in select value from jsonb_array_elements(p_orders) loop
    v_name := left(trim(coalesce(v_order->>'recipient_name','')),160);
    v_phone := left(trim(coalesce(v_order->>'recipient_phone','')),50);
    v_address := left(trim(coalesce(v_order->>'delivery_address','')),500);
    v_reference := nullif(left(trim(coalesce(v_order->>'order_reference','')),120),'');
    if char_length(v_name) not between 2 and 160 or char_length(v_phone) not between 3 and 50
      or char_length(v_address) not between 5 and 500 then
      raise exception 'Invalid recipient details for order %', v_count + 1;
    end if;
    if jsonb_typeof(v_order->'items') <> 'array' or jsonb_array_length(v_order->'items') < 1 or jsonb_array_length(v_order->'items') > 50 then
      raise exception 'Each order must contain between 1 and 50 products';
    end if;
    v_order_number := 'FUL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    for v_item in select value from jsonb_array_elements(v_order->'items') loop
      v_quantity := (v_item->>'quantity')::integer;
      if v_quantity < 1 or v_quantity > 1000 then raise exception 'Product quantity must be between 1 and 1,000'; end if;
      select * into v_product from public.fulfillment_products
        where id = (v_item->>'product_id')::uuid and organization_id = v_actor.organization_id and active for update;
      if not found or v_product.quantity_on_hand - v_product.quantity_reserved < v_quantity then
        raise exception 'Insufficient stock or product unavailable';
      end if;
      insert into public.fulfillment_orders
        (organization_id,order_number,shipper_id,shipper_reference,recipient_name,recipient_phone,delivery_address,product_id,sku,product_name,quantity,created_by)
      values
        (v_actor.organization_id,v_order_number,case when v_actor.role='shipper' then v_actor.id else null end,v_reference,v_name,v_phone,v_address,v_product.id,v_product.sku,v_product.name,v_quantity,v_actor.id)
      returning id into v_order_id;
      update public.fulfillment_products set quantity_reserved = quantity_reserved + v_quantity, updated_at = now()
        where id = v_product.id and organization_id = v_actor.organization_id;
      insert into public.fulfillment_inventory_movements
        (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
      values (v_actor.organization_id,v_product.id,'reserved',v_quantity,'Fulfillment order',v_order_id,v_actor.id);
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.fulfillment_create_shipper_orders(jsonb) from public, anon;
grant execute on function public.fulfillment_create_shipper_orders(jsonb) to authenticated;
