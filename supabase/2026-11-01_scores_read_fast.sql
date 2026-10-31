-- 2026-11-01 악보 읽기 규칙 빠르게 (사운드슬라이스 9,684개 가져온 뒤 목록이 8초 넘게 걸려 끊김)
-- 뜻은 그대로: 관리자 전부 / 코치는 '관리자만' 빼고 / 올린 사람 본인 / 나머지는 예전 함수로 판단
-- 바뀐 점: 관리자·코치·본인 확인을 줄마다가 아니라 한 번만 하고, '관리자만' 자료는 학생에게 함수 검사 없이 바로 제외
begin;
drop policy if exists "scores: read by visibility" on public.scores;
create policy "scores: read by visibility" on public.scores for select using (
  (select public.is_admin())
  or ((select public.is_teacher()) and visibility <> 'admin')
  or created_by = (select auth.uid())
  or (visibility <> 'admin' and public.can_read_score(id))
);
commit;
