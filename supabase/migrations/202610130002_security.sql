create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id,full_name,phone) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.raw_user_meta_data->>'phone');
 insert into customers(profile_id,name,email,phone) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1),'Coaching client'),new.email,new.raw_user_meta_data->>'phone');
 return new;
end $$;
create trigger ascend_new_user after insert on auth.users for each row execute function public.handle_new_user();
create function public.is_staff() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from staff_roles where user_id=auth.uid()) $$;
create function public.is_owner() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from staff_roles where user_id=auth.uid() and role='owner') $$;
create function public.owns_customer(p_customer uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from customers where id=p_customer and profile_id=auth.uid()) $$;
create function public.assert_staff(p_actor uuid,p_owner boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_actor is null or not exists(select 1 from staff_roles where user_id=p_actor and (not p_owner or role='owner')) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform set_config('app.actor',p_actor::text,true); perform set_config('app.rpc_write','1',true);
end $$;
create function public.assert_invoice_access(p_invoice_id uuid,p_actor uuid,p_guest_token text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from invoices i join customers c on c.id=i.customer_id left join orders o on o.id=i.order_id where i.id=p_invoice_id and ((p_actor is not null and (c.profile_id=p_actor or exists(select 1 from staff_roles where user_id=p_actor))) or(p_guest_token is not null and o.guest_token_hash=encode(extensions.digest(p_guest_token,'sha256'),'hex')))) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform set_config('app.actor',coalesce(p_actor::text,''),true); perform set_config('app.rpc_write','1',true);
end $$;
create function public.append_only() returns trigger language plpgsql as $$ begin raise exception 'History is immutable'; end $$;
create function public.protect_ledger() returns trigger language plpgsql as $$
begin
 if current_setting('app.rpc_write',true) is distinct from '1' then raise exception 'Use the authorized transactional operation' using errcode='42501'; end if;
 if tg_table_name='payments' and tg_op!='INSERT' and old.status='verified' then raise exception 'Verified payment history is immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create function public.protect_stock() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then
 if(new.stock_on_hand!=0 or new.stock_reserved!=0 or new.stock_sold!=0 or new.stock_confirmed_at is not null) and current_setting('app.rpc_write',true) is distinct from '1' then raise exception 'Opening stock requires physical count confirmation'; end if;
 elsif(new.stock_on_hand,new.stock_reserved,new.stock_sold,new.stock_confirmed_at) is distinct from(old.stock_on_hand,old.stock_reserved,old.stock_sold,old.stock_confirmed_at) and current_setting('app.rpc_write',true) is distinct from '1' then raise exception 'Use the transactional stock operation'; end if; return new;
end $$;
create function public.require_confirmed_catalog() returns trigger language plpgsql as $$ begin if new.status='active' and(not exists(select 1 from product_variants where product_id=new.id and stock_confirmed_at is not null) or exists(select 1 from product_variants where product_id=new.id and stock_confirmed_at is null)) then raise exception 'Confirm opening stock before publishing'; end if; return new; end $$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_old jsonb;v_new jsonb;v_actor uuid;
begin
 if tg_op!='INSERT' then v_old=to_jsonb(old);end if;if tg_op!='DELETE' then v_new=to_jsonb(new);end if;
 v_actor=coalesce(nullif(current_setting('app.actor',true),'')::uuid,auth.uid());
 v_old=v_old-'guest_token_hash'-'unsubscribe_token_hash';v_new=v_new-'guest_token_hash'-'unsubscribe_token_hash';
 insert into audit_logs(actor_id,action,table_name,record_id,before_data,after_data) values(v_actor,tg_op,tg_table_name,coalesce(v_new->>'id',v_old->>'id',v_new->>'user_id',v_old->>'user_id'),v_old,v_new);
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger stock_guard before insert or update on product_variants for each row execute function protect_stock();
create trigger catalog_guard before insert or update on products for each row execute function require_confirmed_catalog();
do $$ declare t text;begin
 foreach t in array array['invoices','payments','stock_reservations','coaching_enrollments'] loop execute format('create trigger ledger_guard before insert or update or delete on public.%I for each row execute function public.protect_ledger()',t);end loop;
 foreach t in array array['stock_movements','financial_adjustments','refunds','marketing_consents','audit_logs','fulfillment_events','coaching_session_usage'] loop execute format('create trigger immutable_history before update or delete on public.%I for each row execute function public.append_only()',t);end loop;
 foreach t in array array['products','product_variants','orders','payments','invoices','refunds','expenses','business_settings','staff_roles','coaching_enrollments','stock_movements','campaigns'] loop execute format('create trigger audit_mutation after insert or update or delete on public.%I for each row execute function public.audit_change()',t);end loop;
 foreach t in array array['profiles','staff_roles','customers','customer_addresses','categories','products','product_variants','product_images','collections','collection_products','business_settings','delivery_rates','orders','order_items','stock_reservations','stock_movements','order_notes','fulfillment_events','coaching_packages','coaching_enrollments','coaching_session_usage','invoices','payments','payment_evidence','refunds','financial_adjustments','expenses','newsletter_subscribers','marketing_consents','campaigns','campaign_recipients','notifications','site_content','audit_logs','rate_limits'] loop execute format('alter table public.%I enable row level security',t);end loop;
end $$;
create function public.product_is_public(p_product uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from products p join product_variants v on v.product_id=p.id where p.id=p_product and p.status='active' and v.stock_confirmed_at is not null) $$;
create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or is_staff());
create policy profiles_edit_self on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy staff_roles_read on staff_roles for select to authenticated using(user_id=auth.uid() or is_owner());
create policy customers_read on customers for select to authenticated using(profile_id=auth.uid() or is_staff());
create policy customers_staff_insert on customers for insert to authenticated with check(is_staff());
create policy customers_staff_update on customers for update to authenticated using(is_staff()) with check(is_staff());
create policy addresses_read on customer_addresses for select to authenticated using(owns_customer(customer_id) or is_staff());
create policy addresses_write on customer_addresses for all to authenticated using(owns_customer(customer_id) or is_staff()) with check(owns_customer(customer_id) or is_staff());
create policy categories_public on categories for select to anon,authenticated using(active or is_staff());
create policy products_public on products for select to anon,authenticated using(is_staff() or product_is_public(id));
create policy variants_public on product_variants for select to anon,authenticated using(is_staff() or stock_confirmed_at is not null and product_is_public(product_id));
create policy images_public on product_images for select to anon,authenticated using(is_staff() or product_is_public(product_id));
create policy collections_public on collections for select to anon,authenticated using(is_staff() or status in ('published','upcoming') and(status='upcoming' or launch_at is null or launch_at<=now()));
create policy collection_products_public on collection_products for select to anon,authenticated using(is_staff() or product_is_public(product_id) and exists(select 1 from collections where id=collection_id));
create policy packages_public on coaching_packages for select to anon,authenticated using(active or is_staff());
create policy content_public on site_content for select to anon,authenticated using(published or is_staff());
create policy rates_public on delivery_rates for select to anon,authenticated using(active or is_staff());
do $$ declare t text;begin
 foreach t in array array['categories','products','product_variants','product_images','collections','collection_products','site_content','delivery_rates'] loop
 execute format('create policy catalog_staff_insert on public.%I for insert to authenticated with check(public.is_staff())',t);
 execute format('create policy catalog_staff_update on public.%I for update to authenticated using(public.is_staff()) with check(public.is_staff())',t);
 execute format('create policy catalog_owner_delete on public.%I for delete to authenticated using(public.is_owner())',t);end loop;
