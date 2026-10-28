-- Disposable fixtures only. No provider is contacted, and the transaction rolls back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); assistant_id uuid:=gen_random_uuid(); customer uuid; failed boolean; amount integer; tab text; browser_role text;
begin
  if (select reminders_enabled from whatsapp_settings where id=1) then raise exception 'WhatsApp default must be disabled'; end if;
  insert into auth.users(id,email,email_confirmed_at) values(owner_id,'wa-owner@test.invalid',now()),(assistant_id,'wa-assistant@test.invalid',now());
  insert into staff_roles(user_id,role) values(owner_id,'owner'),(assistant_id,'assistant');
  insert into customers(name,phone) values('WhatsApp fixture','09130607719') returning id into customer;
  perform save_whatsapp_consent(customer,'2349130607719',true,false,'Fixture explicit reminder agreement',owner_id);
  if not (select reminders_opt_in and not updates_opt_in from whatsapp_contacts where customer_id=customer) then raise exception 'Separate permissions lost'; end if;
  select count(*) into amount from whatsapp_consent_events where customer_id=customer;
  if amount!=1 then raise exception 'Consent evidence missing'; end if;
  failed=false;begin perform save_whatsapp_consent(customer,'2349130607719',true,true,'Assistant cannot grant',assistant_id);exception when others then failed=true;end;
  if not failed then raise exception 'Assistant granted WhatsApp permission'; end if;
  update customers set phone='09130607718' where id=customer;
  failed=false;begin perform save_whatsapp_consent(customer,'2349130607719',true,true,'Stale phone agreement',owner_id);exception when others then failed=true;end;
  if not failed then raise exception 'Stale phone agreement accepted'; end if;
  select count(*) into amount from whatsapp_consent_events where customer_id=customer;
  if amount!=1 then raise exception 'Failed permission write created history'; end if;
  perform save_whatsapp_consent(customer,'2349130607719',false,false,'Customer withdrew permission',owner_id);
  failed=false;begin update whatsapp_consent_events set note='Rewritten' where customer_id=customer;exception when others then failed=true;end;
  if not failed then raise exception 'Consent evidence could be rewritten'; end if;
  insert into whatsapp_messages(customer_id,kind,phone,template_name,language_code,parameters,dedup_key)
    values(customer,'broadcast','2349130607719','fixture_update','en','["Fixture","Hello"]','fixture-unique');
  failed=false;begin insert into whatsapp_messages(customer_id,kind,phone,template_name,language_code,parameters,dedup_key)
    values(customer,'broadcast','2349130607719','fixture_update','en','[]','fixture-unique');exception when unique_violation then failed=true;end;
  if not failed then raise exception 'Duplicate work accepted'; end if;
  failed=false;begin update whatsapp_settings set reminder_days=array[-1] where id=1;exception when check_violation then failed=true;end;
  if not failed then raise exception 'Invalid reminder day accepted'; end if;
  foreach browser_role in array array['anon','authenticated'] loop
    execute 'set local role '||browser_role;
    foreach tab in array array['whatsapp_contacts','whatsapp_settings','whatsapp_messages','whatsapp_consent_events'] loop
      failed=false;begin execute format('select count(*) from public.%I',tab);exception when insufficient_privilege then failed=true;end;
      if not failed then raise exception 'Browser role could access %',tab;end if;
    end loop;
    failed=false;begin perform save_whatsapp_consent(customer,'2349130607719',true,true,'Forged owner actor',owner_id);exception when insufficient_privilege then failed=true;end;
    if not failed then raise exception 'Browser invoked privileged consent function';end if;
    execute 'reset role';
  end loop;
  execute 'set local role service_role';
  select count(*) into amount from whatsapp_messages where dedup_key='fixture-unique';
  if amount!=1 then raise exception 'Service worker cannot read queue';end if;
  execute 'reset role';
end $$;
select 'PASS: WhatsApp disabled defaults, separate atomic permissions, phone checks, immutable consent, duplicate prevention and browser denial' as whatsapp_result;
rollback;
