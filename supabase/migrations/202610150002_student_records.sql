begin;
-- Only the signed-in student's records, with safe catalogue labels for their copies.
create function public.my_circulation() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 return jsonb_build_object(
 'requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('title',b.title,'accession_number',c.accession_number,'book_id',b.id) order by r.requested_at desc) from public.book_requests r join public.book_copies c on c.id=r.copy_id join public.books b on b.id=c.book_id where r.user_id=auth.uid()),'[]'::jsonb),
 'loans',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('title',b.title,'accession_number',c.accession_number,'book_id',b.id) order by l.checkout_at desc) from public.loans l join public.book_copies c on c.id=l.copy_id join public.books b on b.id=c.book_id where l.user_id=auth.uid()),'[]'::jsonb));
end; $$;
revoke all on function public.my_circulation() from public,anon;
grant execute on function public.my_circulation() to authenticated;
commit;
