-- Run only on a disposable LOCAL Supabase database. Fixtures and impersonated sessions roll back.
begin;
do $$
declare
 owner_id uuid:='20000000-0000-0000-0000-000000000001';assistant_id uuid:='20000000-0000-0000-0000-000000000002';client_id uuid:='20000000-0000-0000-0000-000000000003';other_id uuid:='20000000-0000-0000-0000-000000000004';
 product_id uuid;draft_id uuid;variant_id uuid;package_id uuid;image_id uuid;
 a jsonb;b jsonb;guest jsonb;no_email jsonb;ea jsonb;eb jsonb;pa jsonb;pb jsonb;n integer;failed boolean;proof_a text;proof_b text;v text;
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (owner_id,'rls-owner@test.invalid','{"full_name":"RLS fixture owner"}',now()),(assistant_id,'rls-assistant@test.invalid','{"full_name":"RLS fixture assistant"}',now()),
 (client_id,'rls-client@test.invalid','{"full_name":"RLS fixture client"}',now()),(other_id,'rls-other@test.invalid','{"full_name":"RLS fixture other"}',now());
 insert into staff_roles(user_id,role) values(owner_id,'owner'),(assistant_id,'assistant');
 perform update_business_settings('{"pickup_location":"RLS fixture pickup - never live","bank_name":"RLS fixture bank","bank_account_number":"0000000000","bank_account_holder":"RLS fixture"}',owner_id);
 insert into products(name,slug,price,cost_price) values('RLS published fixture','rls-published-fixture',10000,5000) returning id into product_id;
 insert into products(name,slug,price) values('RLS draft fixture','rls-draft-fixture',10000) returning id into draft_id;
 insert into product_variants(product_id,sku) values(product_id,'RLS-FIXTURE-SKU') returning id into variant_id;
 insert into product_variants(product_id,sku) values(draft_id,'RLS-UNCONFIRMED-FIXTURE-SKU');
 perform record_stock(variant_id,'opening',20,owner_id);update products set status='active' where id=product_id;
 insert into product_images(product_id,storage_path,alt) values(product_id,'fixture.jpg','RLS fixture only') returning id into image_id;
 a=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"Client fixture","email":"rls-client@test.invalid","phone":"08000000001"}','pickup',p_actor=>client_id);
 b=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"Other fixture","email":"rls-other@test.invalid","phone":"08000000002"}','pickup',p_actor=>other_id);
 guest=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"Unlinked guest fixture","email":"rls-client@test.invalid","phone":"08000000003"}','pickup');
 no_email=create_checkout(jsonb_build_array(jsonb_build_object('variant_id',variant_id,'quantity',1)),'{"name":"No-email guest fixture","phone":"08000000004"}','pickup');
 insert into coaching_packages(name,mode,price,active) values('RLS fixture package','physical',50000,true) returning id into package_id;
 ea=request_enrollment(package_id,client_id);eb=request_enrollment(package_id,other_id);
 proof_a='proofs/'||(a->'invoice'->>'id')||'/30000000-0000-0000-0000-000000000001.jpg';proof_b='proofs/'||(b->'invoice'->>'id')||'/30000000-0000-0000-0000-000000000002.jpg';
 pa=submit_payment((a->'invoice'->>'id')::uuid,10000,'rls-client-claim',p_proof_path=>proof_a,p_actor=>client_id);
 pb=submit_payment((b->'invoice'->>'id')::uuid,10000,'rls-other-claim',p_proof_path=>proof_b,p_actor=>other_id);
 insert into storage.objects(bucket_id,name) values('payment-proofs',proof_a),('payment-proofs',proof_b),('product-images','fixture.jpg');
 insert into coaching_enrollment_notes(enrollment_id,body,created_by) values((ea->'enrollment'->>'id')::uuid,'Private staff administrative note',assistant_id);
 -- Impersonate a coaching client; the browser role cannot access any unrelated private row.
 perform set_config('request.jwt.claim.sub',client_id::text,true);execute 'set local role authenticated';
 select count(*) into n from orders;if n!=1 then raise exception 'Client order isolation failed: %',n;end if;
 select count(*) into n from coaching_enrollments;if n!=1 then raise exception 'Client coaching isolation failed';end if;
 select count(*) into n from invoices;if n!=2 then raise exception 'Client invoice isolation failed';end if;
 select count(*) into n from payments;if n!=1 then raise exception 'Client payment isolation failed';end if;
 select count(*) into n from payment_evidence;if n!=1 then raise exception 'Client document isolation failed';end if;
 select count(*) into n from storage.objects where bucket_id='payment-proofs';if n!=1 then raise exception 'Private storage isolation failed';end if;
 select count(*) into n from business_settings;if n!=0 then raise exception 'Client saw bank settings';end if;
 select count(*) into n from coaching_enrollment_notes;if n!=0 then raise exception 'Client saw private administrative notes';end if;
 failed:=false;begin perform guest_token_hash from orders;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser could read guest token hashes';end if;
 failed:=false;begin perform cost_price from products;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser could read product costs';end if;
 failed:=false;begin perform stock_sold from product_variants;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client read internal inventory sales counters';end if;
 select count(*) into n from notifications;if n!=0 then raise exception 'Client read private transactional outbox';end if;
 failed:=false;begin perform inventory_summary(owner_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser forged privileged inventory summary actor';end if;
 failed:=false;begin perform coaching_enrollment_search(e) from coaching_enrollments e;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser invoked private coaching search helper';end if;
 failed:=false;begin perform product_variant_search(pv) from product_variants pv;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser invoked private inventory search helper';end if;
 failed:=false;begin perform unit_cost from order_items;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client could read item costs';end if;
 failed:=false;begin perform notes from payments;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client could read verification notes';end if;
 failed:=false;begin perform bank_credit_reference from payments;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client could read bank-credit audit identifiers';end if;
 failed:=false;begin insert into staff_roles(user_id,role) values(client_id,'owner');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client escalated staff role';end if;
 failed:=false;begin perform verify_payment((pa->>'id')::uuid,10000,'forged-owner-credit',owner_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Browser executed forged owner RPC';end if;
 update profiles set full_name='Updated fixture profile' where id=client_id;select name into v from customers where profile_id=client_id;if v!='Updated fixture profile' then raise exception 'Profile update failed customer synchronization';end if;
 update product_variants set stock_on_hand=999 where id=variant_id;get diagnostics n=row_count;if n!=0 then raise exception 'Client altered stock';end if;
 update products set status='active' where id=draft_id;get diagnostics n=row_count;if n!=0 then raise exception 'Client published merchandise';end if;
 failed:=false;begin insert into products(name,slug,price,status) values('Client unauthorized product','rls-client-unauthorized-product',1,'draft');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Client created merchandise';end if;
 execute 'reset role';
 -- Verified-email matching alone is insufficient; secure possession of the guest token is required.
 failed:=false;begin perform link_guest_customer(client_id,no_email->>'guest_token');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Missing guest email bypassed verified identity matching';end if;
 perform link_guest_customer(client_id,guest->>'guest_token');
 perform set_config('request.jwt.claim.sub',client_id::text,true);execute 'set local role authenticated';select count(*) into n from orders;if n!=2 then raise exception 'Secure guest matching did not link customer history';end if;execute 'reset role';
 -- Assistants can manage operational content but cannot approve money or change banks/roles.
 perform set_config('request.jwt.claim.sub',assistant_id::text,true);execute 'set local role authenticated';
 select count(*) into n from orders;if n!=4 then raise exception 'Assistant operational order access failed';end if;
 select count(*) into n from storage.objects where bucket_id='payment-proofs';if n!=2 then raise exception 'Staff evidence access failed';end if;
 select count(*) into n from business_settings;if n!=0 then raise exception 'Assistant read protected bank configuration';end if;
 select count(*) into n from audit_logs;if n!=0 then raise exception 'Assistant saw owner financial audit history';end if;
 select count(*) into n from coaching_enrollment_notes;if n!=1 then raise exception 'Staff administrative notes access failed';end if;
 update products set description='Assistant content update' where id=product_id;get diagnostics n=row_count;if n!=1 then raise exception 'Assistant could not edit merchandise';end if;
 failed:=false;begin update products set cost_price=1 where id=product_id;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant altered cost financial field';end if;
 failed:=false;begin update customers set profile_id=other_id where id=(guest->'order'->>'customer_id')::uuid;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant bypassed verified customer linking';end if;
 failed:=false;begin insert into delivery_rates(state,fee) values('Unauthorized fixture',1);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant changed owner delivery-rate configuration';end if;
 delete from product_images where id=image_id;get diagnostics n=row_count;if n!=1 then raise exception 'Assistant could not manage image associations';end if;
 update invoices set amount_paid=10000 where id=(a->'invoice'->>'id')::uuid;get diagnostics n=row_count;if n!=0 then raise exception 'Assistant directly altered invoice balances';end if;
 failed:=false;begin update business_settings set bank_name='Assistant forged bank' where id=1;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant directly changed bank configuration';end if;
 failed:=false;begin insert into staff_roles(user_id,role) values(other_id,'owner');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Assistant directly granted staff role';end if;
 execute 'reset role';
 -- Explicit operational grants take effect in RLS and never grant bank or financial authority.
 perform set_staff_role(assistant_id,'assistant',jsonb_build_object('manage_packages',true,'manage_delivery_rates',true),owner_id);
 perform set_config('request.jwt.claim.sub',assistant_id::text,true);execute 'set local role authenticated';
 update coaching_packages set description='Granted assistant package edit' where id=package_id;get diagnostics n=row_count;if n!=1 then raise exception 'Granted package permission had no effect';end if;
 insert into delivery_rates(state,fee) values('Granted fixture rate',2000);
 failed:=false;begin update business_settings set bank_name='Granted assistant bank change';exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Operational grant leaked bank authority';end if;execute 'reset role';
 -- An actual service-role call still checks the signed-in actor, not a submitted role name.
 execute 'set local role service_role';
 select count(*) into n from product_variants pv where product_variant_search(pv) ilike '%RLS published fixture%';if n!=1 then raise exception 'Service role cannot filter inventory by product name';end if;
 select count(*) into n from coaching_enrollments e where coaching_enrollment_search(e) ilike '%rls-client@test.invalid%';if n!=1 then raise exception 'Service role cannot filter coaching by customer contact';end if;
 if(inventory_summary(assistant_id)->>'physical_stock')::bigint!=20 then raise exception 'Service staff inventory aggregate unavailable';end if;
 failed:=false;begin perform verify_payment((pa->>'id')::uuid,10000,'assistant-service-credit',assistant_id);exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Service endpoint bypassed actor authorization';end if;
 perform verify_payment((pa->>'id')::uuid,10000,'real-owner-service-credit',owner_id);execute 'reset role';
 -- Public catalog and configuration contain only sanitized, launch-ready content.
 perform set_config('request.jwt.claim.sub','',true);execute 'set local role anon';
 select count(*) into n from products;if n!=1 then raise exception 'Anonymous catalog included draft product';end if;
 select count(*) into n from public_catalog;if n!=1 then raise exception 'Sanitized catalog view failed';end if;
 select count(*) into n from public_business_settings;if n!=1 then raise exception 'Public settings missing';end if;
 select count(*) into n from storage.objects where bucket_id='payment-proofs';if n!=0 then raise exception 'Anonymous saw payment proofs';end if;
 failed:=false;begin perform id from customers;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Anonymous could query customer records';end if;
 failed:=false;begin perform guest_order(a->>'guest_token');exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Anonymous executed privileged guest RPC directly';end if;
 failed:=false;begin perform bank_name from business_settings;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Public leaked bank settings';end if;
 failed:=false;begin update products set status='active' where id=draft_id;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Anonymous could mutate merchandise';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);execute 'set local role authenticated';
 select count(*) into n from audit_logs;if n=0 then raise exception 'Owner audit visibility failed';end if;
 select count(*) into n from business_settings;if n!=1 then raise exception 'Owner settings visibility failed';end if;
 -- An owner must be able to publish using the same public RETURNING columns as the API,
 -- while purchasing costs remain unavailable to direct authenticated SELECT queries.
 failed:=false;begin perform cost_price from products;exception when insufficient_privilege then failed:=true;end;if not failed then raise exception 'Authenticated owner could directly read private product costs';end if;
 update products set status='draft' where id=product_id;get diagnostics n=row_count;if n!=1 then raise exception 'Owner could not prepare merchandise publication';end if;
 update products set status='active',cost_price=6000 where id=product_id returning status into v;
 get diagnostics n=row_count;if n!=1 or v is distinct from 'active' then raise exception 'Owner could not publish merchandise while setting its cost';end if;
 -- Publication guards still require an existing variant and confirmed opening count.
 failed:=false;begin update products set status='active' where id=draft_id;exception when raise_exception then if sqlerrm='Confirm opening stock before publishing' then failed:=true;else raise;end if;end;if not failed then raise exception 'Owner published merchandise without confirmed stock';end if;
 execute 'reset role';
 select cost_price into n from products where id=product_id;if n!=6000 then raise exception 'Owner publication did not persist its cost update';end if;
 select status into v from products where id=draft_id;if v is distinct from 'draft' then raise exception 'Failed publication changed the draft';end if;
end $$;
select 'PASS: anonymous sanitization, customer/order/coaching/payment/document isolation, bank and cost privacy, profile sync, secure guest matching, assistant operational rights, server+database owner restrictions, private proof storage, owner audit visibility and secure product publication' as rls_result;
rollback;
