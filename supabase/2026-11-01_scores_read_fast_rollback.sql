-- 되돌리기: 예전 읽기 규칙 그대로
begin;
drop policy if exists "scores: read by visibility" on public.scores;
create policy "scores: read by visibility" on public.scores for select using (public.can_read_score(id));
commit;
