-- Additional database guards and fixes found during integration review.
create or replace function public.protect_ledger() returns trigger language plpgsql as $$
begin
 if current_setting('app.rpc_write',true) is distinct from '1' then raise exception 'Use the authorized transactional operation' using errcode='42501';end if;
 if tg_table_name='payments' then if tg_op!='INSERT' and old.status='verified' then raise exception 'Verified payment history is immutable';end if;end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
-- Typmod alone does not reject PostgreSQL numeric NaN. All monetary columns must be finite.
do $$ declare c record;begin
 for c in select table_name,column_name from information_schema.columns where table_schema='public' and data_type='numeric' and table_name in(select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE') loop
 execute format('alter table public.%I add constraint %I check(%I is null or %I between 0 and 999999999999.99)',c.table_name,'finite_'||c.column_name,c.column_name,c.column_name);
 end loop;
end $$;
-- Ledger refund entries are signed; preserve the finite guard while allowing negative adjustments.
alter table financial_adjustments drop constraint finite_amount;
alter table financial_adjustments add constraint finite_amount check(amount between -999999999999.99 and 999999999999.99);

create policy recipients_staff_prepare_delete on campaign_recipients for delete to authenticated using(is_staff() and exists(select 1 from campaigns where id=campaign_id and status='draft'));
create policy images_staff_delete on product_images for delete to authenticated using(is_staff());
create policy collection_links_staff_delete on collection_products for delete to authenticated using(is_staff());
do $$ declare t text;begin foreach t in array array['product_images','collection_products','site_content','coaching_packages','delivery_rates'] loop execute format('create trigger audit_mutation after insert or update or delete on public.%I for each row execute function public.audit_change()',t);end loop;end $$;
create function public.protect_product_cost() returns trigger language plpgsql as $$ begin
 if current_user in ('authenticated','anon') and not public.is_owner() then
  if tg_op='INSERT' then if new.cost_price is not null then raise exception 'Owner configures product costs' using errcode='42501';end if;
  elsif new.cost_price is distinct from old.cost_price then raise exception 'Owner configures product costs' using errcode='42501';end if;
 end if;return new;
end $$;
create trigger cost_guard before insert or update on products for each row execute function protect_product_cost();
revoke execute on function public.protect_product_cost() from public,anon,authenticated;
grant execute on function public.protect_product_cost() to service_role;
