-- 연습 플레이어: 내가 연습한 유튜브 링크 기록 (본인만 보고 지울 수 있음)
create table if not exists public.my_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  url text not null check (char_length(url) <= 300),
  title text check (char_length(title) <= 200),
  speed numeric,
  loop_a numeric,
  loop_b numeric,
  created_at timestamptz not null default now(),
  played_at timestamptz not null default now(),
  unique (user_id, video_id)
);
create index if not exists my_videos_user_idx on public.my_videos (user_id, played_at desc);
alter table public.my_videos enable row level security;
drop policy if exists "my_videos: own" on public.my_videos;
create policy "my_videos: own" on public.my_videos for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
