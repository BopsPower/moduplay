-- 정식 학생 권한은 관리자만: 학생 승인·등록·그만둠·다시 활성은 관리자, 코치는 자기 학생 보기·전공 수정만
create or replace function public.approve_join_request(req uuid, coach uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
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

create or replace function public.reject_join_request(req uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.join_requests set status = 'rejected', decided_at = now(),
    decided_by = (select id from public.teachers where user_id = auth.uid() limit 1)
  where id = req and status = 'pending';
end $$;

drop policy if exists "students: write" on public.students;
drop policy if exists "students: insert" on public.students;
drop policy if exists "students: update" on public.students;
drop policy if exists "students: delete" on public.students;
create policy "students: insert" on public.students for insert with check (public.is_admin());
create policy "students: delete" on public.students for delete using (public.is_admin());
create policy "students: update" on public.students for update
  using (public.is_admin() or (public.is_teacher() and teacher_id = public.my_teacher_id()))
  with check (public.is_admin() or (public.is_teacher() and teacher_id = public.my_teacher_id()));

-- 코치가 앱에서 바꿀 수 있는 건 전공 정도: 활성·계정 연결·담당·초대 링크는 관리자만
create or replace function public.students_coach_limits() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.active is distinct from old.active or new.user_id is distinct from old.user_id
       or new.teacher_id is distinct from old.teacher_id or new.invite_token is distinct from old.invite_token
       or new.email is distinct from old.email then
      raise exception 'admin only';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists students_coach_limits on public.students;
create trigger students_coach_limits before update on public.students
  for each row execute function public.students_coach_limits();