end $$;
create policy packages_owner_insert on coaching_packages for insert to authenticated with check(is_owner());
create policy packages_owner_update on coaching_packages for update to authenticated using(is_owner()) with check(is_owner());
create policy orders_read on orders for select to authenticated using(owns_customer(customer_id) or is_staff());
create policy items_read on order_items for select to authenticated using(exists(select 1 from orders where id=order_id));
create policy enrollments_read on coaching_enrollments for select to authenticated using(owns_customer(customer_id) or is_staff());
create policy sessions_read on coaching_session_usage for select to authenticated using(exists(select 1 from coaching_enrollments where id=enrollment_id));
create policy invoices_read on invoices for select to authenticated using(owns_customer(customer_id) or is_staff());
create policy payments_read on payments for select to authenticated using(exists(select 1 from invoices where id=invoice_id));
create policy evidence_read on payment_evidence for select to authenticated using(exists(select 1 from payments where id=payment_id));
create policy refunds_read on refunds for select to authenticated using(exists(select 1 from payments where id=payment_id));
create policy notifications_read on notifications for select to authenticated using(owns_customer(customer_id) or is_staff());
do $$ declare t text;begin
 foreach t in array array['stock_reservations','stock_movements','order_notes','fulfillment_events','financial_adjustments','newsletter_subscribers','marketing_consents','campaigns','campaign_recipients'] loop execute format('create policy staff_read on public.%I for select to authenticated using(public.is_staff())',t);end loop;
