-- Run in Supabase SQL Editor as the database owner, after registering and verifying
-- the future administrator through the app. Replace the UUID below with Auth > Users ID.
-- Never bootstrap by trusting an email supplied in browser code.
begin;
select pg_advisory_xact_lock(831640215::bigint);
do $$
declare target uuid := 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';
begin
 if exists(select 1 from public.staff_roles where role='admin') then raise exception 'An administrator already exists; use Staff access in the application'; end if;
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=target and u.email_confirmed_at is not null) then raise exception 'Register this account and verify its email first'; end if;
 insert into public.staff_roles(user_id,role,granted_by) values(target,'admin',target);
 update public.profiles set account_status='approved' where id=target;
end; $$;
commit;
