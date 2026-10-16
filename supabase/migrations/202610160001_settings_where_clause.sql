-- Keep the singleton update compatible with Supabase's safe-update protection.
-- Preserve administrator authorization, mutation locking, constraints and audits.
begin;

create or replace function public.update_settings(
  p_max_active_loans integer,
  p_loan_days integer,
  p_reservation_hours integer,
  p_max_active_requests integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_mutation();
  perform private.require_staff(true);

  update public.system_settings
  set max_active_loans = p_max_active_loans,
      loan_days = p_loan_days,
      reservation_hours = p_reservation_hours,
      max_active_requests = p_max_active_requests
  where id = true;
end;
$$;

revoke all on function public.update_settings(integer, integer, integer, integer)
  from public, anon;
grant execute on function public.update_settings(integer, integer, integer, integer)
  to authenticated;

commit;
