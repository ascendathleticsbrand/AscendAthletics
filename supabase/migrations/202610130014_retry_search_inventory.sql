-- Forward upgrade from the already-deployed thirteen-migration schema.
-- Retain a durable first provider attempt timestamp; a later retry lock must not extend
-- the provider's idempotency window. Legacy attempted records use the earliest known
-- creation/lock/send timestamp, conservatively disabling ambiguous old retries.
alter table public.notifications add column first_attempt_at timestamptz;
alter table public.campaign_recipients add column first_attempt_at timestamptz;
update public.notifications
set first_attempt_at=least(created_at,locked_at,sent_at)
where status in ('sending','failed','sent');
update public.campaign_recipients r
set first_attempt_at=least(c.created_at,r.locked_at,r.sent_at)
from public.campaigns c
where c.id=r.campaign_id and r.status in ('sending','failed','sent');

-- PostgREST computed fields filter the complete result set before pagination/counting.
-- The unnamed table-row argument keeps these helpers out of the public RPC surface.
create function public.coaching_enrollment_search(public.coaching_enrollments)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select concat_ws(' ',($1).package_name,($1).mode,c.name,c.email,c.phone)
 from customers c where c.id=($1).customer_id
$$;
create function public.product_variant_search(public.product_variants)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select concat_ws(' ',($1).sku,($1).size,($1).color,p.name)
 from products p where p.id=($1).product_id
$$;
revoke execute on function public.coaching_enrollment_search(public.coaching_enrollments),public.product_variant_search(public.product_variants) from public,anon,authenticated;
grant execute on function public.coaching_enrollment_search(public.coaching_enrollments),public.product_variant_search(public.product_variants) to service_role;

