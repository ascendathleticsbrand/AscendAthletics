-- Server scheduler expires plans using the configured business calendar, not UTC midnight.
create function public.expire_enrollments() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_today date;n integer;
begin
 select(now() at time zone timezone)::date into v_today from business_settings where id=1;
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor','',true);
 update coaching_enrollments set status='expired' where status='active' and expiry_date is not null and expiry_date<=v_today;
 get diagnostics n=row_count;return n;
end $$;
revoke execute on function public.expire_enrollments() from public,anon,authenticated;
grant execute on function public.expire_enrollments() to service_role;
