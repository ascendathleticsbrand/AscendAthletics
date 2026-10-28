create function public.financial_summary(p_actor uuid,p_from date default null,p_to date default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tz text;v_from timestamptz;v_to timestamptz;result jsonb;
begin
 perform assert_staff(p_actor,true);select timezone into tz from business_settings where id=1;
 if p_from is not null and p_to is not null and p_to<p_from then raise exception 'Date range is reversed';end if;
 v_from=coalesce(p_from::timestamp at time zone tz,'-infinity'::timestamptz);v_to=coalesce((p_to+1)::timestamp at time zone tz,'infinity'::timestamptz);
 select jsonb_build_object(
 'merchandise_revenue',coalesce(sum(p.amount_received) filter(where i.order_id is not null),0),
 'coaching_revenue',coalesce(sum(p.amount_received) filter(where i.enrollment_id is not null),0),
 'total_recorded_receipts',coalesce(sum(p.amount_received),0),
 'refunds',(select coalesce(sum(amount),0) from refunds where created_at>=v_from and created_at<v_to),
 'expenses',(select coalesce(sum(amount),0) from expenses where spent_on>=coalesce(p_from,'-infinity'::date) and spent_on<=coalesce(p_to,'infinity'::date)),
 'outstanding_balances',(select coalesce(sum(outstanding_amount),0) from invoices i left join orders o on o.id=i.order_id where i.payment_status!='refunded' and(o.id is null or o.fulfillment_status!='cancelled') and i.created_at>=v_from and i.created_at<v_to),
 'unpaid_invoices',(select count(*) from invoices i left join orders o on o.id=i.order_id where(i.total_amount is null or outstanding_amount>0) and i.payment_status!='refunded' and(o.id is null or o.fulfillment_status!='cancelled') and i.created_at>=v_from and i.created_at<v_to),
 'pending_claims',(select coalesce(sum(submitted_amount),0) from payments where status in ('pending','evidence_submitted') and created_at>=v_from and created_at<v_to),
 'revenue_over_time',(select coalesce(jsonb_agg(x order by x."day"),'[]') from(select(verified_at at time zone tz)::date as "day",sum(amount_received) receipts from payments where status='verified' and verified_at>=v_from and verified_at<v_to group by 1)x),
 'sales_by_product',(select coalesce(jsonb_agg(x),'[]') from(select oi.product_name,sum(oi.quantity) units,sum(oi.quantity*oi.unit_price) gross_sales,sum(oi.quantity*oi.unit_cost) known_product_cost,case when bool_and(oi.unit_cost is not null) then sum(oi.quantity*(oi.unit_price-oi.unit_cost)) else null end gross_profit,case when bool_and(oi.unit_cost is not null) then round(sum(oi.quantity*(oi.unit_price-oi.unit_cost))/nullif(sum(oi.quantity*oi.unit_price),0)*100,2) else null end gross_margin_percent from order_items oi join stock_reservations sr on sr.order_id=oi.order_id and sr.variant_id=oi.variant_id join orders o on o.id=oi.order_id where sr.status='consumed' and o.created_at>=v_from and o.created_at<v_to group by oi.product_name)x),
 'income_by_package',(select coalesce(jsonb_agg(x),'[]') from(select e.package_name,sum(p.amount_received) receipts from payments p join invoices i on i.id=p.invoice_id join coaching_enrollments e on e.id=i.enrollment_id where p.status='verified' and p.verified_at>=v_from and p.verified_at<v_to group by e.package_name)x),
 'recent_transactions',(select coalesce(jsonb_agg(x order by x.verified_at desc),'[]') from(select id,invoice_id,amount_received,bank_credit_reference,verified_at from payments where status='verified' and verified_at>=v_from and verified_at<v_to order by verified_at desc limit 25)x)
 ) into result from payments p join invoices i on i.id=p.invoice_id where p.status='verified' and p.verified_at>=v_from and p.verified_at<v_to;
 return result;
end $$;
-- Private provider retries are claimed by server handlers with conditional status updates.
alter table notifications add column locked_at timestamptz;
alter table campaign_recipients add column locked_at timestamptz;
create policy recipients_staff_prepare on campaign_recipients for insert to authenticated with check(is_staff() and exists(select 1 from campaigns c where c.id=campaign_id and c.status='draft') and exists(select 1 from newsletter_subscribers s where s.id=subscriber_id and s.status='subscribed') and status='pending');
create function public.protect_campaign() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then if new.status!='draft' then raise exception 'Campaign must begin as draft';end if;return new;end if;
 if old.status='draft' and new.status='approved' and current_setting('app.rpc_write',true) is distinct from '1' then raise exception 'Owner approval is required';end if;
 if old.status!='draft' and(new.subject,new.body_html,new.approved_by,new.approved_at) is distinct from(old.subject,old.body_html,old.approved_by,old.approved_at) then raise exception 'Approved content is immutable; create a new draft';end if;
 if old.status='draft' and new.status not in ('draft','approved') then raise exception 'Owner approval is required';end if;
 return new;
end $$;
create trigger campaign_guard before insert or update on campaigns for each row execute function protect_campaign();
-- Column grants prevent browser clients from seeing internal costs or financial verification notes.
revoke select on order_items from authenticated;
grant select(id,order_id,variant_id,product_name,sku,size,color,quantity,unit_price) on order_items to authenticated;
revoke select on payments from authenticated;
grant select(id,invoice_id,submitted_amount,amount_received,transfer_reference,bank_name,transferred_at,status,verified_at,created_at) on payments to authenticated;
-- Storage buckets and ownership policies. Guest uploads/signing go through server token validation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp','image/avif']),
 ('payment-proofs','payment-proofs',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy catalog_files_public on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy catalog_files_staff_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_staff());
create policy catalog_files_staff_update on storage.objects for update to authenticated using(bucket_id='product-images' and public.is_staff()) with check(bucket_id='product-images' and public.is_staff());
create policy catalog_files_staff_delete on storage.objects for delete to authenticated using(bucket_id='product-images' and public.is_staff());
create function public.can_read_proof(p_path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select is_staff() or exists(select 1 from payment_evidence e join payments p on p.id=e.payment_id join invoices i on i.id=p.invoice_id join customers c on c.id=i.customer_id where e.storage_path=p_path and c.profile_id=auth.uid()) $$;
create policy proof_owner_read on storage.objects for select to authenticated using(bucket_id='payment-proofs' and public.can_read_proof(name));
-- Never grant RPC functions to an anonymous browser or arbitrary authenticated user.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_staff(),public.is_owner(),public.owns_customer(uuid),public.product_is_public(uuid),public.can_read_proof(text) to anon,authenticated;
-- API internal return signatures are documented in docs/DATABASE_CONTRACT.md.
