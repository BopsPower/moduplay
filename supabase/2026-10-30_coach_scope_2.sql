-- ② 코치는 자기 담당 학생만 (관리자는 전체)
drop policy if exists "students: self or teacher read" on public.students;
drop policy if exists "students: teacher write" on public.students;
create policy "students: read" on public.students for select
  using (user_id = auth.uid() or public.is_admin() or (public.is_teacher() and teacher_id = public.my_teacher_id()));
create policy "students: write" on public.students for all
  using (public.is_admin() or (public.is_teacher() and teacher_id = public.my_teacher_id()))
  with check (public.is_admin() or (public.is_teacher() and teacher_id = public.my_teacher_id()));

drop policy if exists "assignments: own or teacher read" on public.assignments;
drop policy if exists "assignments: teacher write" on public.assignments;
create policy "assignments: read" on public.assignments for select
  using (student_id = public.my_student_id() or public.is_admin()
    or (public.is_teacher() and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = public.my_teacher_id())));
create policy "assignments: write" on public.assignments for all
  using (public.is_admin() or (public.is_teacher() and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = public.my_teacher_id())))
  with check (public.is_admin() or (public.is_teacher() and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = public.my_teacher_id())));

drop policy if exists "practice_logs: own read" on public.practice_logs;
create policy "practice_logs: read" on public.practice_logs for select
  using (student_id = public.my_student_id() or public.is_admin()
    or (public.is_teacher() and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = public.my_teacher_id())));

drop policy if exists "join_requests: own read" on public.join_requests;
create policy "join_requests: read" on public.join_requests for select
  using (user_id = auth.uid() or public.is_admin()
    or (public.is_teacher() and kind = 'student' and (teacher_id is null or teacher_id = public.my_teacher_id())));

create or replace function public.approve_join_request(req uuid, coach uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.join_requests; me uuid; sid uuid; c uuid;
begin
  if not public.is_teacher() then raise exception 'not allowed'; end if;
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
