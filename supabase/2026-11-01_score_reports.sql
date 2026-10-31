-- 확인 요청 넓히기: 기존 score_reports(학생→코치, 2026-10-31_materials.sql)에 코치→관리자 요청과 처리 상태를 더함
-- 필수 자료 고정 칸(scores.pinned_at)은 2026-11-01 06:30 먼저 실행함
-- 되돌리기: 2026-11-01_score_reports_rollback.sql
alter table public.score_reports add column if not exists score_title text not null default '';
alter table public.score_reports add column if not exists reporter_name text not null default '';
alter table public.score_reports add column if not exists by_coach boolean not null default false;
alter table public.score_reports add column if not exists status text not null default 'open';
alter table public.score_reports add column if not exists resolved_at timestamptz;
alter table public.score_reports drop constraint if exists score_reports_status_check;
alter table public.score_reports add constraint score_reports_status_check check (status in ('open', 'ok', 'hidden', 'deleted'));
alter table public.score_reports alter column score_id drop not null;
alter table public.score_reports drop constraint if exists score_reports_score_id_fkey;
alter table public.score_reports add constraint score_reports_score_id_fkey foreign key (score_id) references public.scores(id) on delete set null;
create index if not exists score_reports_open_idx on public.score_reports(status, created_at desc);

create or replace function public.score_reports_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.status := 'open';
  new.resolved := false;
  new.resolved_at := null;
  new.by_coach := public.is_teacher();
  new.reporter_name := coalesce((select name from public.teachers where user_id = auth.uid()), (select name from public.students where user_id = auth.uid() limit 1), '');
  new.score_title := coalesce((select title from public.scores where id = new.score_id), '');
  return new;
end $$;
drop trigger if exists score_reports_fill on public.score_reports;
create trigger score_reports_fill before insert on public.score_reports for each row execute function public.score_reports_fill();

create or replace function public.score_reports_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.resolved and not old.resolved and new.status = 'open' then new.status := 'ok'; end if;
  if new.status <> 'open' then new.resolved := true; new.resolved_at := coalesce(new.resolved_at, now()); end if;
  return new;
end $$;
drop trigger if exists score_reports_sync on public.score_reports;
create trigger score_reports_sync before update on public.score_reports for each row execute function public.score_reports_sync();

drop policy if exists "reports remove" on public.score_reports;
create policy "reports remove" on public.score_reports for delete to authenticated using ((select public.is_admin()));
