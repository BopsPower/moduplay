-- 되돌리기: 검수 중(review) 자료는 관리자만으로, 함수·칸 정리, 읽기 규칙은 이전(2026-11-01_scores_read_fast + admin_visibility)으로
begin;
update public.scores set visibility = 'admin' where visibility = 'review';
drop function if exists public.review_decide(uuid, text, text);
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility = any (array['students','mine','selected','coaches','public','assigned','admin']));
-- 읽기 규칙: supabase/2026-11-01_scores_read_fast.sql 과 2026-10-31_admin_visibility.sql 의 can_read_score·storage 정책을 다시 실행
-- 담당 전공 칸은 남겨 둬도 무해 (지우려면: alter table public.teachers drop column majors; drop function public.my_majors();)
commit;
