-- 2026-11-14 악보·PDF 위에 쓰기 (원장님 "pdf 위에 글을 쓰는 기능" → 1. 본인만 2. 코치가 학생에게 3. 둘 다)
-- 한 줄 = 한 사람이 한 악보의 한 쪽에 쓴 것 전체(선·형광펜·글자 목록)
--   for_student 비어 있음 = 내 메모 (쓴 사람만 봄)
--   for_student 있음     = 코치가 그 학생에게 보여 주는 표시 (쓴 코치 + 그 학생만 봄, 학생은 보기만)
-- 원본 악보·PDF 파일은 건드리지 않음

create table public.score_marks (
  id uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  page int not null check (page between 1 and 5000),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  for_student uuid references public.students(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  author_name text,            -- 학생 화면에 "OOO 코치님 표시"로 보여 줄 이름 (트리거가 채움)
  updated_at timestamptz not null default now(),
  constraint score_marks_size check (pg_column_size(strokes) < 400000),
  constraint score_marks_one unique nulls not distinct (score_id, page, owner_id, for_student)
);
create index score_marks_for_student on public.score_marks (for_student, score_id) where for_student is not null;
create index score_marks_owner on public.score_marks (owner_id, score_id);
alter table public.score_marks enable row level security;

-- 쓴 사람 이름·시각은 서버가 채움 (화면이 보낸 값은 쓰지 않음)
create or replace function public.score_marks_fill() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  new.author_name := coalesce(
    (select t.name from public.teachers t where t.user_id = new.owner_id limit 1),
    (select s.name from public.students s where s.user_id = new.owner_id limit 1));
  return new;
end $$;
create trigger score_marks_fill before insert or update on public.score_marks
  for each row execute function public.score_marks_fill();

-- 보기: 내가 쓴 것 + 코치가 나(학생)에게 쓴 것
create policy "score_marks read" on public.score_marks for select using (
  owner_id = (select auth.uid())
  or (for_student is not null and for_student = (select public.my_student_id())));

-- 쓰기: 내 이름으로만, 볼 수 있는 악보에만. 학생에게 쓰는 표시는 담당 코치(또는 관리자)만
create policy "score_marks add" on public.score_marks for insert with check (
  owner_id = (select auth.uid()) and public.can_read_score(score_id)
  and (for_student is null or public.is_my_student(for_student) or public.is_admin()));
create policy "score_marks change" on public.score_marks for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and (for_student is null or public.is_my_student(for_student) or public.is_admin()));
create policy "score_marks remove" on public.score_marks for delete using (owner_id = (select auth.uid()));

revoke all on public.score_marks from anon;
