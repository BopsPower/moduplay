-- 되돌리기: 예전 승인 함수·읽기 규칙으로 (함께 배우는 코치로 이미 연결된 줄은 student_teachers에 남음)
drop function if exists public.approve_join_request(uuid, uuid, uuid[]);
create or replace function public.approve_join_request(req uuid, coach uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.join_requests; me uuid; sid uuid; c uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select id into me from public.teachers where user_id = auth.uid() limit 1;
  select * into r from public.join_requests where id = req for update;
  if r.id is null or r.status = 'approved' then raise exception 'invalid request'; end if;
  if r.kind = 'coach' then raise exception 'coach request'; end if;
  if exists (select 1 from public.teachers where user_id = r.user_id or (r.email is not null and lower(email) = lower(r.email))) then raise exception 'staff account'; end if;
  c := coalesce(coach, r.teacher_id);
  if c is null or not exists (select 1 from public.teachers where id = c and active) then raise exception 'coach required'; end if;
  if exists (select 1 from public.students where user_id = r.user_id) then raise exception 'already linked'; end if;
  select id into sid from public.students where user_id is null and email is not null and lower(email) = lower(r.email) limit 1;
  if sid is not null then
    update public.students set user_id = r.user_id, linked_at = now(), active = true, teacher_id = c,
      campus = coalesce(r.campus, campus), class_name = coalesce(class_name, r.major) where id = sid;
  else
    insert into public.students (name, class_name, email, user_id, teacher_id, campus, linked_at, active)
    values (r.name, r.major, r.email, r.user_id, c, r.campus, now(), true) returning id into sid;
  end if;
  update public.join_requests set status = 'approved', decided_at = now(), decided_by = me, student_id = sid where id = req;
  return sid;
end $$;
drop policy if exists "join_requests: read" on public.join_requests;
create policy "join_requests: read" on public.join_requests for select using (
  (user_id = auth.uid()) or is_admin() or (is_teacher() and kind = 'student' and (teacher_id is null or teacher_id = my_teacher_id())));
alter table public.join_requests drop column if exists extra_teacher_ids;
