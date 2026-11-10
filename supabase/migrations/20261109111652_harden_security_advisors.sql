-- Keep RLS helper functions out of PostgREST's exposed schemas. Their EXECUTE
-- grants remain available for policy evaluation, while the API cannot expose them
-- as /rpc endpoints because private is not in the project's exposed schema list.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_staff() set schema private;
alter function public.is_owner() set schema private;
alter function public.owns_customer(uuid) set schema private;
alter function public.product_is_public(uuid) set schema private;
alter function public.can_read_proof(text) set schema private;
alter function public.has_permission(text) set schema private;

-- Place trusted helper schemas before public and pg_temp for all definer helpers.
alter function private.is_staff() set search_path = pg_catalog, private, public, pg_temp;
alter function private.is_owner() set search_path = pg_catalog, private, public, pg_temp;
alter function private.owns_customer(uuid) set search_path = pg_catalog, private, public, pg_temp;
alter function private.product_is_public(uuid) set search_path = pg_catalog, private, public, pg_temp;
alter function private.can_read_proof(text) set search_path = pg_catalog, private, public, pg_temp;
alter function private.has_permission(text) set search_path = pg_catalog, private, public, pg_temp;

-- The business-settings row remains owner-only. The storefront reads only its
-- explicitly public fields through the server-only service client.
drop view if exists public.public_business_settings;

-- Freeze resolution for trigger and date helpers that did not yet have a path.
alter function public.calendar_expiry(date, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.append_only() set search_path = pg_catalog, public, pg_temp;
alter function public.protect_stock() set search_path = pg_catalog, public, pg_temp;
alter function public.require_confirmed_catalog() set search_path = pg_catalog, public, pg_temp;
alter function public.protect_ledger() set search_path = pg_catalog, public, pg_temp;
alter function public.protect_campaign() set search_path = pg_catalog, public, pg_temp;
alter function public.protect_product_cost() set search_path = pg_catalog, private, public, pg_temp;
alter function public.protect_customer_link() set search_path = pg_catalog, public, pg_temp;

-- The owner check in this trigger is deliberately kept inside the private
-- security-definer helper schema after the function move above.
create or replace function public.protect_product_cost()
returns trigger language plpgsql set search_path = pg_catalog, private, public, pg_temp as $$
begin
 if current_user in ('authenticated','anon') and not private.is_owner() then
  if tg_op='INSERT' then
   if new.cost_price is not null then raise exception 'Owner configures product costs' using errcode='42501';end if;
  elsif new.cost_price is distinct from old.cost_price then
   raise exception 'Owner configures product costs' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
