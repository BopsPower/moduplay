-- 되돌리기: 필수 자료 고정·순서 관리자 전용 규칙 지우기
drop trigger if exists scores_pin_admin_only on public.scores;
drop function if exists public.scores_pin_admin_only();
