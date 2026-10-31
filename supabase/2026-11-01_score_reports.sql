-- 코치 → 관리자 '이상한 악보' 확인 요청. 관리자가 문제없음 / 숨김 / 삭제로 처리
-- 되돌리기: 2026-11-01_score_reports_rollback.sql
create table if not exists public.score_reports (
  id uuid primary key default gen_random_uuid(),
  score_id uuid references public.scores(id) on delete set null,
  score_title text not null default '',
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reporter_name text not null default '',
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'ok', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists score_reports_open_idx on public.score_reports(status, created_at desc);

create or replace function public.score_reports_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'open';
  new.resolved_at := null;
  new.reporter_name := coalesce((select name from public.teachers where user_id = auth.uid()), '');
  new.score_title := coalesce((select title from public.scores where id = new.score_id), '');
  return new;
end $$;
drop trigger if exists score_reports_fill on public.score_reports;
create trigger score_reports_fill before insert on public.score_reports for each row execute function public.score_reports_fill();

alter table public.score_reports enable row level security;
drop policy if exists "reports add" on public.score_reports;
create policy "reports add" on public.score_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_teacher()) and public.can_read_score(score_id));
drop policy if exists "reports read" on public.score_reports;
create policy "reports read" on public.score_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "reports resolve" on public.score_reports;
create policy "reports resolve" on public.score_reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "reports remove" on public.score_reports;
create policy "reports remove" on public.score_reports for delete to authenticated
  using ((select public.is_admin()));
grant select, insert, update, delete on public.score_reports to authenticated;

-- 필수 자료 고정 (관리자가 자료실·홈 맨 위에 고정). 관리자는 원래 scores를 고칠 수 있어 규칙 추가 없음
alter table public.scores add column if not exists pinned_at timestamptz;
create index if not exists scores_pinned_idx on public.scores(pinned_at) where pinned_at is not null;
