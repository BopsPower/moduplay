-- 2026-11-06 원장님 결정
--  1) 악기 나누기: 내 음원 하루 3곡 → 10곡 ("10곡으로 하자")
--  2) 📤 코치님께 보내기: 학생이 고른 코치님에게만 보이는 자료 (공개 범위 'sent' + 받는 코치 표 score_sends)
--     - 학원 전체·다른 코치·다른 학생은 못 봄. 관리자는 지금처럼 모두 봄
--     - 받은 코치님은 열어 보고(봤어요 표시) 댓글로 의견
begin;

-- 1) 하루 10곡 (나머지 조건은 그대로)
alter policy "stem_jobs add" on public.stem_jobs with check (
  created_by = (select auth.uid()) and status = 'queued' and stems is null and (
    (source_bucket = 'scores' and score_id is not null and public.can_read_score(score_id)
      and exists (select 1 from public.scores s where s.id = stem_jobs.score_id and (stem_jobs.source_path = s.file_path or stem_jobs.source_path = s.mp3_path)))
    or (source_bucket = 'my-audio' and score_id is null and split_part(source_path, '/', 1) = (select auth.uid())::text
      and (public.is_admin() or public.my_stem_jobs_today() < 10))
  )
);

-- 2-1) 공개 범위에 'sent' 추가
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores add constraint scores_visibility_check
  check (visibility = any (array['students','mine','selected','coaches','public','assigned','admin','review','sent']));

-- 2-2) 받는 코치님
create table if not exists public.score_sends (
  score_id uuid not null references public.scores(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (score_id, teacher_id)
);
create index if not exists score_sends_teacher_idx on public.score_sends (teacher_id, created_at desc);
alter table public.score_sends enable row level security;
revoke all on public.score_sends from anon;
revoke update on public.score_sends from authenticated;
grant select, insert, delete on public.score_sends to authenticated;
grant update (seen_at) on public.score_sends to authenticated; -- 코치님은 '봤어요' 시각만 바꿀 수 있음

create or replace function public.is_sent_to_me(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.score_sends x where x.score_id = sid and x.teacher_id = public.my_teacher_id())
$$;
create or replace function public.my_sent_score(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.scores s where s.id = sid and s.created_by = auth.uid() and s.visibility = 'sent')
$$;
create or replace function public.is_active_coach(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t where t.id = tid and t.active and t.role = 'teacher')
$$;

create policy "score_sends: read" on public.score_sends for select to authenticated
  using (public.is_admin() or teacher_id = public.my_teacher_id() or public.my_sent_score(score_id));
create policy "score_sends: add" on public.score_sends for insert to authenticated
  with check (public.my_sent_score(score_id) and public.is_active_coach(teacher_id));
create policy "score_sends: seen" on public.score_sends for update to authenticated
  using (teacher_id = public.my_teacher_id()) with check (teacher_id = public.my_teacher_id());
create policy "score_sends: delete" on public.score_sends for delete to authenticated
  using (public.is_admin() or public.my_sent_score(score_id));

-- 2-3) 학생이 고를 코치님 목록 (학생은 teachers 표를 못 읽음 → 이름·전공만 돌려줌). 내 코치님 먼저
create or replace function public.send_coaches() returns table(id uuid, name text, majors text[], mine boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.majors,
    exists (select 1 from public.student_teachers st where st.teacher_id = t.id and st.student_id = public.my_student_id())
  from public.teachers t
  where t.active and t.role = 'teacher' and (public.my_student_id() is not null or public.is_teacher())
  order by 4 desc, t.name
$$;
revoke execute on function public.send_coaches() from anon;

-- 2-4) 읽기 규칙: 'sent'는 보낸 사람 · 받은 코치님 · 관리자만
create or replace function public.can_read_score(sid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.scores s
    where s.id = sid and (
      public.is_admin()
      or (public.is_teacher() and s.visibility not in ('admin', 'review', 'sent'))
      or (public.is_teacher() and s.visibility = 'review' and s.major = any(public.my_majors()))
      or (s.visibility = 'sent' and public.is_sent_to_me(s.id))
      or s.created_by = auth.uid()
      or (not s.hidden and public.my_student_id() is not null and (
            s.visibility in ('students', 'public')
         or (s.visibility = 'mine' and exists (
              select 1 from public.student_teachers stt
              join public.teachers t on t.id = stt.teacher_id
              where stt.student_id = public.my_student_id() and t.user_id = s.created_by))
         or (s.visibility = 'selected' and exists (
              select 1 from public.score_shares sh where sh.score_id = s.id and sh.student_id = public.my_student_id()))
         or (s.visibility = 'assigned' and exists (
              select 1 from public.assignments a where a.score_id = s.id and a.student_id = public.my_student_id()))
      ))
    )
  );
$function$;

alter policy "scores: read by visibility" on public.scores using (
  (select public.is_admin())
  or ((select public.is_teacher()) and visibility <> all (array['admin','review','sent']))
  or ((select public.is_teacher()) and visibility = 'review' and array[major] <@ (select public.my_majors()))
  or created_by = (select auth.uid())
  or (visibility <> all (array['admin','review']) and public.can_read_score(id))
);

-- 2-5) 파일: 코치는 원래 대부분 파일을 읽을 수 있음 → 'sent'는 받은 코치님만
create or replace function public.score_file_blocked_for_teacher(obj text) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.scores s
    where (case when obj like 'out/%' then s.id::text = split_part(obj, '/', 2) else s.file_path = obj end)
      and (
        (s.visibility in ('admin', 'review') and not (s.visibility = 'review' and s.major = any(public.my_majors())))
        or (s.visibility = 'sent' and not public.is_sent_to_me(s.id))
      )
  )
$function$;

-- 2-6) (시험에서 발견) 학생이 올린 자료는 트리거가 '학원 전체'로 바꿈 → '보낸 자료'(sent)만 그대로 두기
--      (원장님 따로 승인 후 실행: 2026-11-06)
create or replace function public.scores_fill_uploader() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare tname text; sname text;
begin
  if public.is_teacher() then
    if tg_op = 'INSERT' then
      select name into tname from public.teachers where user_id = auth.uid();
      new.uploader_role := 'coach';
      new.uploader_name := coalesce(tname, new.uploader_name);
    end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;  -- 서버 작업(변환기 등)은 그대로
  if tg_op = 'INSERT' then
    select name into sname from public.students where id = public.my_student_id();
    new.uploader_role := 'student';
    new.uploader_name := case when sname is null or sname = '' then '학생' else left(sname, 1) || '○○' end;
    new.visibility := case when new.visibility = 'sent' then 'sent' else 'students' end; -- 📤 코치님께 보내기만 예외
    new.hidden := false;
    new.coach_memo := null;
    if new.kind = '교재' then new.kind := '기타'; end if;
    if new.category = '교재' then new.category := '연습곡'; end if;
  else
    new.visibility := old.visibility;
    new.hidden := old.hidden;
    new.coach_memo := old.coach_memo;
    new.uploader_role := old.uploader_role;
    new.uploader_name := old.uploader_name;
    if new.kind = '교재' and old.kind is distinct from '교재' then new.kind := old.kind; end if;
  end if;
  return new;
end $function$;

commit;
