-- Protect account linking and internal inventory statistics at direct database boundaries.
revoke select on product_variants from anon,authenticated;
grant select(id,product_id,sku,size,color,stock_available,stock_confirmed_at,low_stock_threshold,created_at) on product_variants to anon,authenticated;
alter table product_variants add column is_low_stock boolean generated always as(stock_confirmed_at is not null and stock_on_hand-stock_reserved<low_stock_threshold) stored;
create index variants_low_stock_idx on product_variants(product_id) where is_low_stock;
drop policy catalog_staff_insert on delivery_rates;
drop policy catalog_staff_update on delivery_rates;
create policy rates_owner_insert on delivery_rates for insert to authenticated with check(is_owner());
create policy rates_owner_update on delivery_rates for update to authenticated using(is_owner()) with check(is_owner());
create function public.protect_customer_link() returns trigger language plpgsql as $$
begin
 if current_user in ('authenticated','anon') then
  if tg_op='INSERT' then if new.profile_id is not null then raise exception 'Account linking requires verified contact and secure order token' using errcode='42501';end if;
  elsif new.profile_id is distinct from old.profile_id then raise exception 'Account linking requires verified contact and secure order token' using errcode='42501';end if;
 end if;return new;
end $$;
create trigger identity_link_guard before insert or update on customers for each row execute function protect_customer_link();
revoke execute on function public.protect_customer_link() from public,anon,authenticated;
grant execute on function public.protect_customer_link() to service_role;
