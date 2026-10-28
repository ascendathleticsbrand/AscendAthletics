-- Keep expiry and checkout lock ordering safe across unrelated orders.
create or replace function public.expire_reservations() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o record;r record;n integer:=0;expected integer;locked integer;
begin
 perform set_config('app.rpc_write','1',true);
 for o in select id from orders where exists(select 1 from stock_reservations where order_id=orders.id and status='active' and expires_at<=now()) order by id for update skip locked loop
  select count(distinct variant_id) into expected from stock_reservations where order_id=o.id and status='active';
  -- Background expiry never waits on a SKU held by checkout, stock count or payment settlement.
  perform 1 from product_variants where id in(select variant_id from stock_reservations where order_id=o.id and status='active') order by id for update skip locked;
  get diagnostics locked=row_count;if locked!=expected then continue;end if;
  for r in select * from stock_reservations where order_id=o.id and status='active' and expires_at<=now() order by variant_id for update loop
   update product_variants set stock_reserved=stock_reserved-r.quantity where id=r.variant_id;update stock_reservations set status='expired' where id=r.id;
   insert into stock_movements(variant_id,order_id,kind,reserved_delta,note) values(r.variant_id,o.id,'reservation_expired',-r.quantity,'Unpaid reservation expired');n:=n+1;
  end loop;
 end loop;return n;
end $$;
create function public.expire_cart_reservations(p_variants uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o record;r record;
begin
 perform set_config('app.rpc_write','1',true);
 -- Checkout already holds these SKU locks, in ascending UUID order. No unrelated SKU is acquired.
 perform 1 from product_variants where id=any(p_variants) order by id for update;
 for o in select id from orders where exists(select 1 from stock_reservations where order_id=orders.id and variant_id=any(p_variants) and status='active' and expires_at<=now()) order by id for update skip locked loop
  for r in select * from stock_reservations where order_id=o.id and variant_id=any(p_variants) and status='active' and expires_at<=now() order by variant_id for update loop
   update product_variants set stock_reserved=stock_reserved-r.quantity where id=r.variant_id;update stock_reservations set status='expired' where id=r.id;
   insert into stock_movements(variant_id,order_id,kind,reserved_delta,note) values(r.variant_id,o.id,'reservation_expired',-r.quantity,'Expired reservation released during checkout');
  end loop;
 end loop;
end $$;
create function public.resolve_order_stock(p_order_id uuid,p_actor uuid,p_note text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;i invoices%rowtype;
begin
 perform assert_staff(p_actor,true);if coalesce(length(trim(p_note)),0) not between 1 and 4000 then raise exception 'Owner resolution note required';end if;
 select * into i from invoices where order_id=p_order_id for update;select * into o from orders where id=p_order_id for update;
 if not found or o.fulfillment_status='cancelled' or o.delivery_status!='approved' then raise exception 'Order is unavailable for stock resolution';end if;
 if i.payment_status!='paid' and not o.pay_later_authorized then raise exception 'Verified full payment or explicit owner exception required';end if;
 if not settle_order(o.id,p_actor) then raise exception 'Insufficient free stock: restock physically counted units or refund/cancel';end if;
 insert into order_notes(order_id,body,created_by) values(o.id,'Owner resolved stock: '||p_note,p_actor);
 select * into o from orders where id=o.id;return to_jsonb(o)-'guest_token_hash';
end $$;
revoke execute on function public.expire_cart_reservations(uuid[]),public.resolve_order_stock(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.expire_cart_reservations(uuid[]),public.resolve_order_stock(uuid,uuid,text),public.expire_reservations() to service_role;
