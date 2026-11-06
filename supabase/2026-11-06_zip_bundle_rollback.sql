-- 되돌리기: 2026-11-06_zip_bundle.sql
-- (음원 묶음 자료 행과 ZIP 파일은 남음. 종류만 '음원 묶음'인 채로 목록·연결 정보가 사라짐)
begin;
drop index if exists public.scores_linked_score_id_idx;
alter table public.scores drop column if exists linked_score_id;
alter table public.scores drop column if exists zip_info;
commit;
