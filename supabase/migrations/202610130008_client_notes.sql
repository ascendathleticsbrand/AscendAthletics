create table public.coaching_enrollment_notes(id uuid primary key default gen_random_uuid(),enrollment_id uuid not null references coaching_enrollments(id),body text not null check(length(trim(body))>0),created_by uuid not null references profiles(id),created_at timestamptz not null default now());
alter table coaching_enrollment_notes enable row level security;
create policy coaching_notes_staff_read on coaching_enrollment_notes for select to authenticated using(is_staff());
create policy coaching_notes_staff_insert on coaching_enrollment_notes for insert to authenticated with check(is_staff() and created_by=auth.uid());
create trigger immutable_history before update or delete on coaching_enrollment_notes for each row execute function append_only();
create trigger audit_mutation after insert on coaching_enrollment_notes for each row execute function audit_change();
grant select,insert on coaching_enrollment_notes to authenticated;grant all on coaching_enrollment_notes to service_role;
