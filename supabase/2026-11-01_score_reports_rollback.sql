drop trigger if exists score_reports_fill on public.score_reports;
drop trigger if exists score_reports_sync on public.score_reports;
drop function if exists public.score_reports_fill();
drop function if exists public.score_reports_sync();
drop policy if exists "reports remove" on public.score_reports;
alter table public.score_reports drop column if exists score_title, drop column if exists reporter_name, drop column if exists by_coach, drop column if exists status, drop column if exists resolved_at;
-- (score_id null 허용·지울 때 null 처리는 그대로 둬도 예전 기능에 문제 없음)
-- 필수 자료 고정 칸: alter table public.scores drop column if exists pinned_at;
