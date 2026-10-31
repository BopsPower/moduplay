-- 모두플레이 → 자료 공유 공간으로 전환 (2026-10-31)
-- 과제 기능은 화면에서만 숨기고 테이블(assignments, practice_logs)은 그대로 둡니다.
-- 여러 번 실행해도 같은 결과가 되도록 작성했습니다.

-- 1) 자료 정보 열 추가 ---------------------------------------------------------
alter table public.scores add column if not exists kind text;            -- 카피, 릭, 리듬, 초견, 보이싱·이론, 편곡, 교재, 연습곡, 기타
alter table public.scores add column if not exists level text;           -- 입문, 중급, 고급
alter table public.scores add column if not exists artist text;          -- 원곡 뮤지션
alter table public.scores add column if not exists song text;            -- 원곡 제목
alter table public.scores add column if not exists tags text[] not null default '{}';
alter table public.scores add column if not exists view_only boolean not null default false;  -- 보기 전용(다운로드·프린트 막기)
alter table public.scores add column if not exists youtube_url text;     -- 함께 볼 유튜브 영상
alter table public.scores add column if not exists yt_marks jsonb not null default '[]';      -- [{t:초, label:"설명"}]
alter table public.scores add column if not exists coach_memo text;
alter table public.scores add column if not exists uploader_role text not null default 'coach'; -- coach | student
alter table public.scores add column if not exists uploader_name text;
alter table public.scores add column if not exists hidden boolean not null default false;     -- 코치가 잠시 가린 자료

-- 영상만 올리는 자료는 파일이 없습니다
alter table public.scores alter column file_path drop not null;

-- 공개 범위: students(학원 전체) · mine(올린 코치의 학생) · selected(고른 학생) · coaches(코치끼리)
-- public · assigned 는 예전 값이라 그대로 허용합니다
alter table public.scores drop constraint if exists scores_visibility_check;
alter table public.scores drop constraint if exists scores_visibility_chk; -- 예전 이름
alter table public.scores add constraint scores_visibility_check
  check (visibility in ('students','mine','selected','coaches','public','assigned'));

-- 기존 자료 채우기
update public.scores set kind = case category when '교재' then '교재' when '과제곡' then '연습곡' else coalesce(category, '기타') end
  where kind is null;
update public.scores set view_only = true where category = '교재' and view_only = false;
update public.scores s set uploader_name = t.name
  from public.teachers t where t.user_id = s.created_by and s.uploader_name is null;

create index if not exists scores_kind_idx on public.scores (kind);
create index if not exists scores_created_idx on public.scores (created_at desc);

-- 2) 고른 학생에게만 보이는 자료 ------------------------------------------------
create table if not exists public.score_shares (
  score_id uuid not null references public.scores(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (score_id, student_id)
);
alter table public.score_shares enable row level security;

-- 3) 누가 어떤 자료를 볼 수 있는가 (한 곳에서 판단) ---------------------------
create or replace function public.can_read_score(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.scores s
    where s.id = sid and (
      public.is_teacher()
      or s.created_by = auth.uid()
      or (not s.hidden and public.my_student_id() is not null and (
            s.visibility in ('students', 'public')
         or (s.visibility = 'mine' and exists (
              select 1 from public.students st join public.teachers t on t.id = st.teacher_id
              where st.id = public.my_student_id() and t.user_id = s.created_by))
         or (s.visibility = 'selected' and exists (
              select 1 from public.score_shares sh where sh.score_id = s.id and sh.student_id = public.my_student_id()))
         or (s.visibility = 'assigned' and exists (
              select 1 from public.assignments a where a.score_id = s.id and a.student_id = public.my_student_id()))
      ))
    )
  );
$$;

drop policy if exists "scores: read by visibility" on public.scores;
create policy "scores: read by visibility" on public.scores for select
  using (public.can_read_score(id));

-- 학생도 올릴 수 있어요 (바로 공개)
drop policy if exists "scores: insert" on public.scores;
create policy "scores: insert" on public.scores for insert
  with check (created_by = auth.uid() and (public.is_teacher() or public.my_student_id() is not null));

-- 고치기·지우기: 올린 본인 또는 관리자
drop policy if exists "scores: update" on public.scores;
drop policy if exists "scores: delete" on public.scores;
create policy "scores: update" on public.scores for update
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());
create policy "scores: delete" on public.scores for delete
  using (public.is_admin() or created_by = auth.uid());

-- 올린 사람 정보를 서버에서 채우고, 학생 자료는 '학원 전체' 공개로 고정
create or replace function public.scores_fill_uploader()
returns trigger language plpgsql security definer set search_path = public as $$
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
    -- 학생 이름은 성만 보이게 (예: 김○○)
    new.uploader_name := case when sname is null or sname = '' then '학생' else left(sname, 1) || '○○' end;
    new.visibility := 'students';
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
end $$;
drop trigger if exists scores_fill_uploader on public.scores;
create trigger scores_fill_uploader before insert or update on public.scores
  for each row execute function public.scores_fill_uploader();

