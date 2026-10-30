-- ① 코치 캠퍼스(복수) + 코치 가입 신청 + 승인 함수
alter table public.teachers add column if not exists campuses text[] not null default '{}';
alter table public.join_requests add column if not exists kind text not null default 'student';
alter table public.join_requests drop constraint if exists join_requests_kind_chk;
alter table public.join_requests add constraint join_requests_kind_chk check (kind in ('student','coach'));

create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.teachers where user_id = auth.uid() and active limit 1;
$$;

create or replace function public.approve_coach_request(req uuid, make_admin boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.join_requests; me uuid; tid uuid; cs text[];
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select id into me from public.teachers where user_id = auth.uid() limit 1;
  select * into r from public.join_requests where id = req for update;
  if r.id is null or r.status = 'approved' or r.kind <> 'coach' then raise exception 'invalid request'; end if;
  cs := coalesce(string_to_array(nullif(r.campus, ''), ','), '{}');
  update public.join_requests set status = 'approved', decided_at = now(), decided_by = me where id = req;
  select id into tid from public.teachers where user_id = r.user_id or (r.email is not null and lower(email) = lower(r.email)) limit 1;
  if tid is null then
    insert into public.teachers (name, email, role, active, user_id, linked_at, campuses)
    values (r.name, lower(r.email), case when make_admin then 'admin' else 'teacher' end, true, r.user_id, now(), cs)
    returning id into tid;
  else
    update public.teachers set active = true, role = case when make_admin then 'admin' else role end,
      user_id = coalesce(user_id, r.user_id), linked_at = coalesce(linked_at, now()), campuses = cs
    where id = tid;
  end if;
  return tid;
end $$;

create or replace function public.reject_join_request(req uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'not allowed'; end if;
  if exists (select 1 from public.join_requests where id = req and kind = 'coach') and not public.is_admin() then raise exception 'not allowed'; end if;
  update public.join_requests set status = 'rejected', decided_at = now(),
    decided_by = (select id from public.teachers where user_id = auth.uid() limit 1)
  where id = req and status = 'pending';
end $$;
