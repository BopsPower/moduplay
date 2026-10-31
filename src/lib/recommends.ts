// 코치 추천(⭐): 코치가 골라서 누른 곡만. 한 번 불러와 여러 화면이 같이 씀
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type Row = { score_id: string; user_id: string; coach_name: string }
let cache: Map<string, Row[]> | null = null
let loading: Promise<void> | null = null
const subs = new Set<() => void>()

export function refreshRecommends() {
  loading = (async () => {
    const all: Row[] = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from('score_recommends').select('score_id, user_id, coach_name').range(from, from + 999)
      if (error || !data) break // 표가 아직 없으면 조용히 비워 둠
      all.push(...(data as Row[]))
      if (data.length < 1000) break
    }
    const m = new Map<string, Row[]>()
    for (const r of all) m.set(r.score_id, [...(m.get(r.score_id) ?? []), r])
    cache = m
    subs.forEach(f => f())
  })()
  return loading
}

export function useRecommends() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick(n => n + 1)
    subs.add(f)
    if (!cache && !loading) refreshRecommends()
    return () => { subs.delete(f) }
  }, [])
  return cache
}

/** "○○ 코치 추천" / "○○ 코치 외 2명 추천" */
export function recommendLabel(rows: Row[] | undefined, coachLabel: (n: string) => string) {
  if (!rows?.length) return null
  const first = coachLabel(rows[0].coach_name || '코치')
  return rows.length > 1 ? `${first} 외 ${rows.length - 1}명 추천` : `${first} 추천`
}

export async function setRecommend(scoreId: string, uid: string, on: boolean) {
  const { error } = on
    ? await supabase.from('score_recommends').insert({ score_id: scoreId })
    : await supabase.from('score_recommends').delete().eq('score_id', scoreId).eq('user_id', uid)
  await refreshRecommends()
  return error
}
