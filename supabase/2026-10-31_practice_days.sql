-- 내 연습 기록 (본인만 볼 수 있음 · 코치·관리자도 못 봄)
-- 연습 도구·악보 재생·연습 플레이어·유튜브를 쓰는 동안 앱이 시간을 자동으로 쌓음
create table if not exists public.practice_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  seconds int not null default 0 check (seconds >= 0),
  primary key (user_id, day)
);
alter table public.practice_days enable row level security;
drop policy if exists "practice_days: own read" on public.practice_days;
create policy "practice_days: own read" on public.practice_days for select using (user_id = auth.uid());

-- 쓰기는 이 함수로만 (한국 날짜 기준, 한 번에 최대 15분, 하루 최대 24시간)
create or replace function public.add_practice_seconds(sec int)
returns int language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Seoul')::date; s int := least(greatest(coalesce(sec, 0), 0), 900); r int;
begin
  if auth.uid() is null or s = 0 then return 0; end if;
  insert into public.practice_days (user_id, day, seconds) values (auth.uid(), d, s)
  on conflict (user_id, day) do update set seconds = least(public.practice_days.seconds + excluded.seconds, 86400)
  returning seconds into r;
  return r;
end $$;
grant execute on function public.add_practice_seconds(int) to authenticated;