-- 코치가 문제 있는 자료를 잠시 가리기 / 다시 보이기
create or replace function public.set_score_hidden(sid uuid, h boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception '코치만 할 수 있어요'; end if;
  update public.scores set hidden = h where id = sid;
end $$;
grant execute on function public.set_score_hidden(uuid, boolean) to authenticated;
grant execute on function public.can_read_score(uuid) to authenticated;

-- score_shares 규칙
drop policy if exists "score_shares: read" on public.score_shares;
drop policy if exists "score_shares: write" on public.score_shares;
create policy "score_shares: read" on public.score_shares for select
  using (public.is_teacher() or student_id = public.my_student_id());
create policy "score_shares: write" on public.score_shares for all
  using (public.is_admin() or exists (select 1 from public.scores s where s.id = score_id and s.created_by = auth.uid() and public.is_teacher()))
  with check (public.is_admin() or exists (select 1 from public.scores s where s.id = score_id and s.created_by = auth.uid() and public.is_teacher()));

-- 4) 파일 저장소 ---------------------------------------------------------------
drop policy if exists "scores bucket: teacher upload" on storage.objects;
drop policy if exists "scores bucket: member upload" on storage.objects;
create policy "scores bucket: member upload" on storage.objects for insert
  with check (bucket_id = 'scores' and (public.is_teacher() or public.my_student_id() is not null));

drop policy if exists "scores bucket: read by visibility" on storage.objects;
create policy "scores bucket: read by visibility" on storage.objects for select
  using (bucket_id = 'scores' and (public.is_teacher() or owner_id = auth.uid()::text or exists (
    select 1 from public.scores s
    where (s.file_path = objects.name or objects.name like 'out/' || s.id::text || '/%')
      and public.can_read_score(s.id))));

-- 5) 질문·댓글 -----------------------------------------------------------------
create table if not exists public.score_comments (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  is_coach boolean not null default false,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists score_comments_score_idx on public.score_comments (score_id, created_at);
alter table public.score_comments enable row level security;

create or replace function public.comments_fill_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare tname text; sname text;
begin
  new.user_id := auth.uid();
  select name into tname from public.teachers where user_id = auth.uid() and active;
  if tname is not null then
    new.is_coach := true; new.author_name := tname;
  else
    select name into sname from public.students where id = public.my_student_id();
    new.is_coach := false;
    new.author_name := case when sname is null or sname = '' then '학생' else left(sname, 1) || '○○' end;
  end if;
  return new;
end $$;
drop trigger if exists comments_fill_author on public.score_comments;
create trigger comments_fill_author before insert on public.score_comments
  for each row execute function public.comments_fill_author();

drop policy if exists "score_comments: read" on public.score_comments;
drop policy if exists "score_comments: insert" on public.score_comments;
drop policy if exists "score_comments: delete" on public.score_comments;
create policy "score_comments: read" on public.score_comments for select using (public.can_read_score(score_id));
create policy "score_comments: insert" on public.score_comments for insert
  with check (auth.uid() is not null and public.can_read_score(score_id));
create policy "score_comments: delete" on public.score_comments for delete
  using (user_id = auth.uid() or public.is_teacher());

-- 6) 내 보관함 -----------------------------------------------------------------
create table if not exists public.score_bookmarks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score_id uuid not null references public.scores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, score_id)
);
alter table public.score_bookmarks enable row level security;
drop policy if exists "score_bookmarks: own" on public.score_bookmarks;
create policy "score_bookmarks: own" on public.score_bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7) 신고 ----------------------------------------------------------------------
create table if not exists public.score_reports (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.score_reports enable row level security;
drop policy if exists "score_reports: insert" on public.score_reports;
drop policy if exists "score_reports: coach read" on public.score_reports;
drop policy if exists "score_reports: coach update" on public.score_reports;
create policy "score_reports: insert" on public.score_reports for insert
  with check (user_id = auth.uid() and public.can_read_score(score_id));
create policy "score_reports: coach read" on public.score_reports for select using (public.is_teacher());
create policy "score_reports: coach update" on public.score_reports for update
  using (public.is_teacher()) with check (public.is_teacher());

-- 8) 자료 요청 ("이런 자료 있으면 좋겠어요") -----------------------------------
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text,
  is_coach boolean not null default false,
  body text not null check (char_length(body) between 1 and 500),
  done boolean not null default false,
  done_score_id uuid references public.scores(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.material_requests enable row level security;
drop trigger if exists requests_fill_author on public.material_requests;
create trigger requests_fill_author before insert on public.material_requests
  for each row execute function public.comments_fill_author();
drop policy if exists "material_requests: read" on public.material_requests;
drop policy if exists "material_requests: insert" on public.material_requests;
drop policy if exists "material_requests: update" on public.material_requests;
drop policy if exists "material_requests: delete" on public.material_requests;
create policy "material_requests: read" on public.material_requests for select
  using (public.is_teacher() or public.my_student_id() is not null);
create policy "material_requests: insert" on public.material_requests for insert
  with check (auth.uid() is not null and (public.is_teacher() or public.my_student_id() is not null));
create policy "material_requests: update" on public.material_requests for update
  using (public.is_teacher() or user_id = auth.uid()) with check (public.is_teacher() or user_id = auth.uid());
create policy "material_requests: delete" on public.material_requests for delete
  using (public.is_teacher() or user_id = auth.uid());
