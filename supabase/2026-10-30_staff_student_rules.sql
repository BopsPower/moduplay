-- 직원(코치·관리자)과 학생 기록이 섞이지 않게 하는 규칙
-- 1) 관리자: 학생 화면도 볼 수 있도록 '관리자 미리보기' 학생 기록을 1개 갖는다. 담당 코치는 항상 없음, 학생 목록·통계에서 제외.
-- 2) 코치: 학생 기록을 가질 수 없다(자동 비활성).
-- 3) 코치·관리자로 등록된 계정의 가입 신청은 승인할 수 없고, 남은 신청은 자동으로 닫힌다.
-- 4) 가입 신청 승인 시 담당 코치를 반드시 고른다(승인한 사람이 자동 배정되지 않음).

alter table public.students add column if not exists staff_preview boolean not null default false;

-- 학생 기록이 저장될 때: 직원 계정이면 규칙 적용
create or replace function public.students_staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if new.user_id is null then new.staff_preview := false; return new; end if;
  select role into r from public.teachers where user_id = new.user_id and active limit 1;
  if r = 'admin' then
    new.staff_preview := true;
    new.teacher_id := null;
  elsif r = 'teacher' then
    new.staff_preview := false;
    new.active := false;
  else
    new.staff_preview := false;
  end if;
  return new;
end $$;

drop trigger if exists students_staff_guard on public.students;
create trigger students_staff_guard before insert or update on public.students
  for each row execute function public.students_staff_guard();

-- 코치·관리자 기록이 바뀔 때: 같은 계정의 학생 기록·가입 신청 정리
create or replace function public.teachers_sync_student() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.user_id is not null and old.user_id is distinct from new.user_id then
    update public.students set active = false, staff_preview = false where user_id = old.user_id;
  end if;
  if new.user_id is null then return new; end if;

  if new.active and new.role = 'admin' then
    update public.students set active = true where user_id = new.user_id;   -- guard가 담당 코치 제거·미리보기 표시
    if not found then
      begin
        insert into public.students (name, class_name, email, user_id, linked_at, active)
        values (new.name, '관리자 미리보기', new.email, new.user_id, now(), true);
      exception when unique_violation then
        null;  -- 같은 이메일의 학생 기록이 이미 있으면 그대로 둠
      end;
    end if;
  else
    -- 코치이거나, 그만둔 관리자: 학생 화면 기록 끔
    update public.students set active = false, staff_preview = false where user_id = new.user_id and (active or staff_preview);
  end if;

  update public.join_requests set status = 'rejected', decided_at = now()
   where user_id = new.user_id and status = 'pending';
  return new;
end $$;

drop trigger if exists teachers_sync_student on public.teachers;
create trigger teachers_sync_student after insert or update of role, active, user_id on public.teachers
  for each row execute function public.teachers_sync_student();

-- 승인 함수: 직원 계정 차단 + 담당 코치 필수
create or replace function public.approve_join_request(req uuid, coach uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.join_requests; me uuid; sid uuid; c uuid;
begin
  if not public.is_teacher() then raise exception 'not allowed'; end if;
  select id into me from public.teachers where user_id = auth.uid() limit 1;
  select * into r from public.join_requests where id = req for update;
  if r.id is null or r.status = 'approved' then raise exception 'invalid request'; end if;
  if exists (select 1 from public.teachers where user_id = r.user_id or (r.email is not null and lower(email) = lower(r.email))) then
    raise exception 'staff account';
  end if;
  c := coalesce(coach, r.teacher_id);
  if c is null then raise exception 'coach required'; end if;
  if not exists (select 1 from public.teachers where id = c and active) then raise exception 'coach required'; end if;
  if exists (select 1 from public.students where user_id = r.user_id) then raise exception 'already linked'; end if;
  select id into sid from public.students where user_id is null and email is not null and lower(email) = lower(r.email) limit 1;
  if sid is not null then
    update public.students set user_id = r.user_id, linked_at = now(), active = true,
      teacher_id = c, campus = coalesce(r.campus, campus), class_name = coalesce(class_name, r.major)
    where id = sid;
  else
    insert into public.students (name, class_name, email, user_id, teacher_id, campus, linked_at, active)
    values (r.name, r.major, r.email, r.user_id, c, r.campus, now(), true)
    returning id into sid;
  end if;
  update public.join_requests set status = 'approved', decided_at = now(), decided_by = me, student_id = sid where id = req;
  return sid;
end $$;

-- 지금 있는 기록에 한 번 적용
update public.students s set active = s.active where user_id in (select user_id from public.teachers where user_id is not null);
update public.teachers set role = role where user_id is not null and active and role = 'admin';
