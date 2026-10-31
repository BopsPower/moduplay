-- 자료 분류 바꾸기 (2026-10-31): "형태" 하나 + "연습 영역" 여러 개
-- 형태: 카피 악보 · 곡 악보 · 연습 악보 · 반주·MR · 가이드 녹음 · 시범 영상 · 정리표 · 교재 · 기타
-- 영역: 리듬 · 악보 읽기 · 귀 훈련 · 코드·화성 · 테크닉 · 즉흥·릭 · 곡 표현
alter table public.scores add column if not exists areas text[] not null default '{}';

-- 예전 종류 → 새 형태·영역 (한 번에 바꿈: 오른쪽 값은 모두 바꾸기 전 값 기준)
update public.scores set
  areas = case kind
    when '릭' then array['즉흥·릭']
    when '리듬' then array['리듬']
    when '초견' then array['악보 읽기']
    when '보이싱·이론' then array['코드·화성']
    else areas end,
  kind = case kind
    when '카피' then '카피 악보'
    when '릭' then '연습 악보'
    when '리듬' then '연습 악보'
    when '초견' then '연습 악보'
    when '보이싱·이론' then '정리표'
    when '편곡' then '곡 악보'
    when '연습곡' then '곡 악보'
    else kind end
where kind in ('카피','릭','리듬','초견','보이싱·이론','편곡','연습곡');

create index if not exists scores_areas_idx on public.scores using gin (areas);
