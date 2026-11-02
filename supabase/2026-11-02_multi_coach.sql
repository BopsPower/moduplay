-- 학생 담당 코치 여러 명
-- 이미 있는 student_teachers(학생↔코치 여러 명) 표를 그대로 쓰고, 가입 신청에서도 여러 명을 고를 수 있게 함
-- 1) 가입 신청에 '함께 배우는 코치' 칸 추가
alter table public.join_requests add column if not exists extra_teacher_ids uuid[] not null default '{}';

-- 2) 신청서에 고른 코치도 그 신청을 볼 수 있게 (지금은 첫 번째 코치만 봄)
drop policy if exists "join_requests: read" on public.join_requests;
create policy "join_requests: read" on public.join_requests for select using (
  (user_id = auth.uid()) or is_admin()
  or (is_teacher() and kind = 'student' and (teacher_id is null or teacher_id = my_teacher_id() or my_teacher_id() = any(extra_teacher_ids)))
);

-- 3) 승인할 때 함께 고른 코치들도 연결 (관리자가 승인 화면에서 고친 목록이 있으면 그걸 씀)
drop function if exists public.approve_join_request(uuid, uuid);
create or replace function public.approve_join_request(req uuid, coach uuid default null, extra uuid[] default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.join_requests; me uuid; sid uuid; c uuid; x uuid;
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
  -- 함께 배우는 코치 (첫 번째 코치는 위에서 자동 연결됨)
  foreach x in array coalesce(extra, r.extra_teacher_ids, '{}') loop
    if x is distinct from c and exists (select 1 from public.teachers where id = x and active) then
      insert into public.student_teachers (student_id, teacher_id, is_primary) values (sid, x, false)
      on conflict (student_id, teacher_id) do nothing;
    end if;
  end loop;
  update public.join_requests set status = 'approved', decided_at = now(), decided_by = me, student_id = sid where id = req;
  return sid;
end $$;
revoke all on function public.approve_join_request(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.approve_join_request(uuid, uuid, uuid[]) to authenticated;
