-- Run once in the Supabase SQL Editor as the project administrator.
-- This script only grants the selected, already verified account its first owner role.
-- Later staff are managed by an existing owner through Admin > Settings.
begin;
do $$
declare owner_user uuid;
begin
  select id into owner_user from auth.users
  where lower(email)=lower('akgreat62@gmail.com')
    and email_confirmed_at is not null;
  if owner_user is null then
    raise exception 'Create and verify akgreat62@gmail.com before owner setup';
  end if;
  if not exists(select 1 from public.profiles where id=owner_user) then
    raise exception 'The verified account profile is missing; contact the project administrator before granting access';
  end if;
  if exists(select 1 from public.staff_roles where role='owner') then
    raise exception 'An owner already exists; use Admin > Settings to add or change staff';
  end if;
  perform set_config('app.actor',owner_user::text,true);
  insert into public.staff_roles(user_id,role,permissions)
  values(owner_user,'owner','{}');
end $$;
commit;
