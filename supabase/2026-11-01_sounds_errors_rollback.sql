-- 되돌리기: 오류 기록 표 삭제, 소리 폴더 쓰기 규칙 삭제 (폴더 안 파일은 Storage 화면에서 먼저 비운 뒤 버킷 삭제)
begin;
drop table if exists public.client_errors;
drop policy if exists "sounds: admin insert" on storage.objects;
drop policy if exists "sounds: admin update" on storage.objects;
drop policy if exists "sounds: admin delete" on storage.objects;
update storage.buckets set public = false where id = 'sounds';
commit;
