-- 코치 추천(⭐): 코치가 골라서 누른 곡에만 "○○ 코치 추천" 표시
-- 되돌리기: 2026-11-01_score_recommends_rollback.sql
create table if not exists public.score_recommends (
  score_id uuid not null references public.scores(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coach_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (score_id, user_id)
);
create index if not exists score_recommends_user_idx on public.score_recommends(user_id);

-- 이름은 코치 표에서 자동으로 (다른 사람 이름으로 추천 못 하게)
create or replace function public.score_recommends_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.coach_name := coalesce((select name from public.teachers where user_id = auth.uid()), '');
  return new;
end $$;
drop trigger if exists score_recommends_fill on public.score_recommends;
create trigger score_recommends_fill before insert on public.score_recommends
  for each row execute function public.score_recommends_fill();

alter table public.score_recommends enable row level security;
-- 보기: 학원 학생·코치
drop policy if exists "recommends read" on public.score_recommends;
create policy "recommends read" on public.score_recommends for select to authenticated
  using ((select public.is_teacher()) or (select public.my_student_id()) is not null);
-- 추천하기: 코치 본인, 볼 수 있는 곡만
drop policy if exists "recommends add" on public.score_recommends;
create policy "recommends add" on public.score_recommends for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_teacher()) and public.can_read_score(score_id));
-- 추천 취소: 본인 또는 관리자
drop policy if exists "recommends remove" on public.score_recommends;
create policy "recommends remove" on public.score_recommends for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
grant select, insert, delete on public.score_recommends to authenticated;
