// 내 템포 사다리 진행 상황을 목록 화면에서 함께 쓰기 (한 번만 불러와 공유)
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type Row = { score_id: string; goal_bpm: number; best_bpm: number | null; done_at: string | null }
let cache: Map<string, Row> | null = null
let loading: Promise<void> | null = null
const subs = new Set<() => void>()

export function refreshLadders() {
  loading = supabase.from('tempo_ladders').select('score_id, goal_bpm, best_bpm, done_at').then(({ data }) => {
    cache = new Map((data ?? []).map(r => [r.score_id as string, r as Row]))
    subs.forEach(f => f())
  }) as unknown as Promise<void>
  return loading
}

export function useMyLadders() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick(n => n + 1)
    subs.add(f)
    if (!cache && !loading) refreshLadders()
    return () => { subs.delete(f) }
  }, [])
  return cache
}
