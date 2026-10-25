create or replace function public.fulfillment_bulk_receive_stock(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  item_count integer;
  product_id uuid;
  quantity integer;
  note text;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Stock upload must be an array';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 5000 then
    raise exception 'Stock upload must contain between 1 and 5000 rows';
  end if;
  for item in select value from jsonb_array_elements(p_items)
  loop
    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::integer;
    note := nullif(left(trim(coalesce(item->>'note', '')), 240), '');
    perform public.fulfillment_receive_stock(product_id, quantity, note);
  end loop;
end;
$$;

revoke all on function public.fulfillment_bulk_receive_stock(jsonb) from public, anon;
grant execute on function public.fulfillment_bulk_receive_stock(jsonb) to authenticated;
