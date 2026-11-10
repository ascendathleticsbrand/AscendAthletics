-- Restore the stock RPC's audited-write context and provide one atomic product setup step.
-- The caller must be a signed-in staff member; only the trusted server service role can
-- execute the setup RPC. Product, first SKU, opening count and optional publication commit
-- together, so a failed count never leaves a half-configured product behind.

create or replace function public.record_stock(
  p_variant_id uuid,
  p_kind text,
  p_quantity integer,
  p_actor uuid,
  p_note text default null,
  p_resellable boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v product_variants%rowtype;
  d integer;
begin
  perform assert_staff(p_actor,p_kind in ('adjustment','damaged','reconciliation'));
  if p_kind not in ('opening','restock','adjustment','damaged','reconciliation','return') then
    raise exception 'Invalid stock operation';
  end if;
  select * into v from product_variants where id=p_variant_id for update;
  if not found then raise exception 'Variant not found'; end if;
  if v.stock_confirmed_at is null and p_kind!='opening' then
    raise exception 'Confirm physical opening stock first';
  end if;
  if p_kind='opening' and v.stock_confirmed_at is not null then
    raise exception 'Opening count already confirmed';
  end if;
  if p_kind='return' and not p_resellable then
    raise exception 'Confirm returned item is resellable';
  end if;
  if p_kind in ('opening','reconciliation') then
    if p_quantity<0 then raise exception 'Physical count must not be negative'; end if;
    d=p_quantity-v.stock_on_hand;
  else
    d=p_quantity;
  end if;
  if p_kind in ('restock','return') and d<=0 then
    raise exception 'Addition quantity must be positive';
  end if;
  if p_kind='damaged' and d>=0 then raise exception 'Damaged quantity must be negative'; end if;
  if v.stock_on_hand+d<v.stock_reserved then
    raise exception 'Count would conflict with existing reservations';
  end if;

  perform set_config('app.rpc_write','1',true);
  perform set_config('app.actor',p_actor::text,true);
  update product_variants
  set stock_on_hand=stock_on_hand+d,stock_confirmed_at=coalesce(stock_confirmed_at,now())
  where id=p_variant_id returning * into v;
  insert into stock_movements(variant_id,kind,quantity_delta,actor_id,note)
  values(p_variant_id,p_kind,d,p_actor,p_note);
  return to_jsonb(v);
end $$;

create function public.setup_product(
  p_product jsonb,
  p_size text,
  p_color text,
  p_quantity integer,
  p_publish boolean,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  product_row products%rowtype;
  variant_row product_variants%rowtype;
  product_cost numeric(14,2);
begin
  perform assert_staff(p_actor);
  if p_product is null or jsonb_typeof(p_product)!='object' then
    raise exception 'Product details are required';
  end if;
  if coalesce(length(trim(p_product->>'name')),0) not between 2 and 180 then
    raise exception 'Product name must be 2 to 180 characters';
  end if;
  if coalesce(length(trim(p_product->>'slug')),0)>180
     or coalesce(p_product->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Enter a valid shop URL slug';
  end if;
  if coalesce(length(trim(p_size)),0) not between 1 and 50
     or coalesce(length(trim(p_color)),0) not between 1 and 60 then
    raise exception 'Enter the first size and colour option';
  end if;
  if p_quantity is null or p_quantity<0 or p_quantity>100000 then
    raise exception 'Opening stock count must be between 0 and 100000';
  end if;
  if coalesce(p_publish,false) and p_quantity<1 then
    raise exception 'Count at least one unit before publishing this product';
  end if;
  if coalesce((p_product->>'price')::numeric,0)<=0 then
    raise exception 'Enter a selling price greater than zero';
  end if;
  product_cost=nullif(p_product->>'cost_price','')::numeric;

  perform set_config('app.rpc_write','1',true);
  perform set_config('app.actor',p_actor::text,true);
  insert into products(category_id,name,slug,description,price,cost_price,status,featured,size_guide)
  values(
    nullif(p_product->>'category_id','')::uuid,
    trim(p_product->>'name'),
    trim(p_product->>'slug'),
    coalesce(p_product->>'description',''),
    (p_product->>'price')::numeric,
    product_cost,
    'draft',
    coalesce((p_product->>'featured')::boolean,false),
    nullif(p_product->>'size_guide','')
  ) returning * into product_row;

  insert into product_variants(product_id,sku,size,color)
  values(
    product_row.id,
    'ASC-'||upper(substr(replace(product_row.id::text,'-',''),1,20)),
    trim(p_size),
    trim(p_color)
  ) returning * into variant_row;
  perform record_stock(
    variant_row.id,
    'opening',
    p_quantity,
    p_actor,
    'Opening stock counted during product setup'
  );
  select * into variant_row from product_variants where id=variant_row.id;

  if coalesce(p_publish,false) then
    update products set status='active' where id=product_row.id returning * into product_row;
  end if;
  return jsonb_build_object(
    'product',to_jsonb(product_row)-'cost_price',
    'variant',to_jsonb(variant_row)-'stock_on_hand'-'stock_reserved'-'stock_sold'
  );
end $$;

revoke execute on function public.setup_product(jsonb,text,text,integer,boolean,uuid)
from public,anon,authenticated;
grant execute on function public.setup_product(jsonb,text,text,integer,boolean,uuid)
to service_role;
notify pgrst,'reload schema';