-- Aggregate in PostgreSQL to avoid PostgREST response caps or changing page snapshots.
create function public.inventory_summary(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform assert_staff(p_actor);
 select jsonb_build_object(
  'physical_stock',coalesce(sum(stock_on_hand) filter(where stock_confirmed_at is not null),0),
  'reserved_stock',coalesce(sum(stock_reserved) filter(where stock_confirmed_at is not null),0),
  'available_stock',coalesce(sum(stock_available) filter(where stock_confirmed_at is not null),0),
  'sold_stock',coalesce(sum(stock_sold) filter(where stock_confirmed_at is not null),0),
  'unconfirmed_stock',count(*) filter(where stock_confirmed_at is null),
  'low_stock',count(*) filter(where is_low_stock)
 ) into result from product_variants;
 return result;
end $$;
revoke execute on function public.inventory_summary(uuid) from public,anon,authenticated;
grant execute on function public.inventory_summary(uuid) to service_role;

-- Refresh the existing business RPCs in a forward migration, preserving the
-- authoritative event snapshots for databases which already applied migrations 1-13.
create or replace function public.create_checkout(p_items jsonb,p_customer jsonb,p_fulfillment_method text,p_delivery_details jsonb default '{}',p_actor uuid default null,p_source text default 'website',p_pay_later boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 perform enqueue_transactional_notification('order_created',v_customer,v_order.id,null,v_invoice.id,'order_created:'||v_order.id::text,jsonb_build_object('order_number',v_order.order_number,'invoice_id',v_invoice.id,'total_amount',v_order.total_amount,'delivery_status',v_order.delivery_status));
 return jsonb_build_object('order',to_jsonb(v_order)-'guest_token_hash','invoice',to_jsonb(v_invoice),'guest_token',v_token);
end $$;

create or replace function public.verify_payment(p_payment_id uuid,p_amount_received numeric,p_bank_credit_reference text,p_actor uuid,p_note text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p payments%rowtype;i invoices%rowtype;o orders%rowtype;v_ref text;
begin
 perform assert_staff(p_actor,true);
 v_ref=lower(trim(p_bank_credit_reference));if p_amount_received<=0 or coalesce(length(v_ref),0) not between 1 and 200 then raise exception 'Actual received amount and bank credit identifier required';end if;
 select * into p from payments where id=p_payment_id for update;if not found then raise exception 'Payment not found';end if;
 select * into i from invoices where id=p.invoice_id for update;
 if p.status='verified' then
  if p.amount_received!=p_amount_received or p.bank_credit_reference!=v_ref then raise exception 'Verified payment cannot be changed';end if;
  select * into o from orders where id=i.order_id;return jsonb_build_object('payment',to_jsonb(p),'invoice',to_jsonb(i),'order',to_jsonb(o)-'guest_token_hash');
 end if;
 if p.status='rejected' then raise exception 'Rejected evidence requires a new payment submission';end if;
 if i.total_amount is null then raise exception 'Approve final delivery fee before verification';end if;
 if exists(select 1 from payments where bank_credit_reference=v_ref and id!=p.id) then raise exception 'Bank credit has already been recorded';end if;
 update payments set status='verified',amount_received=p_amount_received,bank_credit_reference=v_ref,verified_by=p_actor,verified_at=now(),notes=p_note where id=p.id returning * into p;
 update invoices set amount_paid=amount_paid+p_amount_received,payment_status=case when amount_paid+p_amount_received>=total_amount then 'paid' else 'partially_paid' end where id=i.id returning * into i;
 insert into financial_adjustments(invoice_id,payment_id,kind,amount,actor_id,note) values(i.id,p.id,'receipt',p_amount_received,p_actor,p_note);
 perform enqueue_transactional_notification('payment_verified',i.customer_id,i.order_id,i.enrollment_id,i.id,'payment_verified:'||p.id::text,jsonb_build_object('payment_id',p.id,'invoice_id',i.id,'amount_received',p.amount_received,'amount_paid',i.amount_paid,'total_amount',i.total_amount,'outstanding_amount',i.outstanding_amount,'payment_status',i.payment_status));
 if i.order_id is not null then
  if i.payment_status='paid' or exists(select 1 from orders where id=i.order_id and pay_later_authorized) then perform settle_order(i.order_id,p_actor);end if;
  select * into o from orders where id=i.order_id;
 end if;
 return jsonb_build_object('payment',to_jsonb(p),'invoice',to_jsonb(i),'order',to_jsonb(o)-'guest_token_hash');
end $$;

create or replace function public.request_enrollment(p_package_id uuid,p_actor uuid,p_customer_id uuid default null,p_preferences jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid;p coaching_packages%rowtype;e coaching_enrollments%rowtype;i invoices%rowtype;k text;
begin
 if p_preferences is null or jsonb_typeof(p_preferences)!='object' then raise exception 'Training preferences must be an object';end if;
 for k in select jsonb_object_keys(p_preferences) loop if k not in ('goal','schedule') or jsonb_typeof(p_preferences->k)!='string' or length(p_preferences->>k)>500 then raise exception 'Only brief goal and schedule preferences are supported';end if;end loop;
 if p_actor is null then raise exception 'Secure coaching account required' using errcode='42501';end if;
 if p_customer_id is not null then perform assert_staff(p_actor);c=p_customer_id;else select id into c from customers where profile_id=p_actor;end if;
 if c is null or not exists(select 1 from customers where id=c) then raise exception 'Customer not found';end if;
 select * into p from coaching_packages where id=p_package_id and active for share;if not found then raise exception 'Coaching package unavailable';end if;
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor',p_actor::text,true);
 insert into coaching_enrollments(customer_id,package_id,package_name,mode,billing_model,price,duration_months,duration_days,session_count,training_preferences)
 values(c,p.id,p.name,p.mode,p.billing_model,p.price,p.duration_months,p.duration_days,p.session_count,p_preferences) returning * into e;
 insert into invoices(customer_id,enrollment_id,total_amount) values(c,e.id,p.price) returning * into i;
 perform enqueue_transactional_notification('enrollment_requested',c,null,e.id,i.id,'enrollment_requested:'||e.id::text,jsonb_build_object('package_name',e.package_name,'invoice_id',i.id,'total_amount',i.total_amount));
 return jsonb_build_object('enrollment',to_jsonb(e),'invoice',to_jsonb(i));
end $$;

create or replace function public.activate_enrollment(p_enrollment_id uuid,p_start_date date,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e coaching_enrollments%rowtype;i invoices%rowtype;v_expiry date;
begin
 perform assert_staff(p_actor,true);if p_start_date is null then raise exception 'Owner must confirm a start date';end if;
 select * into i from invoices where enrollment_id=p_enrollment_id for update;select * into e from coaching_enrollments where id=p_enrollment_id for update;
 if not found then raise exception 'Enrollment not found';end if;
 if e.status='active' then if e.start_date=p_start_date then return to_jsonb(e);else raise exception 'Activation dates cannot be silently changed; use renewal';end if;end if;
 if e.status!='requested' then raise exception 'Only requested enrollment can be activated';end if;
 if i.payment_status!='paid' and not e.pay_later_authorized then raise exception 'Full verified payment or owner pay-later exception required';end if;
 v_expiry=case when e.billing_model='monthly' then calendar_expiry(p_start_date,e.duration_months) when e.duration_days is not null then p_start_date+e.duration_days else null end;
 update coaching_enrollments set status='active',start_date=p_start_date,expiry_date=v_expiry,activated_by=p_actor where id=e.id returning * into e;
 perform enqueue_transactional_notification('enrollment_activated',e.customer_id,null,e.id,i.id,'enrollment_activated:'||e.id::text,jsonb_build_object('package_name',e.package_name,'start_date',e.start_date,'expiry_date',e.expiry_date));return to_jsonb(e);
end $$;

revoke execute on function public.create_checkout(jsonb,jsonb,text,jsonb,uuid,text,boolean),public.verify_payment(uuid,numeric,text,uuid,text),public.request_enrollment(uuid,uuid,uuid,jsonb),public.activate_enrollment(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.create_checkout(jsonb,jsonb,text,jsonb,uuid,text,boolean),public.verify_payment(uuid,numeric,text,uuid,text),public.request_enrollment(uuid,uuid,uuid,jsonb),public.activate_enrollment(uuid,date,uuid) to service_role;
notify pgrst,'reload schema';
