-- Paystack checkout for guest merchandise invoices. Payment records stay in the
-- existing append-audited ledger and are settled through verify_payment.
alter table public.payments
  add column provider text not null default 'manual' check (provider in ('manual','paystack')),
  add column provider_reference text unique,
  add column provider_checkout_url text;

create function public.begin_paystack_payment(
  p_invoice_id uuid,
  p_guest_token text,
  p_reference text,
  p_amount numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i invoices%rowtype; p payments%rowtype;
begin
  perform assert_invoice_access(p_invoice_id,null,p_guest_token);
  if coalesce(length(trim(p_reference)),0) not between 10 and 100
     or p_reference !~ '^asc_[a-f0-9-]+$' then raise exception 'Invalid Paystack reference'; end if;
  select * into i from invoices where id=p_invoice_id for update;
  if not found or i.total_amount is null or i.outstanding_amount<=0 then raise exception 'Invoice is not payable'; end if;
  if p_amount<=0 or p_amount!=i.outstanding_amount then raise exception 'Payment amount changed; refresh the invoice'; end if;
  if i.order_id is null then raise exception 'Paystack checkout is currently available for merchandise orders'; end if;
  if exists(select 1 from orders where id=i.order_id and (delivery_status!='approved' or fulfillment_status='cancelled' or resolution_required)) then raise exception 'This order is not ready for payment'; end if;

  select * into p from payments where invoice_id=i.id and provider='paystack' and status='pending' order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('payment_id',p.id,'reference',p.provider_reference,'amount',p.submitted_amount,'authorization_url',p.provider_checkout_url);
  end if;

  perform set_config('app.rpc_write','1',true);
  insert into payments(invoice_id,submitted_amount,transfer_reference,bank_name,status,provider,provider_reference)
    values(i.id,p_amount,'paystack:'||lower(p_reference),'Paystack','pending','paystack',lower(p_reference)) returning * into p;
  return jsonb_build_object('payment_id',p.id,'reference',p.provider_reference,'amount',p.submitted_amount,'authorization_url',null);
end $$;

create function public.set_paystack_checkout_url(p_reference text,p_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(length(trim(p_reference)),0) not between 10 and 100
     or p_reference !~ '^asc_[a-f0-9-]+$'
     or p_url !~ '^https://checkout\.paystack\.com/' then raise exception 'Invalid Paystack checkout details'; end if;
  perform set_config('app.rpc_write','1',true);
  update payments set provider_checkout_url=p_url
   where provider='paystack' and provider_reference=lower(p_reference) and status='pending';
  if not found then raise exception 'Pending Paystack payment not found'; end if;
end $$;

create function public.verify_paystack_payment(p_reference text,p_amount numeric,p_invoice_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p payments%rowtype;i invoices%rowtype;v_owner uuid;
begin
  select * into p from payments where provider='paystack' and provider_reference=lower(trim(p_reference)) for update;
  if not found then raise exception 'Paystack payment reference not found'; end if;
  if p_invoice_id is not null and p.invoice_id!=p_invoice_id then raise exception 'Payment does not match this invoice'; end if;
  select * into i from invoices where id=p.invoice_id for update;
  if p.status='verified' then
    if p.amount_received!=p_amount or p.bank_credit_reference!='paystack:'||lower(trim(p_reference)) then raise exception 'Verified Paystack payment cannot be changed'; end if;
    return jsonb_build_object('payment',to_jsonb(p)-'notes'-'bank_credit_reference','invoice',to_jsonb(i));
  end if;
  if p.status!='pending' or p_amount<=0 or p_amount!=p.submitted_amount or p_amount>i.outstanding_amount then raise exception 'Paystack amount does not match the invoice balance'; end if;
  select user_id into v_owner from staff_roles where role='owner' order by created_at limit 1;
  if v_owner is null then raise exception 'ASCEND owner is not configured'; end if;
  return public.verify_payment(p.id,p_amount,'paystack:'||lower(trim(p_reference)),v_owner,'Paystack verified transaction');
end $$;

revoke execute on function public.begin_paystack_payment(uuid,text,text,numeric),public.set_paystack_checkout_url(text,text),public.verify_paystack_payment(text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.begin_paystack_payment(uuid,text,text,numeric),public.set_paystack_checkout_url(text,text),public.verify_paystack_payment(text,numeric,uuid) to service_role;
notify pgrst,'reload schema';
