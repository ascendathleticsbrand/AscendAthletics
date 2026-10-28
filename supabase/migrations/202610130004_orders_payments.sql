create function public.submit_payment(p_invoice_id uuid,p_amount numeric,p_transfer_reference text,p_bank_name text default null,p_transferred_at timestamptz default null,p_proof_path text default null,p_actor uuid default null,p_guest_token text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i invoices%rowtype;p payments%rowtype;
begin
 perform assert_invoice_access(p_invoice_id,p_actor,p_guest_token);
 if p_amount<=0 or p_amount>999999999999 or coalesce(length(trim(p_transfer_reference)),0) not between 1 and 200 then raise exception 'Valid transfer amount and reference required';end if;
 select * into i from invoices where id=p_invoice_id for update;
 if i.total_amount is null then raise exception 'Delivery quote requires customer approval before payment';end if;
 if i.order_id is not null and exists(select 1 from orders where id=i.order_id and(delivery_status!='approved' or fulfillment_status='cancelled')) then raise exception 'This order cannot accept payment evidence';end if;
 select * into p from payments where invoice_id=i.id and lower(transfer_reference)=lower(trim(p_transfer_reference)) and status!='rejected';
 if found then return to_jsonb(p)-'notes'-'bank_credit_reference';end if;
 insert into payments(invoice_id,submitted_amount,transfer_reference,bank_name,transferred_at,created_by) values(i.id,p_amount,trim(p_transfer_reference),p_bank_name,p_transferred_at,p_actor) returning * into p;
 if p_proof_path is not null then
  if p_proof_path not like 'proofs/'||i.id::text||'/%' or length(p_proof_path)>200 or p_proof_path !~ '^proofs/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$' then raise exception 'Invalid proof path';end if;
  insert into payment_evidence(payment_id,storage_path) values(p.id,p_proof_path);
 end if;
 update invoices set payment_status=case when amount_paid>=total_amount then 'paid' when amount_paid>0 then 'partially_paid' else 'evidence_submitted' end where id=i.id;
 return to_jsonb(p)-'notes'-'bank_credit_reference';
end $$;
create function public.verify_payment(p_payment_id uuid,p_amount_received numeric,p_bank_credit_reference text,p_actor uuid,p_note text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
 perform enqueue_transactional_notification('payment_verified',i.customer_id,i.order_id,i.enrollment_id,i.id,'payment_verified:'||p.id::text,jsonb_build_object('payment_id',p.id));
 if i.order_id is not null then
  if i.payment_status='paid' or exists(select 1 from orders where id=i.order_id and pay_later_authorized) then perform settle_order(i.order_id,p_actor);end if;
  select * into o from orders where id=i.order_id;
 end if;
 return jsonb_build_object('payment',to_jsonb(p),'invoice',to_jsonb(i),'order',to_jsonb(o)-'guest_token_hash');
end $$;
create function public.reject_payment(p_payment_id uuid,p_actor uuid,p_note text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p payments%rowtype;i invoices%rowtype;
begin
 perform assert_staff(p_actor,true);if coalesce(length(trim(p_note)),0)=0 then raise exception 'Rejection reason required';end if;
 select * into p from payments where id=p_payment_id for update;if not found then raise exception 'Payment not found';end if;if p.status='verified' then raise exception 'Verified receipt cannot be rejected';end if;
 select * into i from invoices where id=p.invoice_id for update;
 update payments set status='rejected',notes=p_note where id=p.id returning * into p;
 update invoices set payment_status=case when amount_paid>=total_amount then 'paid' when amount_paid>0 then 'partially_paid' when exists(select 1 from payments where invoice_id=i.id and status in ('pending','evidence_submitted')) then 'evidence_submitted' else 'rejected' end where id=i.id;return to_jsonb(p);
end $$;
create function public.cancel_order(p_order_id uuid,p_actor uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;r record;
begin
 perform assert_staff(p_actor);if coalesce(length(trim(p_reason)),0)=0 then raise exception 'Cancellation reason required';end if;
 select * into o from orders where id=p_order_id for update;if not found then raise exception 'Order not found';end if;
 if exists(select 1 from invoices where order_id=o.id and amount_paid>0) then perform assert_staff(p_actor,true);end if;
 if o.fulfillment_status='cancelled' then return to_jsonb(o)-'guest_token_hash';end if;
 perform 1 from product_variants where id in(select variant_id from stock_reservations where order_id=o.id and status='active') order by id for update;
 for r in select * from stock_reservations where order_id=o.id and status='active' order by variant_id for update loop
  update product_variants set stock_reserved=stock_reserved-r.quantity where id=r.variant_id;update stock_reservations set status='released' where id=r.id;
  insert into stock_movements(variant_id,order_id,kind,reserved_delta,actor_id,note) values(r.variant_id,o.id,'cancellation',-r.quantity,p_actor,p_reason);
 end loop;
 update orders set fulfillment_status='cancelled',updated_at=now() where id=o.id returning * into o;
 insert into order_notes(order_id,body,created_by) values(o.id,p_reason,p_actor);insert into fulfillment_events(order_id,status,actor_id) values(o.id,'cancelled',p_actor);
 return to_jsonb(o)-'guest_token_hash';
end $$;
create function public.quote_delivery(p_order_id uuid,p_fee numeric,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;i invoices%rowtype;
begin
 perform assert_staff(p_actor);if p_fee<0 then raise exception 'Delivery fee must not be negative';end if;
 select * into i from invoices where order_id=p_order_id for update;select * into o from orders where id=p_order_id for update;
 if not found or o.fulfillment_method!='delivery' or o.fulfillment_status!='pending' then raise exception 'Order does not need a delivery quote';end if;
 if i.amount_paid>0 or exists(select 1 from payments where invoice_id=i.id) then raise exception 'Cannot change delivery fee after payment evidence';end if;
 update orders set delivery_fee=p_fee,delivery_status='quoted',total_amount=null,updated_at=now() where id=o.id returning * into o;
 update invoices set total_amount=null where id=i.id;
 insert into financial_adjustments(invoice_id,kind,amount,actor_id,note) values(i.id,'delivery_quote',p_fee,p_actor,'Awaiting final customer approval');return to_jsonb(o)-'guest_token_hash';
end $$;
create function public.approve_delivery(p_order_id uuid,p_guest_token text default null,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;i invoices%rowtype;
begin
 select * into i from invoices where order_id=p_order_id for update;select * into o from orders where id=p_order_id for update;
 if not found then raise exception 'Order not found';end if;
 if not((p_actor is not null and exists(select 1 from customers where id=o.customer_id and profile_id=p_actor)) or(p_guest_token is not null and o.guest_token_hash=encode(extensions.digest(p_guest_token,'sha256'),'hex'))) then raise exception 'Customer approval required' using errcode='42501';end if;
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor',coalesce(p_actor::text,''),true);
 if o.delivery_status='approved' then return to_jsonb(o)-'guest_token_hash';end if;
 if o.delivery_status!='quoted' or o.delivery_fee is null or o.fulfillment_status='cancelled' then raise exception 'Final delivery quote unavailable';end if;
 update orders set delivery_status='approved',total_amount=subtotal+delivery_fee,updated_at=now() where id=o.id returning * into o;
 update invoices set total_amount=o.total_amount where id=i.id;return to_jsonb(o)-'guest_token_hash';
end $$;
create function public.authorize_pay_later(p_invoice_id uuid,p_actor uuid,p_note text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i invoices%rowtype;
begin
 perform assert_staff(p_actor,true);if coalesce(length(trim(p_note)),0)=0 then raise exception 'Exception reason required';end if;
 select * into i from invoices where id=p_invoice_id for update;if not found or i.total_amount is null then raise exception 'Final invoice required';end if;
 if i.order_id is not null then update orders set pay_later_authorized=true where id=i.order_id;perform settle_order(i.order_id,p_actor);
 else update coaching_enrollments set pay_later_authorized=true where id=i.enrollment_id;end if;
 insert into financial_adjustments(invoice_id,kind,amount,actor_id,note) values(i.id,'pay_later_authorized',0,p_actor,p_note);return to_jsonb(i);
end $$;
create function public.update_fulfillment(p_order_id uuid,p_status text,p_actor uuid,p_courier_name text default null,p_tracking_reference text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;i invoices%rowtype;
begin
 perform assert_staff(p_actor);if p_status not in ('processing','ready_for_pickup','shipped','delivered','picked_up') then raise exception 'Use cancellation operation or a valid fulfillment status';end if;
 select * into i from invoices where order_id=p_order_id for update;select * into o from orders where id=p_order_id for update;
 if not found or o.fulfillment_status='cancelled' then raise exception 'Order unavailable';end if;
 if o.resolution_required then raise exception 'Owner must explicitly resolve the stock conflict before fulfillment';end if;
 if o.delivery_status!='approved' or(i.payment_status!='paid' and not o.pay_later_authorized) then raise exception 'Verified full payment or owner pay-later approval required';end if;
 if o.fulfillment_method='pickup' and p_status in ('shipped','delivered') or o.fulfillment_method='delivery' and p_status in ('ready_for_pickup','picked_up') then raise exception 'Status does not match fulfillment method';end if;
 if o.fulfillment_status in ('delivered','picked_up') and o.fulfillment_status!=p_status then raise exception 'Completed fulfillment cannot move backwards';end if;
 if not settle_order(o.id,p_actor) then raise exception 'Stock conflict: owner must restock or refund before fulfillment';end if;
 update orders set fulfillment_status=p_status,courier_name=coalesce(p_courier_name,courier_name),tracking_reference=coalesce(p_tracking_reference,tracking_reference),updated_at=now() where id=o.id returning * into o;
 insert into fulfillment_events(order_id,status,actor_id) values(o.id,p_status,p_actor);return to_jsonb(o)-'guest_token_hash';
end $$;
create function public.record_refund(p_payment_id uuid,p_amount numeric,p_reason text,p_external_reference text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p payments%rowtype;i invoices%rowtype;r refunds%rowtype;v_refunded numeric;
begin
 perform assert_staff(p_actor,true);if p_amount<=0 or coalesce(length(trim(p_reason)),0)=0 or coalesce(length(trim(p_external_reference)),0)=0 then raise exception 'Refund amount, reason and external transaction reference required';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.status!='verified' then raise exception 'Only verified receipts can be refunded';end if;
 select * into i from invoices where id=p.invoice_id for update;select coalesce(sum(amount),0) into v_refunded from refunds where payment_id=p.id;
 if p_amount>p.amount_received-v_refunded then raise exception 'Refund exceeds remaining verified receipt';end if;
 insert into refunds(payment_id,amount,reason,external_reference,created_by) values(p.id,p_amount,p_reason,lower(trim(p_external_reference)),p_actor) returning * into r;
 update invoices set amount_refunded=amount_refunded+p_amount,payment_status=case when amount_refunded+p_amount=amount_paid then 'refunded' else payment_status end where id=i.id;
 insert into financial_adjustments(invoice_id,payment_id,kind,amount,actor_id,note) values(i.id,p.id,'refund',-p_amount,p_actor,p_reason);return to_jsonb(r);
end $$;

