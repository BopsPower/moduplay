-- 가입 신청 '반려' + 신청자에게 보일 안내 문구 (원장님 2026-11-18)
-- "학생이 아닌 경우 승인 말고 반려처리도… 알림도 가게. 학생이면 연락을 직접 줘라"
-- 1) 반려 안내 문구 칸
alter table public.join_requests add column if not exists reject_note text
  check (reject_note is null or char_length(reject_note) <= 500);

-- 2) 반려 함수: 안내 문구를 함께 저장 (관리자만)
drop function if exists public.reject_join_request(uuid);
create function public.reject_join_request(req uuid, note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.join_requests set status = 'rejected', decided_at = now(),
    decided_by = (select id from public.teachers where user_id = auth.uid() limit 1),
    reject_note = nullif(left(btrim(coalesce(note, '')), 500), '')
  where id = req and status = 'pending';
end $$;
revoke all on function public.reject_join_request(uuid, text) from public, anon;
grant execute on function public.reject_join_request(uuid, text) to authenticated, service_role;

-- 3) 다시 신청하면(대기 상태) 반려 문구를 지움 — 신청자가 문구를 직접 바꾸지 못하게도 됨
create or replace function public.join_requests_clear_note()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'pending' then new.reject_note := null; end if;
  return new;
end $$;
drop trigger if exists join_requests_clear_note on public.join_requests;
create trigger join_requests_clear_note before insert or update on public.join_requests
  for each row execute function public.join_requests_clear_note();
