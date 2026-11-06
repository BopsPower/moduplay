-- 2026-11-06 음원 묶음(ZIP) 자료 + 짝 교재(PDF) 연결 (원장님 요청)
-- zip_info: ZIP 안 파일 목록(올릴 때 브라우저가 읽어 둠) {size, audio, files:[{n:이름, s:크기}]}
-- linked_score_id: 이 자료와 짝인 다른 자료 (음원 묶음 → PDF 교재). 교재가 지워지면 연결만 풀림
begin;
alter table public.scores add column if not exists zip_info jsonb;
alter table public.scores add column if not exists linked_score_id uuid references public.scores(id) on delete set null;
create index if not exists scores_linked_score_id_idx on public.scores(linked_score_id) where linked_score_id is not null;
commit;
