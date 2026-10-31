-- 악보 창고: 담당 전공 코치가 곡 이름·뮤지션 고치기 (창고 곡만). 되돌리기: drop function public.coach_rename_score(uuid, text, text);
create or replace function public.coach_rename_score(sid uuid, new_title text, new_artist text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s public.scores;
begin
  select * into s from public.scores where id = sid;
  if s.id is null then raise exception '자료가 없어요'; end if;
  if not (public.is_admin() or (public.is_teacher() and s.visibility = 'review' and s.major = any(public.my_majors()))) then
    raise exception '악보 창고의 담당 전공 곡만 고칠 수 있어요';
  end if;
  if coalesce(btrim(new_title), '') = '' then raise exception '곡 이름을 써 주세요'; end if;
  update public.scores set
    title = left(btrim(new_title), 200),
    artist = nullif(left(btrim(coalesce(new_artist, '')), 200), ''),
    tags = case when nullif(btrim(coalesce(new_artist, '')), '') is not null then array_remove(coalesce(tags, '{}'), 'auto:확인필요') else tags end
  where id = sid;
  return 'ok';
end $$;
revoke all on function public.coach_rename_score(uuid, text, text) from public, anon;
grant execute on function public.coach_rename_score(uuid, text, text) to authenticated;
