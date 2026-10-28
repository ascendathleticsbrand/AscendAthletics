-- Durable transactional email outbox. No sending occurs inside a database transaction.
alter table notifications add column order_id uuid references orders(id);
alter table notifications add column invoice_id uuid references invoices(id);
alter table notifications add column payload jsonb not null default '{}';
drop policy notifications_read on notifications;
create policy notifications_staff_read on notifications for select to authenticated using(is_staff());
create function public.enqueue_transactional_notification(p_kind text,p_customer_id uuid,p_order_id uuid default null,p_enrollment_id uuid default null,p_invoice_id uuid default null,p_dedup_key text default null,p_payload jsonb default '{}') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_kind not in ('order_created','enrollment_requested','payment_verified','enrollment_activated') or p_dedup_key is null then raise exception 'Invalid transactional notification';end if;
 if p_payload ?| array['guest_token','guest_token_hash','bank_credit_reference','notes'] then raise exception 'Private financial references and plaintext access tokens must not enter the outbox';end if;
 insert into notifications(customer_id,order_id,enrollment_id,invoice_id,kind,scheduled_for,dedup_key,payload)
 values(p_customer_id,p_order_id,p_enrollment_id,p_invoice_id,p_kind,now(),p_dedup_key,p_payload) on conflict(dedup_key) do nothing;
end $$;
revoke execute on function public.enqueue_transactional_notification(text,uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_transactional_notification(text,uuid,uuid,uuid,uuid,text,jsonb) to service_role;
