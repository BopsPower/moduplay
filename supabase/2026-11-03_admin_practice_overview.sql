-- 관리자만: 학생별 연습 현황 (연습 시간·최근 기록·뮤지션 배지·템포 사다리)
-- 코치는 못 봄 (is_admin() 아니면 오류). 표·정책은 그대로 두고, 읽기 전용 함수 하나만 추가
create or replace function public.admin_practice_overview(since date default ((now() at time zone 'Asia/Seoul')::date - 89))
returns table (
  student_id uuid, name text, major text, class_name text, campus text,
  total_sec bigint, days jsonb, badges text[], ladders_done int, best_bpm int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
  select s.id, s.name, s.major, s.class_name, s.campus,
    coalesce((select sum(d.seconds) from practice_days d where d.user_id = s.user_id), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'seconds', d.seconds) order by d.day)
              from practice_days d where d.user_id = s.user_id and d.day >= since), '[]'::jsonb),
    coalesce((select array_agg(b.badge order by b.earned_at) from musician_badges b where b.user_id = s.user_id), '{}'),
    coalesce((select count(*) from tempo_ladders l where l.user_id = s.user_id and l.done_at is not null), 0)::int,
    coalesce((select max(l.best_bpm) from tempo_ladders l where l.user_id = s.user_id), 0)::int
  from students s
  where s.active and not coalesce(s.staff_preview, false);
end $$;
revoke all on function public.admin_practice_overview(date) from public, anon;
grant execute on function public.admin_practice_overview(date) to authenticated;
