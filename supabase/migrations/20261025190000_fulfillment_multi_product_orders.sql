-- Store each product as an order line, with one shared order number per customer order.
alter table public.fulfillment_orders
  drop constraint if exists fulfillment_orders_organization_id_order_number_key;
create index if not exists fulfillment_orders_org_number_idx
  on public.fulfillment_orders (organization_id, order_number);

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
  if not found or v_actor.role <> 'shipper' or v_actor.organization_id is null then
    raise exception 'Active shipper account required';
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
        (v_actor.organization_id,v_order_number,v_actor.id,v_reference,v_name,v_phone,v_address,v_product.id,v_product.sku,v_product.name,v_quantity,v_actor.id)
      returning id into v_order_id;
      update public.fulfillment_products set quantity_reserved = quantity_reserved + v_quantity, updated_at = now()
        where id = v_product.id and organization_id = v_actor.organization_id;
      insert into public.fulfillment_inventory_movements
        (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
      values (v_actor.organization_id,v_product.id,'reserved',v_quantity,'Shipper fulfillment order',v_order_id,v_actor.id);
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.fulfillment_create_shipper_orders(jsonb) from public, anon;
grant execute on function public.fulfillment_create_shipper_orders(jsonb) to authenticated;

create or replace function public.fulfillment_advance_order(p_order_id uuid,p_next_status text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid := (select private.current_organization_id());
  v_order public.fulfillment_orders%rowtype;
  v_line public.fulfillment_orders%rowtype;
begin
  select * into v_order from public.fulfillment_orders where id = p_order_id and organization_id = v_org for update;
  if not found then raise exception 'Order not found'; end if;
  if not ((v_order.status='queued' and p_next_status='picking') or (v_order.status='picking' and p_next_status='packed')
      or (v_order.status='packed' and p_next_status='dispatched')) then raise exception 'Invalid fulfillment status transition'; end if;
  for v_line in select * from public.fulfillment_orders where organization_id=v_org and order_number=v_order.order_number order by id for update loop
    if v_line.status <> v_order.status then raise exception 'Order lines have inconsistent statuses'; end if;
    if p_next_status='dispatched' then
      update public.fulfillment_products set quantity_on_hand=quantity_on_hand-v_line.quantity,
        quantity_reserved=quantity_reserved-v_line.quantity,updated_at=now()
        where id=v_line.product_id and organization_id=v_org and quantity_on_hand>=v_line.quantity and quantity_reserved>=v_line.quantity;
      if not found then raise exception 'Reserved stock could not be released'; end if;
      insert into public.fulfillment_inventory_movements (organization_id,product_id,movement_type,quantity,note,order_id,created_by)
        values (v_org,v_line.product_id,'dispatched',v_line.quantity,'Fulfillment dispatched',v_line.id,(select auth.uid()));
    end if;
  end loop;
  update public.fulfillment_orders set status=p_next_status,updated_at=now() where organization_id=v_org and order_number=v_order.order_number;
end $$;
revoke all on function public.fulfillment_advance_order(uuid,text) from public, anon;
grant execute on function public.fulfillment_advance_order(uuid,text) to authenticated;
