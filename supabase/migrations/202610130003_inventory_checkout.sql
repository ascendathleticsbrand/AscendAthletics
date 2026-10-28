-- All public transaction RPCs are restricted to service_role in the final migration.
create function public.expire_reservations() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o record;r record;n integer:=0;
begin
 perform set_config('app.rpc_write','1',true);
 for o in select id from orders where exists(select 1 from stock_reservations where order_id=orders.id and status='active' and expires_at<=now()) order by id for update skip locked loop
  perform 1 from product_variants where id in(select variant_id from stock_reservations where order_id=o.id and status='active') order by id for update;
  for r in select * from stock_reservations where order_id=o.id and status='active' and expires_at<=now() order by variant_id for update loop
   update product_variants set stock_reserved=stock_reserved-r.quantity where id=r.variant_id;
   update stock_reservations set status='expired' where id=r.id;
   insert into stock_movements(variant_id,order_id,kind,reserved_delta,note) values(r.variant_id,o.id,'reservation_expired',-r.quantity,'Unpaid reservation expired');n:=n+1;
  end loop;
 end loop;return n;
end $$;
create function public.create_checkout(p_items jsonb,p_customer jsonb,p_fulfillment_method text,p_delivery_details jsonb default '{}',p_actor uuid default null,p_source text default 'website',p_pay_later boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_customer uuid;v_token text;v_order orders%rowtype;v_invoice invoices%rowtype;v_item record;v_variant record;v_fee numeric(14,2);v_subtotal numeric(14,2):=0;v_expiry timestamptz;v_name text;v_phone text;v_email text;
begin
 if p_items is null or jsonb_typeof(p_items)!='array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Cart must contain 1 to 100 variants';end if;
 if p_fulfillment_method not in ('pickup','delivery') then raise exception 'Invalid fulfillment method';end if;
 if p_source!='website' then perform assert_staff(p_actor);end if;
 if p_pay_later then perform assert_staff(p_actor,true);end if;
 v_name=trim(p_customer->>'name');v_phone=trim(p_customer->>'phone');v_email=nullif(lower(trim(p_customer->>'email')),'');
 if coalesce(length(v_name),0) not between 1 and 150 or coalesce(length(v_phone),0) not between 5 and 40 then raise exception 'Customer name and phone required';end if;
 if v_email is not null and(v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254) then raise exception 'Invalid email';end if;
 if p_actor is not null and not exists(select 1 from profiles where id=p_actor) then raise exception 'Unknown authenticated user';end if;
 if p_fulfillment_method='delivery' then
  if not(p_delivery_details ?& array['recipient_name','phone','state','city','area','address']) or exists(select 1 from jsonb_each_text(p_delivery_details) where key in ('recipient_name','phone','state','city','area','address') and length(trim(value))=0) then raise exception 'Complete delivery address required';end if;
  select fee into v_fee from delivery_rates where active and lower(state)=lower(p_delivery_details->>'state') and(city is null or lower(city)=lower(p_delivery_details->>'city')) and(area is null or lower(area)=lower(p_delivery_details->>'area')) order by(area is not null) desc,(city is not null) desc,id limit 1;
 else
  if not exists(select 1 from business_settings where id=1 and nullif(trim(pickup_location),'') is not null) then raise exception 'Pickup location has not been configured';end if;v_fee:=0;
 end if;
 -- Only cart SKUs are expired below, after deterministic SKU locking.
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor',coalesce(p_actor::text,''),true);
 if p_customer->>'customer_id' is not null then
  perform assert_staff(p_actor);select id into v_customer from customers where id=(p_customer->>'customer_id')::uuid;
  if v_customer is null then raise exception 'Customer not found';end if;
 elsif p_actor is not null and not exists(select 1 from staff_roles where user_id=p_actor) then select id into v_customer from customers where profile_id=p_actor;
 end if;
 if v_customer is null then insert into customers(name,email,phone) values(v_name,v_email,v_phone) returning id into v_customer;end if;
 select now()+make_interval(mins=>reservation_minutes) into v_expiry from business_settings where id=1;
 v_token=encode(extensions.gen_random_bytes(32),'hex');
 -- Lock in deterministic SKU-ID order. Duplicate item quantities are aggregated.
 perform 1 from product_variants where id in(select(x->>'variant_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
 perform expire_cart_reservations(array(select distinct(x->>'variant_id')::uuid from jsonb_array_elements(p_items) x));
 insert into orders(customer_id,source,customer_name,customer_email,customer_phone,fulfillment_method,delivery_details,delivery_status,delivery_fee,subtotal,total_amount,pay_later_authorized,guest_token_hash,reservation_expires_at,created_by)
 values(v_customer,p_source,v_name,v_email,v_phone,p_fulfillment_method,p_delivery_details,case when v_fee is null then 'pending' else 'approved' end,v_fee,0,null,p_pay_later,encode(extensions.digest(v_token,'sha256'),'hex'),v_expiry,p_actor) returning * into v_order;
 for v_item in select(x->>'variant_id')::uuid as variant_id,sum((x->>'quantity')::integer)::integer as quantity from jsonb_array_elements(p_items) x group by 1 order by 1 loop
  if v_item.quantity is null or v_item.quantity not between 1 and 1000 then raise exception 'Invalid quantity';end if;
  -- Reject negative components even where aggregation would hide them.
  if exists(select 1 from jsonb_array_elements(p_items) x where(x->>'quantity')::integer not between 1 and 1000 or x->>'quantity' is null) then raise exception 'Invalid item quantity';end if;
  select v.*,p.name product_name,p.price,p.cost_price,p.status product_status into v_variant from product_variants v join products p on p.id=v.product_id where v.id=v_item.variant_id for share of p;
  if not found or v_variant.product_status!='active' or v_variant.stock_confirmed_at is null then raise exception 'Variant is unavailable';end if;
  if v_variant.stock_available<v_item.quantity then raise exception 'Insufficient stock for SKU %',v_variant.sku;end if;
  insert into order_items(order_id,variant_id,product_name,sku,size,color,quantity,unit_price,unit_cost) values(v_order.id,v_variant.id,v_variant.product_name,v_variant.sku,v_variant.size,v_variant.color,v_item.quantity,v_variant.price,v_variant.cost_price);
  insert into stock_reservations(order_id,variant_id,quantity,expires_at) values(v_order.id,v_variant.id,v_item.quantity,v_expiry);
  update product_variants set stock_reserved=stock_reserved+v_item.quantity where id=v_variant.id;
  insert into stock_movements(variant_id,order_id,kind,reserved_delta,actor_id) values(v_variant.id,v_order.id,'reservation',v_item.quantity,p_actor);
  v_subtotal=v_subtotal+v_variant.price*v_item.quantity;
 end loop;
 update orders set subtotal=v_subtotal,total_amount=v_subtotal+v_fee where id=v_order.id returning * into v_order;
 insert into invoices(customer_id,order_id,total_amount) values(v_customer,v_order.id,v_order.total_amount) returning * into v_invoice;
 insert into fulfillment_events(order_id,status,actor_id) values(v_order.id,'pending',p_actor);
 perform enqueue_transactional_notification('order_created',v_customer,v_order.id,null,v_invoice.id,'order_created:'||v_order.id::text,jsonb_build_object('order_number',v_order.order_number));
 return jsonb_build_object('order',to_jsonb(v_order)-'guest_token_hash','invoice',to_jsonb(v_invoice),'guest_token',v_token);
end $$;
create function public.guest_order(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;i invoices%rowtype;b jsonb;
begin
 if length(p_token)!=64 then return null;end if;
 select * into o from orders where guest_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');if not found then return null;end if;
 select * into i from invoices where order_id=o.id;
 if o.delivery_status='approved' and o.fulfillment_status!='cancelled' then select jsonb_build_object('bank_name',bank_name,'bank_account_number',bank_account_number,'bank_account_holder',bank_account_holder,'payment_instructions',payment_instructions,'pickup_location',pickup_location,'pickup_instructions',pickup_instructions,'pickup_contact',pickup_contact,'pickup_hours',pickup_hours) into b from business_settings where id=1;end if;
 return jsonb_build_object('order',to_jsonb(o)-'guest_token_hash','invoice',to_jsonb(i),'items',(select coalesce(jsonb_agg(to_jsonb(oi)-'unit_cost'),'[]') from order_items oi where order_id=o.id),'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'submitted_amount',submitted_amount,'amount_received',amount_received,'transfer_reference',transfer_reference,'status',status,'created_at',created_at)),'[]') from payments where invoice_id=i.id),'bank_details',b);
end $$;
create function public.record_stock(p_variant_id uuid,p_kind text,p_quantity integer,p_actor uuid,p_note text default null,p_resellable boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v product_variants%rowtype;d integer;
begin
 perform assert_staff(p_actor,p_kind in ('adjustment','damaged','reconciliation'));
 if p_kind not in ('opening','restock','adjustment','damaged','reconciliation','return') then raise exception 'Invalid stock operation';end if;
 select * into v from product_variants where id=p_variant_id for update;if not found then raise exception 'Variant not found';end if;
 if v.stock_confirmed_at is null and p_kind!='opening' then raise exception 'Confirm physical opening stock first';end if;
 if p_kind='opening' and v.stock_confirmed_at is not null then raise exception 'Opening count already confirmed';end if;
 if p_kind='return' and not p_resellable then raise exception 'Confirm returned item is resellable';end if;
 if p_kind in ('opening','reconciliation') then if p_quantity<0 then raise exception 'Physical count must not be negative';end if;d=p_quantity-v.stock_on_hand;
 else d=p_quantity;end if;
 if p_kind in ('restock','return') and d<=0 then raise exception 'Addition quantity must be positive';end if;
 if p_kind='damaged' and d>=0 then raise exception 'Damaged quantity must be negative';end if;
 if v.stock_on_hand+d<v.stock_reserved then raise exception 'Count would conflict with existing reservations';end if;
 update product_variants set stock_on_hand=stock_on_hand+d,stock_confirmed_at=coalesce(stock_confirmed_at,now()) where id=p_variant_id returning * into v;
 insert into stock_movements(variant_id,kind,quantity_delta,actor_id,note) values(p_variant_id,p_kind,d,p_actor,p_note);return to_jsonb(v);
end $$;
-- Internal stock settlement is idempotent and cannot consume another order's reservations.
create function public.settle_order(p_order_id uuid,p_actor uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;r record;v product_variants%rowtype;conflict boolean:=false;
begin
 select * into o from orders where id=p_order_id for update;
 if o.fulfillment_status='cancelled' then update orders set resolution_required=true where id=o.id;return false;end if;
 perform 1 from product_variants where id in(select variant_id from stock_reservations where order_id=o.id) order by id for update;
 -- Expire this order's stale reservations before evaluating availability.
 for r in select * from stock_reservations where order_id=o.id and status='active' and expires_at<=now() order by variant_id for update loop
  update product_variants set stock_reserved=stock_reserved-r.quantity where id=r.variant_id;update stock_reservations set status='expired' where id=r.id;
  insert into stock_movements(variant_id,order_id,kind,reserved_delta,actor_id) values(r.variant_id,o.id,'reservation_expired',-r.quantity,p_actor);
 end loop;
 for r in select * from stock_reservations where order_id=o.id and status!='consumed' order by variant_id for update loop
  select * into v from product_variants where id=r.variant_id;
  if r.status!='active' and v.stock_available<r.quantity then conflict:=true;end if;
 end loop;
 if conflict then update orders set resolution_required=true where id=o.id;return false;end if;
 for r in select * from stock_reservations where order_id=o.id and status!='consumed' order by variant_id for update loop
  update product_variants set stock_on_hand=stock_on_hand-r.quantity,stock_reserved=stock_reserved-case when r.status='active' then r.quantity else 0 end,stock_sold=stock_sold+r.quantity where id=r.variant_id;
  update stock_reservations set status='consumed' where id=r.id;
  insert into stock_movements(variant_id,order_id,kind,quantity_delta,reserved_delta,actor_id) values(r.variant_id,o.id,'sale',-r.quantity,case when r.status='active' then -r.quantity else 0 end,p_actor);
 end loop;
 update orders set resolution_required=false where id=o.id;return true;
end $$;

