create function public.calendar_expiry(p_start_date date,p_months integer) returns date language plpgsql immutable as $$ begin if p_start_date is null or p_months not between 1 and 36 then raise exception 'Start date and 1 to 36 calendar months required';end if;return(p_start_date+make_interval(months=>p_months))::date;end $$;
create function public.request_enrollment(p_package_id uuid,p_actor uuid,p_customer_id uuid default null,p_preferences jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c uuid;p coaching_packages%rowtype;e coaching_enrollments%rowtype;i invoices%rowtype;k text;
begin
 if p_preferences is null or jsonb_typeof(p_preferences)!='object' then raise exception 'Training preferences must be an object';end if;
 for k in select jsonb_object_keys(p_preferences) loop if k not in ('goal','schedule') or jsonb_typeof(p_preferences->k)!='string' or length(p_preferences->>k)>500 then raise exception 'Only brief goal and schedule preferences are supported';end if;end loop;
 if p_actor is null then raise exception 'Secure coaching account required' using errcode='42501';end if;
 if p_customer_id is not null then perform assert_staff(p_actor);c=p_customer_id;else select id into c from customers where profile_id=p_actor;end if;
 if c is null or not exists(select 1 from customers where id=c) then raise exception 'Customer not found';end if;
 select * into p from coaching_packages where id=p_package_id and active for share;if not found then raise exception 'Coaching package unavailable';end if;
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor',p_actor::text,true);
 insert into coaching_enrollments(customer_id,package_id,package_name,mode,billing_model,price,duration_months,duration_days,session_count,training_preferences)
 values(c,p.id,p.name,p.mode,p.billing_model,p.price,p.duration_months,p.duration_days,p.session_count,p_preferences) returning * into e;
 insert into invoices(customer_id,enrollment_id,total_amount) values(c,e.id,p.price) returning * into i;
 perform enqueue_transactional_notification('enrollment_requested',c,null,e.id,i.id,'enrollment_requested:'||e.id::text,jsonb_build_object('package_name',e.package_name));
 return jsonb_build_object('enrollment',to_jsonb(e),'invoice',to_jsonb(i));
end $$;
create function public.activate_enrollment(p_enrollment_id uuid,p_start_date date,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e coaching_enrollments%rowtype;i invoices%rowtype;v_expiry date;
begin
 perform assert_staff(p_actor,true);if p_start_date is null then raise exception 'Owner must confirm a start date';end if;
 select * into i from invoices where enrollment_id=p_enrollment_id for update;select * into e from coaching_enrollments where id=p_enrollment_id for update;
 if not found then raise exception 'Enrollment not found';end if;
 if e.status='active' then if e.start_date=p_start_date then return to_jsonb(e);else raise exception 'Activation dates cannot be silently changed; use renewal';end if;end if;
 if e.status!='requested' then raise exception 'Only requested enrollment can be activated';end if;
 if i.payment_status!='paid' and not e.pay_later_authorized then raise exception 'Full verified payment or owner pay-later exception required';end if;
 v_expiry=case when e.billing_model='monthly' then calendar_expiry(p_start_date,e.duration_months) when e.duration_days is not null then p_start_date+e.duration_days else null end;
 update coaching_enrollments set status='active',start_date=p_start_date,expiry_date=v_expiry,activated_by=p_actor where id=e.id returning * into e;
 perform enqueue_transactional_notification('enrollment_activated',e.customer_id,null,e.id,i.id,'enrollment_activated:'||e.id::text,jsonb_build_object('package_name',e.package_name,'start_date',e.start_date,'expiry_date',e.expiry_date));return to_jsonb(e);
end $$;
create function public.record_coaching_session(p_enrollment_id uuid,p_session_date date,p_actor uuid,p_note text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e coaching_enrollments%rowtype;v_today date;
begin
 perform assert_staff(p_actor);select * into e from coaching_enrollments where id=p_enrollment_id for update;
 select(now() at time zone timezone)::date into v_today from business_settings where id=1;
 if e.id is null or e.status!='active' or e.session_count is null then raise exception 'Active paid session enrollment required';end if;
 if e.sessions_used>=e.session_count then raise exception 'No paid sessions remaining';end if;
 if p_session_date is null or p_session_date<e.start_date or p_session_date>v_today or(e.expiry_date is not null and p_session_date>=e.expiry_date) then raise exception 'Session date falls outside the active enrollment';end if;
 insert into coaching_session_usage(enrollment_id,session_date,note,created_by) values(e.id,p_session_date,p_note,p_actor);
 update coaching_enrollments set sessions_used=sessions_used+1,status=case when sessions_used+1=session_count then 'expired' else status end where id=e.id returning * into e;return to_jsonb(e);
end $$;
create function public.renew_enrollment(p_enrollment_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e coaching_enrollments%rowtype;c uuid;
begin
 select * into e from coaching_enrollments where id=p_enrollment_id;if not found then raise exception 'Enrollment not found';end if;
 if exists(select 1 from staff_roles where user_id=p_actor) then c=e.customer_id;
 elsif not exists(select 1 from customers where id=e.customer_id and profile_id=p_actor) then raise exception 'Not authorized' using errcode='42501';end if;
 return request_enrollment(e.package_id,p_actor,c,e.training_preferences);
end $$;
create function public.update_business_settings(p_changes jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s business_settings%rowtype;k text;
begin
 perform assert_staff(p_actor,true);if jsonb_typeof(p_changes)!='object' then raise exception 'Settings must be an object';end if;
 for k in select jsonb_object_keys(p_changes) loop if k not in ('bank_name','bank_account_number','bank_account_holder','payment_instructions','pickup_location','pickup_instructions','pickup_contact','pickup_hours','contact_email','whatsapp_number','instagram_url','timezone','reservation_minutes','reminders_enabled','reminder_days') then raise exception 'Unsupported setting %',k;end if;end loop;
 select * into s from business_settings where id=1 for update;
 select * into s from jsonb_populate_record(s,p_changes);
 if not exists(select 1 from pg_timezone_names where name=s.timezone) then raise exception 'Invalid business timezone';end if;
 if jsonb_typeof(s.reminder_days)!='array' or exists(select 1 from jsonb_array_elements_text(s.reminder_days) d where d::integer not between 0 and 365) then raise exception 'Reminder schedule must contain day offsets 0 to 365';end if;
 if s.bank_account_number is not null and s.bank_account_number !~ '^[0-9]{10}$' then raise exception 'Nigerian bank account number must contain 10 digits';end if;
 update business_settings set bank_name=s.bank_name,bank_account_number=s.bank_account_number,bank_account_holder=s.bank_account_holder,payment_instructions=s.payment_instructions,pickup_location=s.pickup_location,pickup_instructions=s.pickup_instructions,pickup_contact=s.pickup_contact,pickup_hours=s.pickup_hours,contact_email=s.contact_email,whatsapp_number=s.whatsapp_number,instagram_url=s.instagram_url,timezone=s.timezone,reservation_minutes=s.reservation_minutes,reminders_enabled=s.reminders_enabled,reminder_days=s.reminder_days,updated_at=now() where id=1 returning * into s;return to_jsonb(s);
end $$;
create function public.set_staff_role(p_user_id uuid,p_role text,p_permissions jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s staff_roles%rowtype;k text;
begin
 perform assert_staff(p_actor,true);if p_role not in ('owner','assistant') or jsonb_typeof(p_permissions)!='object' then raise exception 'Invalid role or permissions';end if;
 for k in select jsonb_object_keys(p_permissions) loop if k not in ('manage_packages','manage_delivery_rates') or jsonb_typeof(p_permissions->k)!='boolean' then raise exception 'Only supported operational permission flags may be granted';end if;end loop;
 if not exists(select 1 from profiles where id=p_user_id) then raise exception 'User must first create a secure account';end if;
 lock table staff_roles in share row exclusive mode;perform assert_staff(p_actor,true);
 if p_role!='owner' and exists(select 1 from staff_roles where user_id=p_user_id and role='owner') and(select count(*) from staff_roles where role='owner')<=1 then raise exception 'Cannot remove the last owner';end if;
 -- Revocation uses the separate owner-authorized revoke_staff_access operation.
 insert into staff_roles(user_id,role,permissions) values(p_user_id,p_role,p_permissions) on conflict(user_id) do update set role=excluded.role,permissions=excluded.permissions,updated_at=now() returning * into s;return to_jsonb(s);
end $$;
create function public.link_guest_customer(p_actor uuid,p_guest_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype;old_c uuid;v_email text;c customers%rowtype;
begin
 select email into v_email from auth.users where id=p_actor and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified account email required' using errcode='42501';end if;
 select * into o from orders where guest_token_hash=encode(extensions.digest(p_guest_token,'sha256'),'hex') for update;
 if not found or o.customer_email is null or lower(o.customer_email)!=lower(v_email) then raise exception 'Token and verified contact must match' using errcode='42501';end if;
 select * into c from customers where id=o.customer_id for update;
 if c.profile_id is not null and c.profile_id!=p_actor then raise exception 'Customer belongs to another account' using errcode='42501';end if;
 if c.profile_id=p_actor then return jsonb_build_object('customer_id',c.id);end if;
 perform set_config('app.rpc_write','1',true);perform set_config('app.actor',p_actor::text,true);
 select id into old_c from customers where profile_id=p_actor for update;
 -- Merge only this proved guest identity into the existing secure account customer.
 if old_c is not null then
  update orders set customer_id=old_c where customer_id=c.id;
  update invoices set customer_id=old_c where customer_id=c.id;
  update coaching_enrollments set customer_id=old_c where customer_id=c.id;
  update customer_addresses set customer_id=old_c where customer_id=c.id;
  update notifications set customer_id=old_c where customer_id=c.id;
  return jsonb_build_object('customer_id',old_c);
 end if;
 update customers set profile_id=p_actor,updated_at=now() where id=c.id;return jsonb_build_object('customer_id',c.id);
end $$;
create function public.sync_profile_customer() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin update customers set name=coalesce(nullif(new.full_name,''),name),phone=new.phone,updated_at=now() where profile_id=new.id;return new;end $$;
create trigger profile_customer_sync after update of full_name,phone on profiles for each row execute function sync_profile_customer();
create function public.subscribe_newsletter(p_email text,p_name text default null,p_source text default 'website',p_policy_version text default '1.0') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s newsletter_subscribers%rowtype;t text;v_email text;
begin
 v_email=lower(trim(p_email));if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then raise exception 'Valid email and explicit consent required';end if;
 t=encode(extensions.gen_random_bytes(32),'hex');
 insert into newsletter_subscribers(email,name,unsubscribe_token_hash) values(v_email,p_name,encode(extensions.digest(t,'sha256'),'hex')) on conflict(email) do update set name=coalesce(excluded.name,newsletter_subscribers.name),status='subscribed',unsubscribe_token_hash=excluded.unsubscribe_token_hash,updated_at=now() returning * into s;
 insert into marketing_consents(subscriber_id,action,source,policy_version) values(s.id,'opt_in',p_source,p_policy_version);
 return jsonb_build_object('subscriber_id',s.id,'unsubscribe_token',t);
end $$;
create function public.unsubscribe_subscriber(p_subscriber_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s newsletter_subscribers%rowtype;
begin
 select * into s from newsletter_subscribers where id=p_subscriber_id for update;if not found then return jsonb_build_object('unsubscribed',true);end if;
 if s.status!='unsubscribed' then update newsletter_subscribers set status='unsubscribed',updated_at=now() where id=s.id;insert into marketing_consents(subscriber_id,action,source,policy_version) values(s.id,'opt_out','unsubscribe','1.0');end if;
 return jsonb_build_object('unsubscribed',true);
end $$;
create function public.unsubscribe_newsletter(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s uuid;
begin select id into s from newsletter_subscribers where unsubscribe_token_hash=encode(extensions.digest(p_token,'sha256'),'hex');if s is null then return jsonb_build_object('unsubscribed',true);end if;return unsubscribe_subscriber(s);end $$;
create function public.approve_campaign(p_campaign_id uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c campaigns%rowtype;
begin
 perform assert_staff(p_actor,true);select * into c from campaigns where id=p_campaign_id for update;if not found or c.status!='draft' then raise exception 'Draft campaign required';end if;
 if coalesce(length(trim(c.subject)),0)=0 or coalesce(length(trim(c.body_html)),0)=0 then raise exception 'Campaign content required';end if;
 update campaigns set status='approved',approved_by=p_actor,approved_at=now() where id=c.id returning * into c;return to_jsonb(c);
end $$;
create function public.check_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r rate_limits%rowtype;
begin
 if p_limit<1 or p_window_seconds not between 1 and 86400 then raise exception 'Invalid rate limit';end if;
 insert into rate_limits(key,window_start,hits) values(p_key,now(),0) on conflict do nothing;
 select * into r from rate_limits where key=p_key for update;
 if r.window_start+make_interval(secs=>p_window_seconds)<=now() then update rate_limits set window_start=now(),hits=1 where key=p_key;return true;end if;
 if r.hits>=p_limit then return false;end if;update rate_limits set hits=hits+1 where key=p_key;return true;
end $$;

