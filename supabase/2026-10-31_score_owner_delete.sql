-- 악보: 올리기는 코치 모두, 수정·삭제는 올린 본인 또는 관리자만
drop policy if exists "scores: teacher write" on public.scores;
drop policy if exists "scores: insert" on public.scores;
drop policy if exists "scores: update" on public.scores;
drop policy if exists "scores: delete" on public.scores;
create policy "scores: insert" on public.scores for insert
  with check (public.is_teacher() and (created_by is null or created_by = auth.uid()));
create policy "scores: update" on public.scores for update
  using (public.is_admin() or (public.is_teacher() and created_by = auth.uid()))
  with check (public.is_admin() or (public.is_teacher() and created_by = auth.uid()));
create policy "scores: delete" on public.scores for delete
  using (public.is_admin() or (public.is_teacher() and created_by = auth.uid()));

-- 파일 저장소도 같은 규칙 (올리기는 코치 모두, 바꾸기·지우기는 올린 본인 또는 관리자)
drop policy if exists "scores bucket: teacher write" on storage.objects;
drop policy if exists "scores bucket: teacher upload" on storage.objects;
drop policy if exists "scores bucket: own or admin update" on storage.objects;
drop policy if exists "scores bucket: own or admin delete" on storage.objects;
create policy "scores bucket: teacher upload" on storage.objects for insert
  with check (bucket_id = 'scores' and public.is_teacher());
create policy "scores bucket: own or admin update" on storage.objects for update
  using (bucket_id = 'scores' and (public.is_admin() or owner_id = auth.uid()::text));
create policy "scores bucket: own or admin delete" on storage.objects for delete
  using (bucket_id = 'scores' and (public.is_admin() or owner_id = auth.uid()::text));

-- 학생 열람: 원본 파일뿐 아니라 변환된 페이지 그림·소리(out/<악보id>/...)도 같은 공개 범위로
drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select
  using (bucket_id = 'scores' and (public.is_teacher() or exists (
    select 1 from public.scores s
    where (s.file_path = objects.name or objects.name like 'out/' || s.id::text || '/%')
      and (s.visibility = 'public'
        or (s.visibility = 'students' and public.my_student_id() is not null)
        or (s.visibility = 'assigned' and exists (select 1 from public.assignments a where a.score_id = s.id and a.student_id = public.my_student_id()))))));
