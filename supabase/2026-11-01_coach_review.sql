-- 2026-11-01 담당 강사 검수: 코치 담당 전공(최대 3개) + 공개 범위 'review'(그 전공 코치에게만) + 코치가 공개/반려
begin;
-- 1) 코치 담당 전공
alter table public.teachers add column if not exists majors text[] not null default '{}';
alter table public.teachers drop constraint if exists teachers_majors_max3;
alter table public.teachers add constraint teachers_majors_max3 check (coalesce(array_length(majors, 1), 0) <= 3);

create or replace function public.my_majors() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select majors from public.teachers where user_id = auth.uid() and active limit 1), '{}')
$$;

-- 2) 공개 범위에 'review'(담당 강사 검수) 추가
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility = any (array['students','mine','selected','coaches','public','assigned','admin','review']));

-- 3) 읽기 규칙: 'review'는 관리자 + 그 전공 담당 코치만. (그 밖의 코치·학생은 못 봄)
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

drop policy if exists "scores: read by visibility" on public.scores;
create policy "scores: read by visibility" on public.scores for select using (
  (select public.is_admin())
  or ((select public.is_teacher()) and visibility not in ('admin', 'review'))
  or ((select public.is_teacher()) and visibility = 'review' and array[major] <@ (select public.my_majors()))
  or created_by = (select auth.uid())
  or (visibility not in ('admin', 'review') and public.can_read_score(id))
);

-- 파일 읽기: 코치는 '관리자만'·'검수' 자료 파일은 빼고, 검수 자료는 담당 전공일 때만
drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select using (
  bucket_id = 'scores' and (
    public.is_admin()
    or owner_id = (auth.uid())::text
    or (public.is_teacher() and not exists (
          select 1 from public.scores s
          where s.visibility in ('admin', 'review') and (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%'))))
    or exists (
          select 1 from public.scores s
          where (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%')) and public.can_read_score(s.id))
  )
);

-- 4) 코치가 담당 전공 검수 자료를 공개·반려 (종류도 함께 고칠 수 있음). 누가 했는지 숨은 태그로 남김
create or replace function public.review_decide(sid uuid, decision text, new_kind text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s public.scores; who text;
begin
  select * into s from public.scores where id = sid;
  if s.id is null then raise exception '자료가 없어요'; end if;
  if s.visibility <> 'review' then raise exception '검수 중인 자료가 아니에요'; end if;
  if not (public.is_admin() or (public.is_teacher() and s.major = any(public.my_majors()))) then
    raise exception '담당 전공 자료만 정할 수 있어요';
  end if;
  select name into who from public.teachers where user_id = auth.uid() limit 1;
  if decision = 'publish' then
    update public.scores set visibility = 'students',
      convert_status = case when convert_status = 'hold' then 'pending' else convert_status end,
      convert_error = case when convert_status = 'hold' then null else convert_error end,
      kind = coalesce(new_kind, kind),
      tags = coalesce(tags, '{}') || array['auto:검수공개:' || coalesce(who, '?')]
    where id = sid;
  elsif decision = 'reject' then
    update public.scores set visibility = 'admin', kind = coalesce(new_kind, kind),
      tags = coalesce(tags, '{}') || array['auto:검수반려:' || coalesce(who, '?')]
    where id = sid;
  elsif decision = 'kind' then
    update public.scores set kind = coalesce(new_kind, kind) where id = sid;
  else raise exception '알 수 없는 결정'; end if;
  return decision;
end $$;
revoke all on function public.review_decide(uuid, text, text) from public;
grant execute on function public.review_decide(uuid, text, text) to authenticated;
grant execute on function public.my_majors() to authenticated;
commit;
