-- WhatsApp permissions and durable message work are private to the server.
-- Creating these tables never opts a customer in or enables outbound messages.
create table public.whatsapp_contacts (
  customer_id uuid primary key references public.customers(id),
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  reminders_opt_in boolean not null default false,
  updates_opt_in boolean not null default false,
  consent_note text not null check (length(trim(consent_note)) between 1 and 1000),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.whatsapp_settings (
  id integer primary key default 1 check (id=1),
  reminders_enabled boolean not null default false,
  reminder_days integer[] not null default array[7,2,0]
    check (cardinality(reminder_days) between 1 and 10
      and 0 <= all(reminder_days) and 90 >= all(reminder_days)
      and array_position(reminder_days,null) is null),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.whatsapp_settings(id) values(1);
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  enrollment_id uuid references public.coaching_enrollments(id),
  kind text not null check (kind in ('broadcast','renewal')),
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  template_name text not null check (length(template_name) between 1 and 512 and template_name ~ '^[a-z0-9_]+$'),
  language_code text not null,
  parameters jsonb not null check (jsonb_typeof(parameters)='array'),
  status text not null default 'pending'
    check (status in ('pending','sending','accepted','failed','uncertain','skipped')),
  dedup_key text not null unique,
  batch_id uuid,
  expiry_date date,
  reminder_day integer check (reminder_day between 0 and 90),
  locked_at timestamptz,
  provider_message_id text,
  last_error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (kind!='renewal' or (enrollment_id is not null and expiry_date is not null and reminder_day is not null)),
  check (status!='accepted' or provider_message_id is not null)
);
create index whatsapp_messages_pending_idx on public.whatsapp_messages(created_at,id) where status='pending';
create index whatsapp_messages_customer_idx on public.whatsapp_messages(customer_id);
create index whatsapp_messages_enrollment_idx on public.whatsapp_messages(enrollment_id);
create unique index whatsapp_messages_batch_phone_idx on public.whatsapp_messages(batch_id,phone) where batch_id is not null;
create index coaching_whatsapp_expiry_idx on public.coaching_enrollments(expiry_date,id) where status in ('active','expired');
create index whatsapp_messages_batch_idx on public.whatsapp_messages(batch_id);
create index whatsapp_contacts_actor_idx on public.whatsapp_contacts(updated_by);
create index whatsapp_messages_actor_idx on public.whatsapp_messages(created_by);
create table public.whatsapp_consent_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  phone text not null,
  reminders_opt_in boolean not null,
  updates_opt_in boolean not null,
  note text not null,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index whatsapp_consent_customer_idx on public.whatsapp_consent_events(customer_id,created_at);
create index whatsapp_consent_actor_idx on public.whatsapp_consent_events(actor_id);
create trigger immutable_history before update or delete on public.whatsapp_consent_events
  for each row execute function public.append_only();
create trigger audit_mutation after insert or update on public.whatsapp_settings
  for each row execute function public.audit_change();

-- RLS plus explicit privilege denial protects even an authenticated staff browser.
do $$ declare tab text; begin
  foreach tab in array array['whatsapp_contacts','whatsapp_settings','whatsapp_messages','whatsapp_consent_events'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant select,insert,update on public.%I to service_role',tab);
  end loop;
end $$;
-- Consent and its evidence are written in the same transaction.
create function public.save_whatsapp_consent(
  p_customer_id uuid,p_phone text,p_reminders_opt_in boolean,p_updates_opt_in boolean,
  p_note text,p_actor uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_phone text; saved public.whatsapp_contacts%rowtype;
begin
  perform assert_staff(p_actor,true);
  if p_note is null or length(trim(p_note)) not between 1 and 1000 then
    raise exception 'Record how the customer gave or withdrew permission';
  end if;
  select regexp_replace(coalesce(phone,''),'[^0-9]','','g') into current_phone
    from customers where id=p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if current_phone ~ '^0[0-9]{10}$' then current_phone='234'||substring(current_phone from 2); end if;
  if (p_reminders_opt_in or p_updates_opt_in) and (p_phone is distinct from current_phone) then
    raise exception 'Customer phone changed; reload before recording permission';
  end if;
  perform set_config('app.actor',p_actor::text,true);
  insert into whatsapp_contacts(customer_id,phone,reminders_opt_in,updates_opt_in,consent_note,updated_by)
    values(p_customer_id,p_phone,p_reminders_opt_in,p_updates_opt_in,trim(p_note),p_actor)
    on conflict(customer_id) do update set phone=excluded.phone,
      reminders_opt_in=excluded.reminders_opt_in,updates_opt_in=excluded.updates_opt_in,
      consent_note=excluded.consent_note,updated_by=excluded.updated_by,updated_at=now()
    returning * into saved;
  insert into whatsapp_consent_events(customer_id,phone,reminders_opt_in,updates_opt_in,note,actor_id)
    values(p_customer_id,p_phone,p_reminders_opt_in,p_updates_opt_in,trim(p_note),p_actor);
  return to_jsonb(saved);
end $$;
revoke all on function public.save_whatsapp_consent(uuid,text,boolean,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.save_whatsapp_consent(uuid,text,boolean,boolean,text,uuid) to service_role;
notify pgrst,'reload schema';
