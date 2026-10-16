-- Apply once to a fresh Supabase project. No production seed records.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.books (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 1 and 500),
 authors text not null check (length(btrim(authors)) between 1 and 500),
 isbn text not null default '' check (length(isbn)<=32), publisher text not null default '' check (length(publisher)<=300),
 publication_year integer check (publication_year between 1000 and 2200), edition text not null default '' check(length(edition)<=100),
 subject text not null default '' check(length(subject)<=200), description text not null default '' check(length(description)<=10000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.book_copies (
 id uuid primary key default gen_random_uuid(), book_id uuid not null references public.books(id),
 accession_number text not null unique check (length(btrim(accession_number)) >= 1 and length(accession_number)<=100),
 shelf_location text not null default '' check(length(shelf_location)<=200),
 physical_condition text not null default 'good' check (physical_condition in ('good','worn','damaged')),
 inventory_status text not null default 'active' check (inventory_status in ('active','withdrawn','missing','lost')),
 acquired_at date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id), full_name text not null check(length(btrim(full_name)) between 2 and 150),
 student_id text not null check(length(btrim(student_id)) between 1 and 100),
 academic_programme text not null check(length(btrim(academic_programme)) between 1 and 150),
 department text not null check(length(btrim(department)) between 1 and 150), email text not null,
 account_status text not null default 'pending' check(account_status in ('pending','approved','rejected','suspended')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index profiles_status_idx on public.profiles(account_status,created_at);
create index profiles_student_id_idx on public.profiles(student_id);
create table public.staff_roles (
 user_id uuid primary key references public.profiles(id), role text not null check(role in ('librarian','admin')),
 granted_by uuid references public.profiles(id), granted_at timestamptz not null default now()
);
create table public.system_settings (
 id boolean primary key default true check(id), max_active_loans integer not null default 3 check(max_active_loans between 1 and 50),
 loan_days integer not null default 14 check(loan_days between 1 and 365),
 reservation_hours integer not null default 48 check(reservation_hours between 1 and 720),
 max_active_requests integer not null default 5 check(max_active_requests between 1 and 50), updated_at timestamptz not null default now()
);
insert into public.system_settings(id) values(true);
create table public.book_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), copy_id uuid not null references public.book_copies(id),
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled','expired','fulfilled')),
 requested_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references public.profiles(id), expires_at timestamptz,
 review_note text not null default '' check(length(review_note)<=500),
 unique(id,copy_id,user_id), check(status <> 'approved' or (expires_at is not null and reviewed_by is not null))
);
create unique index requests_one_active_per_student_copy on public.book_requests(user_id,copy_id) where status in ('pending','approved');
create unique index requests_one_reservation_per_copy on public.book_requests(copy_id) where status='approved';
create index requests_owner_idx on public.book_requests(user_id,requested_at desc);
create index requests_queue_idx on public.book_requests(status,requested_at);
create table public.loans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), copy_id uuid not null references public.book_copies(id),
 request_id uuid unique, checkout_at timestamptz not null default now(), due_at timestamptz not null,
 returned_at timestamptz, checked_out_by uuid not null references public.profiles(id), checked_in_by uuid references public.profiles(id),
 foreign key(request_id,copy_id,user_id) references public.book_requests(id,copy_id,user_id),
 check(due_at>checkout_at), check(returned_at is null or returned_at>=checkout_at),
 check((returned_at is null) = (checked_in_by is null))
);
create unique index loans_one_active_per_copy on public.loans(copy_id) where returned_at is null;
create index loans_owner_idx on public.loans(user_id,checkout_at desc);
create index loans_overdue_idx on public.loans(due_at) where returned_at is null;
create index copies_book_idx on public.book_copies(book_id);
create index books_title_search_idx on public.books using gin(to_tsvector('simple',title || ' ' || authors || ' ' || subject));
create table public.audit_events (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), operation text not null,
 entity_type text not null, entity_id text not null, event_time timestamptz not null default now(), details jsonb not null default '{}'
);
create index audit_time_idx on public.audit_events(event_time desc);

