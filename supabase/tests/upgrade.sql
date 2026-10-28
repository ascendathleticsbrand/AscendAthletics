-- Harness-only forward upgrade test: run-pglite.mjs inserts migration 14 at the marker.
-- All fixture data and DDL roll back before the normal migration/test sequence.
begin;
insert into public.notifications(id,kind,scheduled_for,dedup_key,status,created_at,locked_at)
values
 ('40000000-0000-0000-0000-000000000001','fixture',now(),'upgrade-failed','failed','2020-01-01','2020-01-02'),
 ('40000000-0000-0000-0000-000000000002','fixture',now(),'upgrade-pending','pending','2020-01-01',null);
insert into public.newsletter_subscribers(id,email,unsubscribe_token_hash)
values('40000000-0000-0000-0000-000000000003','upgrade@test.invalid','upgrade-fixture-hash');
insert into public.campaigns(id,name,subject,body_html,created_at)
values('40000000-0000-0000-0000-000000000004','Upgrade fixture','Fixture only','<p>Fixture only</p>','2020-02-01');
insert into public.campaign_recipients(id,campaign_id,subscriber_id,status,locked_at)
values('40000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000003','failed','2020-02-02');

-- __ASCEND_FORWARD_MIGRATION__

do $$
begin
 if(select first_attempt_at from notifications where dedup_key='upgrade-failed') is distinct from '2020-01-01'::timestamptz then raise exception 'Legacy notification first attempt was not conservatively retained';end if;
 if(select first_attempt_at from notifications where dedup_key='upgrade-pending') is not null then raise exception 'Unattempted pending notification acquired an attempt timestamp';end if;
 if(select first_attempt_at from campaign_recipients where id='40000000-0000-0000-0000-000000000005') is distinct from '2020-02-01'::timestamptz then raise exception 'Legacy campaign retry horizon extended from a later lock';end if;
 if position('outstanding_amount' in pg_get_functiondef('public.verify_payment(uuid,numeric,text,uuid,text)'::regprocedure))=0 then raise exception 'Forward upgrade missed the verified-payment snapshot';end if;
end $$;
select 'PASS: existing thirteen-migration schema upgraded with durable conservative retry history and transactional snapshot RPCs' as upgrade_result;
rollback;
