drop table if exists public.score_reports;
drop function if exists public.score_reports_fill();
alter table public.scores drop column if exists pinned_at;