create function private.has_role(required_role text default 'staff') returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles where user_id=auth.uid() and (role=required_role or (required_role='staff' and role in ('admin','librarian'))));
$$;
create function private.lock_mutation() returns void language sql set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(831640215::bigint);
$$;
create function private.require_staff(admin_only boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.has_role(case when admin_only then 'admin' else 'staff' end) then raise exception 'Staff permission required' using errcode='42501'; end if;
end; $$;
create function private.require_approved(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=target and p.account_status='approved' and u.email_confirmed_at is not null) then
 raise exception 'An approved membership and verified email are required' using errcode='42501'; end if;
end; $$;
create function private.expire_reservations() returns void language sql security definer set search_path='' as $$
 update public.book_requests set status='expired' where status='approved' and expires_at<=now();
$$;
create function private.copy_available(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.book_copies c where c.id=target and c.inventory_status='active' and c.physical_condition<>'damaged'
 and not exists(select 1 from public.loans l where l.copy_id=c.id and l.returned_at is null)
 and not exists(select 1 from public.book_requests r where r.copy_id=c.id and r.status='approved' and r.expires_at>now()));
$$;
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb; entity text;
begin
 payload:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 entity:=coalesce(payload->>'id',payload->>'user_id');
 insert into public.audit_events(actor_id,operation,entity_type,entity_id,details)
 values(auth.uid(),TG_OP,TG_TABLE_NAME,entity,jsonb_build_object('before',case when TG_OP<>'INSERT' then to_jsonb(old) end,'after',case when TG_OP<>'DELETE' then to_jsonb(new) end));
 return case when TG_OP='DELETE' then old else new end;
end; $$;
create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at:=now(); return new; end; $$;
do $$ declare t text; begin
 foreach t in array array['books','book_copies','profiles','system_settings'] loop
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',t);
 end loop;
 foreach t in array array['books','book_copies','profiles','staff_roles','book_requests','loans','system_settings'] loop
 execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
 end loop;
end; $$;
create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,student_id,academic_programme,department,email)
 values(new.id,btrim(new.raw_user_meta_data->>'full_name'),btrim(new.raw_user_meta_data->>'student_id'),btrim(new.raw_user_meta_data->>'academic_programme'),btrim(new.raw_user_meta_data->>'department'),new.email);
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_user();

-- All writes are through guarded RPCs; no browser role receives table DML privileges.
do $$ declare t text; begin
 foreach t in array array['books','book_copies','profiles','staff_roles','book_requests','loans','audit_events','system_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end; $$;
create policy staff_books on public.books for select to authenticated using(private.has_role());
create policy staff_copies on public.book_copies for select to authenticated using(private.has_role());
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid() or private.has_role());
create policy own_role on public.staff_roles for select to authenticated using(user_id=auth.uid() or private.has_role('admin'));
create policy own_requests on public.book_requests for select to authenticated using(user_id=auth.uid() or private.has_role());
create policy own_loans on public.loans for select to authenticated using(user_id=auth.uid() or private.has_role());
create policy admin_audit on public.audit_events for select to authenticated using(private.has_role('admin'));
create policy read_settings on public.system_settings for select to authenticated using(true);

