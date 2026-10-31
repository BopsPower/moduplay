-- 템포 사다리 + 뮤지션 배지 (둘 다 본인만 볼 수 있음)
create table if not exists public.tempo_ladders (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  start_bpm int not null check (start_bpm between 20 and 400),
  goal_bpm int not null check (goal_bpm between 20 and 400),
  step int not null default 10 check (step between 1 and 50),
  best_bpm int check (best_bpm between 0 and 400),   -- 성공한 가장 빠른 템포
  done_at timestamptz,                               -- 목표 템포까지 다 오른 날
  updated_at timestamptz not null default now(),
  primary key (user_id, score_id)
);
alter table public.tempo_ladders enable row level security;
drop policy if exists "tempo_ladders: own" on public.tempo_ladders;
create policy "tempo_ladders: own" on public.tempo_ladders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.musician_badges (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  badge text not null check (char_length(badge) <= 40),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.musician_badges enable row level security;
drop policy if exists "musician_badges: own" on public.musician_badges;
create policy "musician_badges: own" on public.musician_badges for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
