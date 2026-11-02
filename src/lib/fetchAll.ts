// Supabase(PostgREST)는 한 번에 최대 1,000줄만 돌려줌 → 1,000줄씩 나눠 끝까지 받음
// 사용: fetchAll(() => supabase.from('scores').select('*').order('created_at', { ascending: false }).order('id'))
// (줄 순서가 매번 같도록 마지막에 .order('id') 를 꼭 붙임)
export async function fetchAll<T = any>(make: () => any, page = 1000): Promise<{ data: T[]; error: any }> {
  const out: T[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1)
    if (error) return { data: out, error }
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) return { data: out, error: null }
  }
}
