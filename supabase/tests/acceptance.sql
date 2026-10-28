-- Run against a disposable LOCAL Supabase database after migrations. Everything rolls back.
begin;
do $$
declare
 owner_id uuid:='10000000-0000-0000-0000-000000000001';assistant_id uuid:='10000000-0000-0000-0000-000000000002';client_id uuid:='10000000-0000-0000-0000-000000000003';other_id uuid:='10000000-0000-0000-0000-000000000004';
 product_id uuid;variant_id uuid;package_id uuid;online_id uuid;session_package uuid;customer_id uuid;
 checkout jsonb;manual_order jsonb;cancelled jsonb;delivery jsonb;late jsonb;competing jsonb;exception_order jsonb;enroll jsonb;online_enroll jsonb;sessions jsonb;
 claim jsonb;claim2 jsonb;v jsonb;report jsonb;subscription jsonb;invoice_id uuid;payment_id uuid;failed boolean;
 v_stock product_variants%rowtype;v_invoice invoices%rowtype;
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (owner_id,'owner@test.invalid','{"full_name":"Fixture owner"}',now()),(assistant_id,'assistant@test.invalid','{"full_name":"Fixture assistant"}',now()),
 (client_id,'client@test.invalid','{"full_name":"Fixture client"}',now()),(other_id,'other@test.invalid','{"full_name":"Fixture other","role":"owner"}',now());
 insert into staff_roles(user_id,role) values(owner_id,'owner'),(assistant_id,'assistant');
 if exists(select 1 from staff_roles where user_id in(client_id,other_id)) then raise exception 'Signup escalated client role';end if;
 perform update_business_settings('{"bank_name":"Fixture bank","bank_account_number":"0000000000","bank_account_holder":"SQL test fixture","pickup_location":"SQL fixture pickup - never live","reservation_minutes":60}',owner_id);
 insert into products(name,slug,price,cost_price) values('SQL fixture shirt','sql-fixture-shirt',25000,10000) returning id into product_id;
 insert into product_variants(product_id,sku,size,color) values(product_id,'SQL-FIXTURE-L-BLACK','L','Black') returning id into variant_id;
 failed:=false;begin update products set status='active' where id=product_id;exception when others then failed:=true;end;
 if not failed then raise exception 'Uncounted product was published';end if;
 failed:=false;begin perform record_stock(variant_id,'restock',10,assistant_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Restock bypassed physical opening count';end if;
 perform record_stock(variant_id,'opening',10,assistant_id,'Physically counted fixture stock');update products set status='active' where id=product_id;
 checkout=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',2,'unit_price',1)),'{"name":"SQL guest","email":"guest@test.invalid","phone":"08000000000"}','pickup');
 invoice_id=(checkout->'invoice'->>'id')::uuid;if(checkout->'invoice'->>'total_amount')::numeric!=50000 then raise exception 'Tampered cart price affected checkout';end if;
 if checkout->'order'->>'guest_token_hash' is not null or length(checkout->>'guest_token')!=64 then raise exception 'Guest token was insecure';end if;
 if guest_order(repeat('0',64)) is not null or guest_order(checkout->>'guest_token')->'order'->>'id'!=checkout->'order'->>'id' then raise exception 'Secure guest lookup failed';end if;
 select * into v_stock from product_variants where id=variant_id;
 if v_stock.stock_on_hand!=10 or v_stock.stock_reserved!=2 or v_stock.stock_available!=8 then raise exception 'Checkout reservation incorrect';end if;
 claim=submit_payment(invoice_id,20000,'claim-partial',p_guest_token=>checkout->>'guest_token');payment_id=(claim->>'id')::uuid;
 report=financial_summary(owner_id);
 if (report->>'total_recorded_receipts')::numeric!=0 then raise exception 'Unverified evidence counted as revenue';end if;
 select * into v_invoice from invoices where id=invoice_id;
 if v_invoice.amount_paid!=0 or v_invoice.payment_status!='evidence_submitted' then raise exception 'Evidence marked paid';end if;
 -- Repeated claims and verified retries are idempotent.
 claim2=submit_payment(invoice_id,20000,'claim-partial',p_guest_token=>checkout->>'guest_token');
 if claim2->>'id'!=claim->>'id' then raise exception 'Repeated evidence duplicated';end if;
 failed:=false;begin perform verify_payment(payment_id,20000,'bank-credit-partial',assistant_id);exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Assistant verified funds';end if;
 v=verify_payment(payment_id,20000,'BANK-CREDIT-PARTIAL',owner_id);v=verify_payment(payment_id,20000,'bank-credit-partial',owner_id);
 select * into v_invoice from invoices where id=invoice_id;
 if v_invoice.amount_paid!=20000 or v_invoice.outstanding_amount!=30000 or v_invoice.payment_status!='partially_paid' then raise exception '20000 toward 50000 did not leave 30000';end if;
 select * into v_stock from product_variants where id=variant_id;
 if v_stock.stock_on_hand!=10 or v_stock.stock_reserved!=2 then raise exception 'Partial payment prematurely consumed stock';end if;
 failed:=false;begin perform update_fulfillment((checkout->'order'->>'id')::uuid,'processing',assistant_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Unpaid order was fulfilled';end if;
 claim2=submit_payment(invoice_id,30000,'claim-balance',p_guest_token=>checkout->>'guest_token');
 failed:=false;begin perform verify_payment((claim2->>'id')::uuid,30000,'bank-credit-partial',owner_id);exception when others then failed:=true;end;
 if not failed then raise exception 'One actual bank credit counted twice';end if;
 perform verify_payment((claim2->>'id')::uuid,30000,'bank-credit-balance',owner_id);
 select * into v_stock from product_variants where id=variant_id;
 if v_stock.stock_on_hand!=8 or v_stock.stock_reserved!=0 or v_stock.stock_sold!=2 or v_stock.stock_available!=8 then raise exception 'Paid order double-counted reservation or sale';end if;
 perform update_fulfillment((checkout->'order'->>'id')::uuid,'ready_for_pickup',assistant_id);
 perform update_fulfillment((checkout->'order'->>'id')::uuid,'picked_up',assistant_id);
 manual_order=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"WhatsApp fixture","phone":"08000000001"}','pickup',p_actor=>assistant_id,p_source=>'whatsapp');
 claim2=submit_payment((manual_order->'invoice'->>'id')::uuid,25000,'whatsapp-claim',p_actor=>assistant_id);
 perform verify_payment((claim2->>'id')::uuid,25000,'whatsapp-credit',owner_id);
 if (manual_order->'order'->>'source')!='whatsapp' or(select stock_on_hand from product_variants where id=variant_id)!=7 then raise exception 'Manual WhatsApp sale failed';end if;
 cancelled=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"Cancellation fixture","phone":"08000000002"}','pickup');
 perform cancel_order((cancelled->'order'->>'id')::uuid,assistant_id,'Customer cancellation');
 if(select stock_reserved from product_variants where id=variant_id)!=0 then raise exception 'Cancellation did not release reservation';end if;
 -- Unknown delivery fees require a quote and secure customer approval before any transfer claim.
 delivery=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"Delivery fixture","phone":"08000000003"}','delivery','{"recipient_name":"Delivery fixture","phone":"08000000003","state":"Oyo","city":"Ibadan","area":"Fixture area","address":"SQL test address"}');
 if delivery->'invoice'->>'total_amount' is not null then raise exception 'Unknown delivery rate invented a fee';end if;
 failed:=false;begin perform submit_payment((delivery->'invoice'->>'id')::uuid,25000,'early-delivery',p_guest_token=>delivery->>'guest_token');exception when others then failed:=true;end;
 if not failed then raise exception 'Unapproved delivery accepted evidence';end if;
 perform quote_delivery((delivery->'order'->>'id')::uuid,5000,assistant_id);
 failed:=false;begin perform approve_delivery((delivery->'order'->>'id')::uuid,p_actor=>assistant_id);exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Staff impersonated final customer approval';end if;
 perform approve_delivery((delivery->'order'->>'id')::uuid,delivery->>'guest_token');
 if(select total_amount from invoices where id=(delivery->'invoice'->>'id')::uuid)!=30000 then raise exception 'Approved delivery total incorrect';end if;
 claim2=submit_payment((delivery->'invoice'->>'id')::uuid,30000,'delivery-claim',p_guest_token=>delivery->>'guest_token');perform verify_payment((claim2->>'id')::uuid,30000,'delivery-credit',owner_id);
 perform update_fulfillment((delivery->'order'->>'id')::uuid,'shipped',assistant_id,'Fixture courier','TEST-ONLY');
 perform update_fulfillment((delivery->'order'->>'id')::uuid,'delivered',assistant_id);
 -- Reservation expiry and a competing sale must never oversell on late verification.
 late=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',5)),'{"name":"Late fixture","phone":"08000000004"}','pickup');
 update stock_reservations set expires_at=now()-interval '1 second' where order_id=(late->'order'->>'id')::uuid;
 perform expire_reservations();
 competing=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',6)),'{"name":"Competing fixture","phone":"08000000005"}','pickup');
 claim2=submit_payment((late->'invoice'->>'id')::uuid,125000,'late-claim',p_guest_token=>late->>'guest_token');perform verify_payment((claim2->>'id')::uuid,125000,'late-credit',owner_id);
 if not(select resolution_required from orders where id=(late->'order'->>'id')::uuid) or(select stock_on_hand from product_variants where id=variant_id)!=6 or(select stock_reserved from product_variants where id=variant_id)!=6 then raise exception 'Late payment silently oversold stock';end if;
 failed:=false;begin perform resolve_order_stock((late->'order'->>'id')::uuid,assistant_id,'Assistant cannot approve resolution');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant resolved restricted paid stock conflict';end if;
 perform record_stock(variant_id,'restock',5,assistant_id,'Physically counted conflict-resolution restock');
 perform resolve_order_stock((late->'order'->>'id')::uuid,owner_id,'Verified the physical restock and allocated the paid order');
 perform update_fulfillment((late->'order'->>'id')::uuid,'processing',assistant_id);
 if(select stock_on_hand from product_variants where id=variant_id)!=6 or(select stock_reserved from product_variants where id=variant_id)!=6 then raise exception 'Owner resolution or fulfillment decremented stock twice';end if;
 perform cancel_order((competing->'order'->>'id')::uuid,assistant_id,'Release competing fixture');
 if(select resolution_required from orders where id=(late->'order'->>'id')::uuid) or(select stock_on_hand from product_variants where id=variant_id)!=6 then raise exception 'Restored availability did not resolve paid order';end if;
 -- A partial receipt plus explicit owner pay-later authorization can settle an expired reservation safely.
 exception_order=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',2)),'{"name":"Pay-later fixture","phone":"08000000006"}','pickup');
 claim2=submit_payment((exception_order->'invoice'->>'id')::uuid,10000,'paylater-claim',p_guest_token=>exception_order->>'guest_token');perform verify_payment((claim2->>'id')::uuid,10000,'paylater-credit',owner_id);
 update stock_reservations set expires_at=now()-interval '1 second' where order_id=(exception_order->'order'->>'id')::uuid;perform expire_reservations();
 perform authorize_pay_later((exception_order->'invoice'->>'id')::uuid,owner_id,'Verified partial receipt and explicitly approved balance arrangement');
 perform update_fulfillment((exception_order->'order'->>'id')::uuid,'processing',assistant_id);
 if(select stock_on_hand from product_variants where id=variant_id)!=4 or(select stock_reserved from product_variants where id=variant_id)!=0 or(select outstanding_amount from invoices where id=(exception_order->'invoice'->>'id')::uuid)!=40000 then raise exception 'Expired partial pay-later fulfillment path failed';end if;
 -- Monthly rules are calendar based, including month end and leap year.
 if calendar_expiry('2026-01-31',1)!='2026-02-28'::date or calendar_expiry('2028-01-31',1)!='2028-02-29'::date or calendar_expiry('2026-12-15',2)!='2027-02-15'::date then raise exception 'Calendar-month expiry failed';end if;
 insert into coaching_packages(name,mode,price,active) values('Physical fixture','physical',50000,true) returning id into package_id;
 insert into coaching_packages(name,mode,price,active) values('Online fixture','online',40000,true) returning id into online_id;
 enroll=request_enrollment(package_id,client_id,p_preferences=>'{"goal":"Strength","schedule":"Weekday evenings"}');online_enroll=request_enrollment(online_id,client_id);
 if enroll->'enrollment'->'training_preferences'->>'goal'!='Strength' then raise exception 'Training preference snapshot missing';end if;
 failed:=false;begin perform request_enrollment(package_id,client_id,p_preferences=>jsonb_build_object('medical_history','Forbidden field'));exception when others then failed:=true;end;if not failed then raise exception 'Sensitive training preference field accepted';end if;
 if online_enroll->'enrollment'->>'mode'!='online' then raise exception 'Online mode snapshot incorrect';end if;
 failed:=false;begin perform activate_enrollment((enroll->'enrollment'->>'id')::uuid,'2026-01-31',owner_id);exception when others then failed:=true;end;
 if not failed then raise exception 'Unverified coaching activated';end if;
 claim2=submit_payment((enroll->'invoice'->>'id')::uuid,50000,'coaching-claim',p_actor=>client_id);perform verify_payment((claim2->>'id')::uuid,50000,'coaching-credit',owner_id);
 if(select status from coaching_enrollments where id=(enroll->'enrollment'->>'id')::uuid)!='requested' then raise exception 'Payment automatically started coaching';end if;
 v=activate_enrollment((enroll->'enrollment'->>'id')::uuid,'2026-01-31',owner_id);
 if v->>'expiry_date'!='2026-02-28' or v->>'mode'!='physical' then raise exception 'Physical coaching activation incorrect';end if;
 -- Explicit owner exceptions retain an audit entry and do not invent received revenue.
 perform authorize_pay_later((online_enroll->'invoice'->>'id')::uuid,owner_id,'Approved SQL fixture exception');perform activate_enrollment((online_enroll->'enrollment'->>'id')::uuid,'2026-01-31',owner_id);
 insert into coaching_packages(name,mode,price,billing_model,session_count,active) values('Session fixture','physical',10000,'session_bundle',2,true) returning id into session_package;
 sessions=request_enrollment(session_package,client_id);perform authorize_pay_later((sessions->'invoice'->>'id')::uuid,owner_id,'Fixture session exception');perform activate_enrollment((sessions->'enrollment'->>'id')::uuid,'2026-01-01',owner_id);
 perform record_coaching_session((sessions->'enrollment'->>'id')::uuid,'2026-01-02',assistant_id);perform record_coaching_session((sessions->'enrollment'->>'id')::uuid,'2026-01-03',assistant_id);
 failed:=false;begin perform record_coaching_session((sessions->'enrollment'->>'id')::uuid,'2026-01-04',assistant_id);exception when others then failed:=true;end;if not failed then raise exception 'Session bundle exceeded paid session count';end if;
 failed:=false;begin perform update_business_settings('{"bank_name":"Assistant change"}',assistant_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant changed bank details';end if;
 failed:=false;begin perform set_staff_role(assistant_id,'owner','{}',assistant_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant escalated role';end if;
 failed:=false;begin perform revoke_staff_access(owner_id,owner_id,'Cannot revoke last owner');exception when others then failed:=true;end;if not failed then raise exception 'Last owner was removed';end if;
 failed:=false;begin insert into products(name,slug,price) values('Invalid finite-money fixture','invalid-finite-money-fixture','NaN'::numeric);exception when check_violation then failed:=true;end;if not failed then raise exception 'NaN money entered the database';end if;
 perform record_refund(payment_id,5000,'Fixture partial refund','refund-fixture-credit',owner_id);
 insert into expenses(category,description,amount,spent_on,created_by) values('packaging','SQL fixture expense',2000,'2026-10-13',owner_id);
 report=financial_summary(owner_id);
 if(report->>'total_recorded_receipts')::numeric!=290000 or(report->>'merchandise_revenue')::numeric!=240000 or(report->>'coaching_revenue')::numeric!=50000 or(report->>'refunds')::numeric!=5000 or(report->>'expenses')::numeric!=2000 then raise exception 'Financial reconciliation incorrect: %',report;end if;
 failed:=false;begin delete from payments where id=payment_id;exception when others then failed:=true;end;if not failed then raise exception 'Verified payment was deleted';end if;
 failed:=false;begin update stock_movements set note='rewrite';exception when others then failed:=true;end;if not failed then raise exception 'Stock audit was mutable';end if;
 failed:=false;begin update audit_logs set action='rewrite';exception when others then failed:=true;end;if not failed then raise exception 'Audit history was mutable';end if;
 if(select count(*) from newsletter_subscribers)!=0 then raise exception 'Purchases implicitly subscribed marketing contacts';end if;
 if(select stock_on_hand from product_variants where id=variant_id)!=4 then raise exception 'Refund automatically restored stock';end if;
 failed:=false;begin perform record_stock(variant_id,'return',1,assistant_id,'Unconfirmed return');exception when others then failed:=true;end;if not failed then raise exception 'Uninspected return restored stock';end if;
 subscription=subscribe_newsletter('subscriber@test.invalid','Fixture subscriber');perform unsubscribe_subscriber((subscription->>'subscriber_id')::uuid);perform unsubscribe_subscriber((subscription->>'subscriber_id')::uuid);
 if(select count(*) from marketing_consents where subscriber_id=(subscription->>'subscriber_id')::uuid and action='opt_out')!=1 then raise exception 'Opt-out not deduplicated';end if;
 perform expire_enrollments();if(select status from coaching_enrollments where id=(enroll->'enrollment'->>'id')::uuid)!='expired' then raise exception 'Calendar-expired enrollment remained active';end if;
 if(select count(*) from notifications where dedup_key='payment_verified:'||payment_id::text)!=1 then raise exception 'Payment verification outbox was not deduplicated';end if;
 if not exists(select 1 from notifications where dedup_key='payment_verified:'||payment_id::text and (payload->>'amount_received')::numeric=20000 and (payload->>'amount_paid')::numeric=20000 and (payload->>'total_amount')::numeric=50000 and (payload->>'outstanding_amount')::numeric=30000 and payload->>'payment_status'='partially_paid') then raise exception 'Verified-payment event did not preserve authoritative partial-receipt snapshot';end if;
 if not exists(select 1 from notifications where kind='enrollment_requested' and enrollment_id=(enroll->'enrollment'->>'id')::uuid and payload->>'package_name'=enroll->'enrollment'->>'package_name') then raise exception 'Enrollment request outbox missing';end if;
 if not exists(select 1 from notifications where kind='order_created' and order_id=(checkout->'order'->>'id')::uuid and notifications.invoice_id=(checkout->'invoice'->>'id')::uuid) then raise exception 'Order confirmation outbox missing';end if;
 if not exists(select 1 from notifications where kind='enrollment_activated' and enrollment_id=(enroll->'enrollment'->>'id')::uuid) then raise exception 'Enrollment activation outbox missing';end if;
 if exists(select 1 from notifications where payload ?| array['guest_token','bank_credit_reference']) then raise exception 'Private plaintext data leaked into outbox';end if;
 -- These aggregates deliberately exceed the hosted API's usual 1000-row response cap.
 report=inventory_summary(assistant_id);
 insert into product_variants(product_id,sku,size,stock_on_hand,stock_confirmed_at)
 select product_id,'SUMMARY-FIXTURE-'||n,n::text,2,now() from generate_series(1,1001) n;
 insert into product_variants(product_id,sku,size) values(product_id,'SUMMARY-UNCONFIRMED','Unconfirmed summary fixture');
 v=inventory_summary(owner_id);
 if(v->>'physical_stock')::bigint!=(report->>'physical_stock')::bigint+2002 or(v->>'available_stock')::bigint!=(report->>'available_stock')::bigint+2002 or(v->>'reserved_stock')::bigint!=(report->>'reserved_stock')::bigint or(v->>'low_stock')::bigint!=(report->>'low_stock')::bigint+1001 or(v->>'unconfirmed_stock')::bigint!=(report->>'unconfirmed_stock')::bigint+1 then raise exception 'Inventory summary was truncated or included unconfirmed stock';end if;
 failed:=false;begin perform inventory_summary(client_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client actor accessed private inventory summary';end if;
 if not exists(select 1 from coaching_enrollments e where e.id=(enroll->'enrollment'->>'id')::uuid and coaching_enrollment_search(e) ilike '%client@test.invalid%') then raise exception 'Coaching search missed linked client contact';end if;
 if not exists(select 1 from product_variants pv where pv.id=variant_id and product_variant_search(pv) ilike '%SQL fixture shirt%') then raise exception 'Inventory search missed product name';end if;
 failed:=false;begin perform revoke_staff_access(assistant_id,assistant_id,'Assistant cannot revoke staff');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant revoked staff authority';end if;
 perform revoke_staff_access(assistant_id,owner_id,'Fixture owner removed staff access');if exists(select 1 from staff_roles where user_id=assistant_id) or not exists(select 1 from profiles where id=assistant_id) then raise exception 'Revocation failed or deleted identity records';end if;
 if not check_rate_limit('fixture-limit',2,60) or not check_rate_limit('fixture-limit',2,60) or check_rate_limit('fixture-limit',2,60) then raise exception 'Transactional rate limit failed';end if;
end $$;
select 'PASS: opening stock, reservations, guest lookup, evidence-only claims, partial payments, duplicate credits, pickup, delivery quote approval, late payment conflict, WhatsApp, calendar expiry, physical/online coaching, session limit, staff restrictions, receipts/refunds/expenses, immutable audit, consent and rate limits' as acceptance_result;
rollback;

