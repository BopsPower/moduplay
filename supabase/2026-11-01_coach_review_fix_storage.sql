-- 2026-11-01 고침: 파일 읽기 규칙 안의 scores 조회가 코치의 읽기 규칙에 걸려 '안 보이는 자료'를 못 찾던 문제
-- (코치가 '관리자만'·다른 전공 '검수' 자료의 파일을 열 수 있었음) → 규칙을 건너뛰는 함수로 확인
begin;
create or replace function public.score_file_blocked_for_teacher(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.scores s
    where (case when obj like 'out/%' then s.id::text = split_part(obj, '/', 2) else s.file_path = obj end)
      and s.visibility in ('admin', 'review')
      and not (s.visibility = 'review' and s.major = any(public.my_majors()))
  )
$$;
grant execute on function public.score_file_blocked_for_teacher(text) to authenticated;

drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select using (
  bucket_id = 'scores' and (
    public.is_admin()
    or owner_id = (auth.uid())::text
    or (public.is_teacher() and not public.score_file_blocked_for_teacher(name))
    or exists (
          select 1 from public.scores s
          where (s.file_path = objects.name or objects.name like ('out/' || s.id::text || '/%')) and public.can_read_score(s.id))
  )
);
commit;
