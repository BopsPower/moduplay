-- 2026-11-06_send_to_coach.sql 되돌리기
-- 주의: 학생이 보낸 자료(visibility 'sent')가 있으면 먼저 정리해야 함 (아래 1번). 지우지 않고 보낸 학생만 보게 'admin'으로 돌림
begin;

-- 0) 학생 올리기 트리거 원래대로 (학생 자료는 모두 '학원 전체')
create or replace function public.scores_fill_uploader() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare tname text; sname text;
begin
  if public.is_teacher() then
    if tg_op = 'INSERT' then
      select name into tname from public.teachers where user_id = auth.uid();
      new.uploader_role := 'coach';
      new.uploader_name := coalesce(tname, new.uploader_name);
    end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    select name into sname from public.students where id = public.my_student_id();
    new.uploader_role := 'student';
    new.uploader_name := case when sname is null or sname = '' then '학생' else left(sname, 1) || '○○' end;
    new.visibility := 'students';
    new.hidden := false;
    new.coach_memo := null;
    if new.kind = '교재' then new.kind := '기타'; end if;
    if new.category = '교재' then new.category := '연습곡'; end if;
  else
    new.visibility := old.visibility;
    new.hidden := old.hidden;
    new.coach_memo := old.coach_memo;
    new.uploader_role := old.uploader_role;
    new.uploader_name := old.uploader_name;
    if new.kind = '교재' and old.kind is distinct from '교재' then new.kind := old.kind; end if;
  end if;
  return new;
end $function$;

-- 1) 보낸 자료는 관리자·보낸 학생만 보이게
update public.scores set visibility = 'admin' where visibility = 'sent';

-- 2) 읽기 규칙 원래대로
alter policy "scores: read by visibility" on public.scores using (
  (select public.is_admin())
  or ((select public.is_teacher()) and visibility <> all (array['admin','review']))
  or ((select public.is_teacher()) and visibility = 'review' and array[major] <@ (select public.my_majors()))
  or created_by = (select auth.uid())
  or (visibility <> all (array['admin','review']) and public.can_read_score(id))
);

create or replace function public.can_read_score(sid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.scores s
    where s.id = sid and (
      public.is_admin()
      or (public.is_teacher() and s.visibility not in ('admin', 'review'))
      or (public.is_teacher() and s.visibility = 'review' and s.major = any(public.my_majors()))
      or s.created_by = auth.uid()
      or (not s.hidden and public.my_student_id() is not null and (
            s.visibility in ('students', 'public')
         or (s.visibility = 'mine' and exists (
              select 1 from public.student_teachers stt
              join public.teachers t on t.id = stt.teacher_id
              where stt.student_id = public.my_student_id() and t.user_id = s.created_by))
         or (s.visibility = 'selected' and exists (
              select 1 from public.score_shares sh where sh.score_id = s.id and sh.student_id = public.my_student_id()))
         or (s.visibility = 'assigned' and exists (
              select 1 from public.assignments a where a.score_id = s.id and a.student_id = public.my_student_id()))
      ))
    )
  );
$function$;

create or replace function public.score_file_blocked_for_teacher(obj text) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.scores s
    where (case when obj like 'out/%' then s.id::text = split_part(obj, '/', 2) else s.file_path = obj end)
      and s.visibility in ('admin', 'review')
      and not (s.visibility = 'review' and s.major = any(public.my_majors()))
  )
$function$;

-- 3) 표·함수 지우기
drop table if exists public.score_sends;
drop function if exists public.send_coaches();
drop function if exists public.is_sent_to_me(uuid);
drop function if exists public.my_sent_score(uuid);
drop function if exists public.is_active_coach(uuid);

alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility = any (array['students','mine','selected','coaches','public','assigned','admin','review']));

-- 4) 악기 나누기 하루 3곡으로
alter policy "stem_jobs add" on public.stem_jobs with check (
  created_by = (select auth.uid()) and status = 'queued' and stems is null and (
    (source_bucket = 'scores' and score_id is not null and public.can_read_score(score_id)
      and exists (select 1 from public.scores s where s.id = stem_jobs.score_id and (stem_jobs.source_path = s.file_path or stem_jobs.source_path = s.mp3_path)))
    or (source_bucket = 'my-audio' and score_id is null and split_part(source_path, '/', 1) = (select auth.uid())::text
      and (public.is_admin() or public.my_stem_jobs_today() < 3))
  )
);

commit;
