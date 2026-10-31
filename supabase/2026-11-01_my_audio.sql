-- 내 음원 보관함: 학생·코치 본인만 보는 음원, 한 사람당 최대 10곡, 파일 하나 30MB까지
-- 되돌리기: 2026-11-01_my_audio_rollback.sql
create table if not exists public.my_audio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  size bigint not null check (size > 0 and size <= 31457280),
  type text not null default 'audio/mpeg',
  path text not null default '',
  tempo int not null default 100,
  loop_a real, loop_b real,
  marks jsonb not null default '[]'::jsonb,
  dur real,
  added_at timestamptz not null default now(),
  played_at timestamptz not null default now()
);
create index if not exists my_audio_user_idx on public.my_audio(user_id, played_at desc);

-- 넣을 때: 주인·저장 위치는 자동, 10곡 넘으면 막기
create or replace function public.my_audio_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.path := auth.uid()::text || '/' || new.id::text;
  if (select count(*) from public.my_audio where user_id = auth.uid()) >= 10 then
    raise exception 'MY_AUDIO_LIMIT' using hint = '한 사람당 10곡까지';
  end if;
  return new;
end $$;
drop trigger if exists my_audio_fill on public.my_audio;
create trigger my_audio_fill before insert on public.my_audio for each row execute function public.my_audio_fill();

alter table public.my_audio enable row level security;
drop policy if exists "my audio own" on public.my_audio;
create policy "my audio own" on public.my_audio for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and ((select public.is_teacher()) or (select public.my_student_id()) is not null));
grant select, insert, update, delete on public.my_audio to authenticated;

-- 파일 저장소: 비공개, 본인 폴더만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('my-audio', 'my-audio', false, 31457280, array['audio/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "my-audio read own" on storage.objects;
create policy "my-audio read own" on storage.objects for select to authenticated
  using (bucket_id = 'my-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "my-audio add own" on storage.objects;
create policy "my-audio add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'my-audio' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.my_audio a where a.user_id = (select auth.uid()) and a.path = name));
drop policy if exists "my-audio remove own" on storage.objects;
create policy "my-audio remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'my-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
