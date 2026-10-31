-- 되돌리기: '관리자만' 자료를 먼저 코치끼리만으로 바꾼 뒤 원래 규칙으로
update public.scores set visibility = 'coaches' where visibility = 'admin';
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility in ('students','mine','selected','coaches','public','assigned'));
create or replace function public.can_read_score(sid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.scores s
    where s.id = sid and (
      public.is_teacher()
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
drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select using (
  bucket_id = 'scores' and (public.is_teacher() or owner_id = (auth.uid())::text or exists (
    select 1 from public.scores s where (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%')) and public.can_read_score(s.id))));
