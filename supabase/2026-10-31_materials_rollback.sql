-- 되돌리기: 2026-10-31_materials.sql 이전 권한으로 복구 (앱도 main을 이전 커밋으로 되돌린 뒤 실행)
-- 새로 만든 표(댓글·보관함·신고·요청·공유)와 열은 데이터 보존을 위해 지우지 않습니다.

drop trigger if exists scores_fill_uploader on public.scores;

-- 참고: 예전 규칙에서는 mine·selected·coaches 자료가 코치에게만 보입니다(학생에게 새어 나가지 않음).

drop policy if exists "scores: read by visibility" on public.scores;
create policy "scores: read by visibility" on public.scores for select
  using (public.is_teacher() or visibility = 'public'
    or (visibility = 'students' and public.my_student_id() is not null)
    or (visibility = 'assigned' and exists (select 1 from public.assignments a where a.score_id = scores.id and a.student_id = public.my_student_id())));

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

drop policy if exists "scores bucket: member upload" on storage.objects;
drop policy if exists "scores bucket: teacher upload" on storage.objects;
create policy "scores bucket: teacher upload" on storage.objects for insert
  with check (bucket_id = 'scores' and public.is_teacher());

drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select
  using (bucket_id = 'scores' and (public.is_teacher() or exists (
    select 1 from public.scores s
    where (s.file_path = objects.name or objects.name like 'out/' || s.id::text || '/%')
      and (s.visibility = 'public'
        or (s.visibility = 'students' and public.my_student_id() is not null)
        or (s.visibility = 'assigned' and exists (select 1 from public.assignments a where a.score_id = s.id and a.student_id = public.my_student_id()))))));
