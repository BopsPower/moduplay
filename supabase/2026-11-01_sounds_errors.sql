-- 2026-11-01 (1) 악기 소리 공개 폴더  (2) 앱 오류 기록 표
begin;
-- (1) sounds: 누구나 읽기(공개), 쓰기는 관리자만. 악기 샘플만 넣음 (학생 정보·악보 없음)
insert into storage.buckets (id, name, public, file_size_limit)
values ('sounds', 'sounds', true, 10485760)
on conflict (id) do update set public = true;
drop policy if exists "sounds: admin insert" on storage.objects;
drop policy if exists "sounds: admin update" on storage.objects;
drop policy if exists "sounds: admin delete" on storage.objects;
create policy "sounds: admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'sounds' and public.is_admin());
create policy "sounds: admin update" on storage.objects for update to authenticated using (bucket_id = 'sounds' and public.is_admin());
create policy "sounds: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'sounds' and public.is_admin());

-- (2) client_errors: 앱 화면에서 난 오류. 누구나 자기 것만 남기기, 읽기·지우기는 관리자만
create table if not exists public.client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  build text check (length(build) <= 40),
  url text check (length(url) <= 300),
  kind text check (length(kind) <= 30),
  message text check (length(message) <= 1000),
  stack text check (length(stack) <= 4000),
  ua text check (length(ua) <= 300)
);
create index if not exists client_errors_at on public.client_errors (at desc);
alter table public.client_errors enable row level security;
drop policy if exists "client_errors: insert" on public.client_errors;
drop policy if exists "client_errors: admin read" on public.client_errors;
drop policy if exists "client_errors: admin delete" on public.client_errors;
create policy "client_errors: insert" on public.client_errors for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
create policy "client_errors: admin read" on public.client_errors for select using (public.is_admin());
create policy "client_errors: admin delete" on public.client_errors for delete using (public.is_admin());
grant insert on public.client_errors to anon, authenticated;
grant usage, select on sequence public.client_errors_id_seq to anon, authenticated;
commit;
