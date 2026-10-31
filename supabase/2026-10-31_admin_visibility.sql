-- 공개 범위 '관리자만'(admin) 추가: 사운드슬라이스에서 가져와 검토 중인 자료. 코치·학생은 못 봄
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility in ('students','mine','selected','coaches','public','assigned','admin'));

create or replace function public.can_read_score(sid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.scores s
    where s.id = sid and (
      public.is_admin()
      or (public.is_teacher() and s.visibility <> 'admin')
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

-- 저장소 파일: 코치도 '관리자만' 자료의 파일은 못 받게
drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select using (
  bucket_id = 'scores' and (
    public.is_admin()
    or owner_id = (auth.uid())::text
    or (public.is_teacher() and not exists (
         select 1 from public.scores s
         where s.visibility = 'admin' and (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%'))))
    or exists (
         select 1 from public.scores s
         where (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%')) and public.can_read_score(s.id))
  )
);