-- Public RPC returns only the enumerated bibliographic/copy fields. Never join profiles here.
create function public.catalogue(p_query text default '',p_author text default '',p_subject text default '',p_available boolean default false,p_book_id uuid default null,p_limit integer default 24,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
 with inventory as (
 select b.id as book_id,b.title,b.authors,b.isbn,b.publisher,b.publication_year,b.edition,b.subject,b.description,
 c.id as copy_id,c.accession_number,c.shelf_location,private.copy_available(c.id) as available
 from public.books b join public.book_copies c on c.book_id=b.id
 where (p_book_id is null or b.id=p_book_id) and
 (coalesce(p_query,'')='' or position(lower(p_query) in lower(b.title || ' ' || b.authors || ' ' || b.subject || ' ' || b.isbn || ' ' || c.accession_number))>0)
 and (coalesce(p_author,'')='' or position(lower(p_author) in lower(b.authors))>0)
 and (coalesce(p_subject,'')='' or position(lower(p_subject) in lower(b.subject))>0)
 ), filtered as (select * from inventory where not coalesce(p_available,false) or available),
 page as (select * from filtered order by title,accession_number,copy_id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0))
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;
create function public.update_my_profile(p_full_name text,p_student_id text,p_academic_programme text,p_department text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation();
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 -- Changing identity requires staff to approve it again; staff do not self-approve membership.
 update public.profiles set full_name=btrim(p_full_name),student_id=btrim(p_student_id),academic_programme=btrim(p_academic_programme),department=btrim(p_department),
 account_status=case when (full_name,student_id,academic_programme,department) is distinct from (btrim(p_full_name),btrim(p_student_id),btrim(p_academic_programme),btrim(p_department)) then 'pending' else account_status end where id=auth.uid();
end; $$;
create function public.review_member(p_user_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation(); perform private.require_staff();
 if p_user_id=auth.uid() then raise exception 'You cannot review your own membership'; end if;
 if p_status not in ('approved','rejected','suspended') then raise exception 'Invalid membership decision'; end if;
 update public.profiles set account_status=p_status where id=p_user_id;
 if not found then raise exception 'Member not found'; end if;
 if p_status<>'approved' then update public.book_requests set status='cancelled',reviewed_at=now(),reviewed_by=auth.uid(),review_note='Membership no longer approved' where user_id=p_user_id and status in ('pending','approved'); end if;
end; $$;
create function public.submit_request(p_copy_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; policy public.system_settings;
begin
 perform private.lock_mutation(); perform private.require_approved(auth.uid()); perform private.expire_reservations();
 select * into policy from public.system_settings;
 if not private.copy_available(p_copy_id) then raise exception 'This copy is no longer available'; end if;
 if (select count(*) from public.book_requests where user_id=auth.uid() and status in ('pending','approved'))>=policy.max_active_requests then raise exception 'Request limit reached'; end if;
 if (select count(*) from public.loans where user_id=auth.uid() and returned_at is null)>=policy.max_active_loans then raise exception 'Borrowing limit reached'; end if;
 insert into public.book_requests(user_id,copy_id) values(auth.uid(),p_copy_id) returning id into result; return result;
end; $$;
create function public.cancel_request(p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation(); perform private.expire_reservations();
 update public.book_requests set status='cancelled' where id=p_request_id and user_id=auth.uid() and status in ('pending','approved');
 if not found then raise exception 'Request cannot be cancelled' using errcode='42501'; end if;
end; $$;
create function public.review_request(p_request_id uuid,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare req public.book_requests; policy public.system_settings;
begin
 perform private.lock_mutation(); perform private.require_staff(); perform private.expire_reservations();
 select * into req from public.book_requests where id=p_request_id for update;
 if not found or req.status<>'pending' then raise exception 'Request is not pending'; end if;
 if p_approve is null then raise exception 'A decision is required'; end if;
 if p_approve then
 perform private.require_approved(req.user_id);
 if not private.copy_available(req.copy_id) then raise exception 'Copy is unavailable or already reserved'; end if;
 select * into policy from public.system_settings;
 if (select count(*) from public.loans where user_id=req.user_id and returned_at is null)+(select count(*) from public.book_requests where user_id=req.user_id and status='approved')>=policy.max_active_loans then raise exception 'Borrowing limit reached including reservations'; end if;
 end if;
 update public.book_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid(),review_note=coalesce(p_note,''),
 expires_at=case when p_approve then now()+make_interval(hours=>policy.reservation_hours) else null end where id=p_request_id;
end; $$;
create function public.checkout(p_copy_id uuid,p_user_id uuid,p_request_id uuid default null,p_due_at timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.book_copies; req public.book_requests; policy public.system_settings; result uuid; due timestamptz;
begin
 perform private.lock_mutation(); perform private.require_staff(); perform private.require_approved(p_user_id); perform private.expire_reservations();
 select * into c from public.book_copies where id=p_copy_id for update;
 if not found or c.inventory_status<>'active' or c.physical_condition='damaged' then raise exception 'Copy cannot be circulated'; end if;
 if exists(select 1 from public.loans where copy_id=p_copy_id and returned_at is null) then raise exception 'Copy is already checked out'; end if;
 if p_request_id is not null then
 select * into req from public.book_requests where id=p_request_id;
 if not found or req.user_id<>p_user_id or req.copy_id<>p_copy_id or req.status<>'approved' or req.expires_at<=now() then raise exception 'Valid approved reservation required'; end if;
 elsif not private.copy_available(p_copy_id) then raise exception 'Copy is reserved for collection'; end if;
 select * into policy from public.system_settings;
 if (select count(*) from public.loans where user_id=p_user_id and returned_at is null)+(select count(*) from public.book_requests where user_id=p_user_id and status='approved' and id is distinct from p_request_id)>=policy.max_active_loans then raise exception 'Borrowing limit reached including reservations'; end if;
 due:=coalesce(p_due_at,now()+make_interval(days=>policy.loan_days));
 if due<=now() or due>now()+interval '365 days' then raise exception 'Due date must be in the next 365 days'; end if;
 insert into public.loans(user_id,copy_id,request_id,due_at,checked_out_by) values(p_user_id,p_copy_id,p_request_id,due,auth.uid()) returning id into result;
 update public.book_requests set status=case when id=p_request_id then 'fulfilled' else 'rejected' end,reviewed_at=now(),reviewed_by=auth.uid(),review_note=case when id=p_request_id then review_note else 'Copy issued to another borrower' end where copy_id=p_copy_id and status in ('pending','approved');
 return result;
end; $$;
create function public.checkin(p_loan_id uuid,p_condition text default 'good') returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform private.lock_mutation(); perform private.require_staff();
 if p_condition not in ('good','worn','damaged') then raise exception 'Invalid physical condition'; end if;
 update public.loans set returned_at=now(),checked_in_by=auth.uid() where id=p_loan_id and returned_at is null returning copy_id into target;
 if not found then raise exception 'Active loan not found'; end if;
 update public.book_copies set physical_condition=p_condition where id=target;
end; $$;
create function public.change_due_date(p_loan_id uuid,p_due_at timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation(); perform private.require_staff();
 if p_due_at is null or p_due_at<=now() or p_due_at>now()+interval '365 days' then raise exception 'Due date must be in the next 365 days'; end if;
 update public.loans set due_at=p_due_at where id=p_loan_id and returned_at is null;
 if not found then raise exception 'Active loan not found'; end if;
end; $$;

create function public.set_staff_role(p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation(); perform private.require_staff(true);
 if p_role is not null and p_role not in ('admin','librarian') then raise exception 'Invalid staff role'; end if;
 if exists(select 1 from public.staff_roles where user_id=p_user_id and role='admin') and p_role is distinct from 'admin' and (select count(*) from public.staff_roles where role='admin')<=1 then raise exception 'Cannot remove the last administrator'; end if;
 if p_role is null then delete from public.staff_roles where user_id=p_user_id;
 else insert into public.staff_roles(user_id,role,granted_by) values(p_user_id,p_role,auth.uid()) on conflict(user_id) do update set role=excluded.role,granted_by=excluded.granted_by,granted_at=now(); end if;
end; $$;
create function public.update_settings(p_max_active_loans integer,p_loan_days integer,p_reservation_hours integer,p_max_active_requests integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mutation(); perform private.require_staff(true);
 update public.system_settings set max_active_loans=p_max_active_loans,loan_days=p_loan_days,reservation_hours=p_reservation_hours,max_active_requests=p_max_active_requests;
end; $$;

-- Explicit book IDs attach additional copies to an existing title; no unsafe title/ISBN guessing.
create function public.save_book(p_book jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.lock_mutation(); perform private.require_staff();
 if p_id is null then
 insert into public.books(title,authors,isbn,publisher,publication_year,edition,subject,description)
 values(btrim(p_book->>'title'),btrim(p_book->>'authors'),coalesce(p_book->>'isbn',''),coalesce(p_book->>'publisher',''),nullif(p_book->>'publication_year','')::integer,coalesce(p_book->>'edition',''),coalesce(p_book->>'subject',''),coalesce(p_book->>'description','')) returning id into result;
 else
 update public.books set title=btrim(p_book->>'title'),authors=btrim(p_book->>'authors'),isbn=coalesce(p_book->>'isbn',''),publisher=coalesce(p_book->>'publisher',''),publication_year=nullif(p_book->>'publication_year','')::integer,edition=coalesce(p_book->>'edition',''),subject=coalesce(p_book->>'subject',''),description=coalesce(p_book->>'description','') where id=p_id returning id into result;
 if not found then raise exception 'Book not found'; end if;
 end if;
 return result;
end; $$;
create function public.save_copy(p_copy jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.lock_mutation(); perform private.require_staff();
 if p_id is null then
 insert into public.book_copies(book_id,accession_number,shelf_location,physical_condition,inventory_status,acquired_at)
 values((p_copy->>'book_id')::uuid,p_copy->>'accession_number',coalesce(p_copy->>'shelf_location',''),coalesce(p_copy->>'physical_condition','good'),coalesce(p_copy->>'inventory_status','active'),nullif(p_copy->>'acquired_at','')::date) returning id into result;
 else
 if exists(select 1 from public.book_copies where id=p_id and book_id<>(p_copy->>'book_id')::uuid) then raise exception 'A copy cannot be moved to another title'; end if;
 if exists(select 1 from public.book_copies where id=p_id and accession_number is distinct from p_copy->>'accession_number') then raise exception 'Accession numbers are immutable; withdraw incorrect records and add the correct copy'; end if;
 if (coalesce(p_copy->>'inventory_status','active')<>'active' or coalesce(p_copy->>'physical_condition','good')='damaged') and
 (exists(select 1 from public.loans where copy_id=p_id and returned_at is null) or exists(select 1 from public.book_requests where copy_id=p_id and status='approved' and expires_at>now())) then raise exception 'Return the active loan or cancel the reservation first'; end if;
 update public.book_copies set shelf_location=coalesce(p_copy->>'shelf_location',''),physical_condition=coalesce(p_copy->>'physical_condition','good'),inventory_status=coalesce(p_copy->>'inventory_status','active'),acquired_at=nullif(p_copy->>'acquired_at','')::date where id=p_id returning id into result;
 if not found then raise exception 'Copy not found'; end if;
 end if; return result;
end; $$;

-- Atomic batch import. Repeated identical accession rows are skipped, changed ones rejected.
create function public.import_catalogue(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare row jsonb; existing public.book_copies; b public.books; target uuid; added integer:=0; skipped integer:=0; n integer:=0; seen text[]:='{}';
begin
 perform private.lock_mutation(); perform private.require_staff();
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Import 1 to 500 rows per batch'; end if;
 for row in select value from jsonb_array_elements(p_rows) loop
 n:=n+1;
 if coalesce(length(btrim(row->>'accession_number')),0)=0 or coalesce(length(btrim(row->>'title')),0)=0 or coalesce(length(btrim(row->>'authors')),0)=0 then raise exception 'Row %: accession, title and authors required',n; end if;
 if row->>'accession_number'=any(seen) then raise exception 'Row %: duplicate accession in file',n; end if;
 seen:=array_append(seen,row->>'accession_number');
 select * into existing from public.book_copies where accession_number=row->>'accession_number';
 if found then
 select * into b from public.books where id=existing.book_id;
 if b.title is distinct from btrim(row->>'title') or b.authors is distinct from btrim(row->>'authors') or b.isbn is distinct from coalesce(row->>'isbn','') or b.publisher is distinct from coalesce(row->>'publisher','') or b.publication_year is distinct from nullif(row->>'publication_year','')::integer or b.edition is distinct from coalesce(row->>'edition','') or b.subject is distinct from coalesce(row->>'subject','') or b.description is distinct from coalesce(row->>'description','') or existing.shelf_location is distinct from coalesce(row->>'shelf_location','') or existing.physical_condition is distinct from coalesce(row->>'physical_condition','good') or existing.inventory_status is distinct from coalesce(row->>'inventory_status','active') or existing.acquired_at is distinct from nullif(row->>'acquired_at','')::date or (nullif(row->>'book_id','') is not null and existing.book_id<>(row->>'book_id')::uuid) then raise exception 'Row %: accession exists with different data; edit it explicitly',n; end if;
 skipped:=skipped+1; continue;
 end if;
 if nullif(row->>'book_id','') is not null then
 target:=(row->>'book_id')::uuid;
 select * into b from public.books where id=target;
 if not found or b.title is distinct from btrim(row->>'title') or b.authors is distinct from btrim(row->>'authors') or b.isbn is distinct from coalesce(row->>'isbn','') or b.publisher is distinct from coalesce(row->>'publisher','') or b.publication_year is distinct from nullif(row->>'publication_year','')::integer or b.edition is distinct from coalesce(row->>'edition','') or b.subject is distinct from coalesce(row->>'subject','') or b.description is distinct from coalesce(row->>'description','') then raise exception 'Row %: book_id metadata does not match existing title',n; end if;
 else
 -- Group identical bibliographic records in this batch and previous imports, without treating ISBN as unique.
 select id into target from public.books where title=btrim(row->>'title') and authors=btrim(row->>'authors') and isbn=coalesce(row->>'isbn','') and publisher=coalesce(row->>'publisher','') and publication_year is not distinct from nullif(row->>'publication_year','')::integer and edition=coalesce(row->>'edition','') and subject=coalesce(row->>'subject','') and description=coalesce(row->>'description','') order by created_at,id limit 1;
 if target is null then target:=public.save_book(row); end if;
 end if;
 perform public.save_copy(row || jsonb_build_object('book_id',target)); added:=added+1;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end; $$;

-- Remove Postgres default PUBLIC execute, including helpers and trigger entry points.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.has_role(text) to authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.catalogue(text,text,text,boolean,uuid,integer,integer) to anon,authenticated;
grant execute on function public.update_my_profile(text,text,text,text),public.review_member(uuid,text),public.submit_request(uuid),public.cancel_request(uuid),public.review_request(uuid,boolean,text),public.checkout(uuid,uuid,uuid,timestamptz),public.checkin(uuid,text),public.change_due_date(uuid,timestamptz),public.set_staff_role(uuid,text),public.update_settings(integer,integer,integer,integer),public.save_book(jsonb,uuid),public.save_copy(jsonb,uuid),public.import_catalogue(jsonb) to authenticated;
-- Future functions must be granted deliberately.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
commit;
