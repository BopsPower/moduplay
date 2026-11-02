-- 코치가 자기 담당 전공(최대 3개)을 직접 고르기
-- 본인(teachers.user_id = 로그인한 사람) 줄의 majors만 바뀜. 허용된 전공 이름만, 3개까지.
create or replace function public.set_my_majors(m text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ok text[] := array['보컬','피아노','기타','드럼','베이스','미디작곡','연주작곡'];
  clean text[];
begin
  select coalesce(array_agg(distinct x), '{}') into clean from unnest(coalesce(m, '{}')) x where x = any(ok);
  if array_length(clean, 1) > 3 then raise exception 'MAJORS_MAX_3'; end if;
  update teachers set majors = clean where user_id = auth.uid() and active;
  if not found then raise exception 'NOT_A_COACH'; end if;
  return clean;
end $$;
revoke all on function public.set_my_majors(text[]) from public, anon;
grant execute on function public.set_my_majors(text[]) to authenticated;
