-- Owner grants bounded operational permissions; money, banks and roles remain owner authority.
create function public.has_permission(p_permission text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from staff_roles where user_id=auth.uid() and(role='owner' or p_permission in ('manage_packages','manage_delivery_rates') and permissions->p_permission='true'::jsonb))
$$;
revoke execute on function public.has_permission(text) from public,anon;
grant execute on function public.has_permission(text) to authenticated,service_role;
drop policy packages_owner_insert on coaching_packages;
drop policy packages_owner_update on coaching_packages;
create policy packages_authorized_insert on coaching_packages for insert to authenticated with check(has_permission('manage_packages'));
create policy packages_authorized_update on coaching_packages for update to authenticated using(has_permission('manage_packages')) with check(has_permission('manage_packages'));
drop policy rates_owner_insert on delivery_rates;
drop policy rates_owner_update on delivery_rates;
create policy rates_authorized_insert on delivery_rates for insert to authenticated with check(has_permission('manage_delivery_rates'));
create policy rates_authorized_update on delivery_rates for update to authenticated using(has_permission('manage_delivery_rates')) with check(has_permission('manage_delivery_rates'));
create function public.revoke_staff_access(p_user_id uuid,p_actor uuid,p_note text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s staff_roles%rowtype;
begin
 perform assert_staff(p_actor,true);if coalesce(length(trim(p_note)),0) not between 1 and 2000 then raise exception 'Staff access revocation reason required';end if;
 lock table staff_roles in share row exclusive mode;perform assert_staff(p_actor,true);
 select * into s from staff_roles where user_id=p_user_id;if not found then return jsonb_build_object('user_id',p_user_id,'revoked',false);end if;
 if s.role='owner' and(select count(*) from staff_roles where role='owner')<=1 then raise exception 'Cannot remove the last owner';end if;
 delete from staff_roles where user_id=p_user_id;
 insert into audit_logs(actor_id,action,table_name,record_id,before_data,after_data) values(p_actor,'STAFF_ACCESS_REVOKED','staff_roles',p_user_id::text,to_jsonb(s),jsonb_build_object('note',p_note));
 return jsonb_build_object('user_id',p_user_id,'revoked',true);
end $$;
revoke execute on function public.revoke_staff_access(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_staff_access(uuid,uuid,text) to service_role;