end $$;
create policy settings_read on business_settings for select to authenticated using(is_owner());
create policy audits_owner_read on audit_logs for select to authenticated using(is_owner());
create policy expenses_owner_read on expenses for select to authenticated using(is_owner());
create policy expenses_owner_insert on expenses for insert to authenticated with check(is_owner() and created_by=auth.uid());
create policy notes_staff_insert on order_notes for insert to authenticated with check(is_staff() and created_by=auth.uid());
create policy campaigns_staff_insert on campaigns for insert to authenticated with check(is_staff() and status='draft' and approved_by is null);
create policy campaigns_staff_update on campaigns for update to authenticated using(is_staff() and status='draft') with check(is_staff() and status='draft' and approved_by is null);
revoke all on all tables in schema public from anon;
grant select on categories,product_variants,product_images,collections,collection_products,coaching_packages,site_content,delivery_rates to anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke select on products from anon,authenticated;
grant select(id,category_id,name,slug,description,price,status,featured,size_guide,created_at,updated_at) on products to anon,authenticated;
revoke select on orders from authenticated;
grant select(id,order_number,customer_id,source,customer_name,customer_email,customer_phone,fulfillment_method,delivery_details,delivery_status,delivery_fee,subtotal,total_amount,fulfillment_status,resolution_required,pay_later_authorized,reservation_expires_at,courier_name,tracking_reference,created_by,created_at,updated_at) on orders to authenticated;
revoke select on newsletter_subscribers from authenticated;
grant select(id,email,name,status,created_at,updated_at) on newsletter_subscribers to authenticated;
revoke all on rate_limits from authenticated;
revoke all on staff_roles from authenticated;grant select on staff_roles to authenticated;
revoke all on business_settings from authenticated;grant select on business_settings to authenticated;
grant all on all tables in schema public to service_role;
insert into business_settings(id,whatsapp_number) values(1,'2349130607719');
insert into categories(name,slug,sort_order) values('Compression Shirts','compression-shirts',1),('Gym Tops','gym-tops',2),('Shorts','shorts',3),('Joggers','joggers',4),('Gym Accessories','gym-accessories',5),('Other Merchandise','other-merchandise',6);
create view public.public_business_settings with(security_barrier=true) as select pickup_location,pickup_instructions,pickup_contact,pickup_hours,contact_email,whatsapp_number,instagram_url,timezone from business_settings where id=1;
grant select on public_business_settings to anon,authenticated,service_role;
create view public.public_catalog with(security_invoker=true) as select p.id,p.category_id,p.name,p.slug,p.description,p.price,p.status,p.featured,p.size_guide,(select jsonb_agg(jsonb_build_object('id',i.id,'storage_path',i.storage_path,'alt',i.alt,'sort_order',i.sort_order) order by i.sort_order) from product_images i where i.product_id=p.id) images,(select jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'stock_available',v.stock_available)) from product_variants v where v.product_id=p.id and v.stock_confirmed_at is not null) variants from products p where product_is_public(p.id);
grant select on public_catalog to anon,authenticated,service_role;
