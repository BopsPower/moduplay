-- 주의: 학생들이 올린 음원 기록이 지워짐. 파일은 Storage 화면에서 my-audio 버킷을 비운 뒤 버킷 삭제
drop policy if exists "my-audio read own" on storage.objects;
drop policy if exists "my-audio add own" on storage.objects;
drop policy if exists "my-audio remove own" on storage.objects;
drop table if exists public.my_audio;
drop function if exists public.my_audio_fill();
