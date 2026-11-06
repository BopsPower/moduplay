-- 2026-11-06 관리자만: 코치 이용 현황 (원장님 "학생 연습 현황처럼 강사도 이용 현황이 나오게")
-- 읽기만 하는 함수 하나. 표·정책은 바꾸지 않음. 관리자가 아니면 'not allowed'
-- 코치(role 'teacher', 활동 중)마다:
--   가입 여부, 마지막 로그인, 담당 학생 수, 올린 자료·추천·댓글(피드백)·검수 수(전체),
--   학생이 보낸 자료(받음·안 봄), 앱 사용 시간(연습 기록과 같은 방식),
--   날마다 활동(올림·추천·댓글·앱 사용 초, 한국 날짜, since부터)
create or replace function public.admin_coach_overview(since date default ((now() at time zone 'Asia/Seoul')::date - 89))
returns table(teacher_id uuid, name text, majors text[], campuses text[], joined boolean, last_login timestamptz,
  students int, uploads_total int, recs_total int, comments_total int, reviews_total int,
  sends_total int, sends_unseen int, app_total_sec bigint, days jsonb)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
  with t as (select * from public.teachers tt where tt.active and tt.role = 'teacher'),
  ev as (
    select s.created_by as uid, (s.created_at at time zone 'Asia/Seoul')::date as d, 1 as up, 0 as rec, 0 as cmt, 0 as sec
      from public.scores s where s.created_at >= since and s.created_by in (select t.user_id from t)
    union all
    select r.user_id, (r.created_at at time zone 'Asia/Seoul')::date, 0, 1, 0, 0
      from public.score_recommends r where r.created_at >= since and r.user_id in (select t.user_id from t)
    union all
    select c.user_id, (c.created_at at time zone 'Asia/Seoul')::date, 0, 0, 1, 0
      from public.score_comments c where c.created_at >= since and c.user_id in (select t.user_id from t)
    union all
    select p.user_id, p.day, 0, 0, 0, p.seconds
      from public.practice_days p where p.day >= since and p.user_id in (select t.user_id from t)
  ),
  dd as (select ev.uid, ev.d, sum(ev.up)::int as up, sum(ev.rec)::int as rec, sum(ev.cmt)::int as cmt, sum(ev.sec)::int as sec from ev group by ev.uid, ev.d)
  select t.id, t.name::text, t.majors, t.campuses, t.user_id is not null,
    (select u.last_sign_in_at from auth.users u where u.id = t.user_id),
    (select count(*) from public.student_teachers st join public.students s2 on s2.id = st.student_id where st.teacher_id = t.id and coalesce(s2.active, true))::int,
    (select count(*) from public.scores s where t.user_id is not null and s.created_by = t.user_id)::int,
    (select count(*) from public.score_recommends r where t.user_id is not null and r.user_id = t.user_id)::int,
    (select count(*) from public.score_comments c where t.user_id is not null and c.user_id = t.user_id)::int,
    (select count(*) from public.scores s where s.tags && array['auto:검수공개:' || t.name, 'auto:검수반려:' || t.name])::int,
    (select count(*) from public.score_sends x where x.teacher_id = t.id)::int,
    (select count(*) from public.score_sends x where x.teacher_id = t.id and x.seen_at is null)::int,
    coalesce((select sum(p.seconds) from public.practice_days p where t.user_id is not null and p.user_id = t.user_id), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('day', dd.d, 'up', dd.up, 'rec', dd.rec, 'cmt', dd.cmt, 'sec', dd.sec) order by dd.d) from dd where dd.uid = t.user_id), '[]'::jsonb)
  from t;
end $function$;
revoke execute on function public.admin_coach_overview(date) from anon;
