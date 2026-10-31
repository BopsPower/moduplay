begin;
drop function if exists public.coach_add_student(uuid);
drop function if exists public.coach_suggestions();
drop function if exists public.student_major(uuid);
-- students.major 칸은 남겨 둬도 무해 (지우려면: alter table public.students drop column major;)
-- 코치가 추가한 연결을 되돌리려면 관리자 화면에서 담당 코치 해제
commit;
