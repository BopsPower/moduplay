-- 2026-11-18_join_reject_note.sql 되돌리기 (반려 문구만 사라짐. 반려 상태·신청 기록은 그대로)
drop trigger if exists join_requests_clear_note on public.join_requests;
drop function if exists public.join_requests_clear_note();
drop function if exists public.reject_join_request(uuid, text);
create function public.reject_join_request(req uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.join_requests set status = 'rejected', decided_at = now(),
    decided_by = (select id from public.teachers where user_id = auth.uid() limit 1)
  where id = req and status = 'pending';
end $$;
grant execute on function public.reject_join_request(uuid) to authenticated, service_role;
alter table public.join_requests drop column if exists reject_note;
