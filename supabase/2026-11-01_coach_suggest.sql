-- 2026-11-01 같은 전공 학생 추천·바로 추가 (원장님 결정: 코치가 바로 추가, 같은 전공 학생 전부)
begin;
-- 학생 전공 (비어 있으면 가입 신청 때 적은 전공을 씀)
alter table public.students add column if not exists major text;

create or replace function public.student_major(sid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(major, class_name) from public.students where id = sid),  -- class_name = 학생 화면의 '전공' 칸
    (select major from public.join_requests where student_id = sid and major is not null order by created_at desc limit 1))
$$;

-- 코치에게 보여 줄 추천: 내 담당 전공과 같은 학생 (이름·전공·센터·담당 코치 이름만)
create or replace function public.coach_suggestions()
returns table(id uuid, name text, major text, campus text, mine boolean, coaches text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, public.student_major(s.id), s.campus,
    exists (select 1 from public.student_teachers st where st.student_id = s.id and st.teacher_id = public.my_teacher_id()),
    (select string_agg(t.name, ', ') from public.student_teachers st join public.teachers t on t.id = st.teacher_id where st.student_id = s.id)
  from public.students s
  where public.is_teacher() and s.active and not coalesce(s.staff_preview, false)
    and public.student_major(s.id) = any(public.my_majors())
$$;

-- 코치가 추천 학생을 내 학생으로 바로 추가 (담당 전공 학생만)
create or replace function public.coach_add_student(sid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tid uuid := public.my_teacher_id(); first boolean;
begin
  if tid is null then raise exception '코치만 할 수 있어요'; end if;
  if not exists (select 1 from public.students where id = sid and active) then raise exception '학생을 찾을 수 없어요'; end if;
  if not (public.student_major(sid) = any(public.my_majors())) then raise exception '담당 전공 학생만 추가할 수 있어요'; end if;
  if exists (select 1 from public.student_teachers where student_id = sid and teacher_id = tid) then return 'already'; end if;
  first := not exists (select 1 from public.student_teachers where student_id = sid);
  insert into public.student_teachers (student_id, teacher_id, is_primary) values (sid, tid, first);
  if first then update public.students set teacher_id = tid where id = sid and teacher_id is null; end if;
  return 'added';
end $$;

revoke all on function public.coach_suggestions() from public;
revoke all on function public.coach_add_student(uuid) from public;
grant execute on function public.coach_suggestions() to authenticated;
grant execute on function public.coach_add_student(uuid) to authenticated;
grant execute on function public.student_major(uuid) to authenticated;
commit;
