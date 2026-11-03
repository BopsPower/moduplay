-- 필수 자료 고정·순서(pinned_at)는 관리자만 바꿀 수 있게 (원장님 요청 2026-11-04, 적용함)
-- 로그인한 사용자가 관리자가 아니면 pinned_at 변경을 무시함 (나머지 수정은 그대로 됨)
-- 서버 작업(auth.uid() 없음: 서비스 키·SQL 편집기)은 막지 않음
create or replace function public.scores_pin_admin_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pinned_at := null;
  elsif new.pinned_at is distinct from old.pinned_at then
    new.pinned_at := old.pinned_at;
  end if;
  return new;
end
$$;

drop trigger if exists scores_pin_admin_only on public.scores;
create trigger scores_pin_admin_only
  before insert or update on public.scores
  for each row execute function public.scores_pin_admin_only();
