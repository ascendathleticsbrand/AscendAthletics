-- Permanently remove a product only when it has no order or reservation history.
-- Stock and catalog details are copied into the audit log before their rows are removed.
create function public.delete_unused_product(
  p_product_id uuid,
  p_confirm_name text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  product_row public.products%rowtype;
  variant_ids uuid[];
  image_paths jsonb;
  snapshot jsonb;
begin
  perform public.assert_staff(p_actor,true);

  -- Match checkout's variant-then-product lock order to avoid inventory races.
  select coalesce(array_agg(id order by id),array[]::uuid[])
    into variant_ids
    from public.product_variants
    where product_id=p_product_id;
  perform 1 from public.product_variants
    where id=any(variant_ids)
    order by id
    for update;

  select * into product_row
    from public.products
    where id=p_product_id
    for update;
  if not found then raise exception 'Product not found'; end if;

  -- A child variant may have been created while the initial locks were acquired.
  select coalesce(array_agg(id order by id),array[]::uuid[])
    into variant_ids
    from public.product_variants
    where product_id=p_product_id;
  perform 1 from public.product_variants
    where id=any(variant_ids)
    order by id
    for update;

  if p_confirm_name is distinct from product_row.name then
    raise exception 'Type the exact product name to confirm permanent deletion';
  end if;
  if exists(select 1 from public.order_items where variant_id=any(variant_ids))
     or exists(select 1 from public.stock_reservations where variant_id=any(variant_ids)) then
    raise exception 'This product has order or reservation history and cannot be permanently deleted. Remove it from the store instead.';
  end if;

  select coalesce(jsonb_agg(i.storage_path order by i.sort_order),'[]'::jsonb)
    into image_paths
    from public.product_images i
    where i.product_id=p_product_id;

  select jsonb_build_object(
    'product',to_jsonb(product_row),
    'variants',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)
      from public.product_variants v where v.id=any(variant_ids)),
    'stock_movements',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at,m.id),'[]'::jsonb)
      from public.stock_movements m where m.variant_id=any(variant_ids)),
    'images',(select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order),'[]'::jsonb)
      from public.product_images i where i.product_id=p_product_id),
    'collections',(select coalesce(jsonb_agg(to_jsonb(cp)),'[]'::jsonb)
      from public.collection_products cp where cp.product_id=p_product_id)
  ) into snapshot;

  perform set_config('app.rpc_write','1',true);
  perform set_config('app.actor',p_actor::text,true);
  insert into public.audit_logs(actor_id,action,table_name,record_id,before_data)
    values(p_actor,'DELETE','products',p_product_id::text,snapshot);

  delete from public.stock_movements where variant_id=any(variant_ids);
  delete from public.product_images where product_id=p_product_id;
  delete from public.collection_products where product_id=p_product_id;
  delete from public.product_variants where id=any(variant_ids);
  delete from public.products where id=p_product_id;

  return jsonb_build_object(
    'id',p_product_id,
    'name',product_row.name,
    'image_paths',image_paths
  );
end;
$$;

revoke execute on function public.delete_unused_product(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_unused_product(uuid,text,uuid) to service_role;
