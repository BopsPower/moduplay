// 내 연습 기록: 연습 도구·악보 재생·연습 플레이어·유튜브를 쓰는 동안 시간이 저절로 쌓임.
// 기록은 본인만 볼 수 있음 (코치·관리자도 못 봄). 버튼을 따로 누를 필요 없음.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { celebrate } from './celebrate'

type Day = { day: string; seconds: number }
type Practice = {
  todaySec: number
  goalMin: number; setGoalMin: (m: number) => void
  days: Day[]; reload: () => Promise<void>
  /** 이 화면에서 지금 연습 중인지 알려 주기 (key별로 켜고 끔) */
  setActive: (key: string, on: boolean) => void
  active: boolean
}
const Ctx = createContext<Practice | null>(null)
export const usePractice = () => useContext(Ctx)!

/** 화면 쪽에서 쓰기: usePracticeActive('score-audio', playing) */
export function usePracticeActive(key: string, on: boolean) {
  const p = useContext(Ctx)
  useEffect(() => { p?.setActive(key, on); return () => p?.setActive(key, false) }, [key, on])
}

const TICK = 5 // 초
export const seoulDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 무시 */ } }

export function PracticeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [days, setDays] = useState<Day[]>([])
  const [todaySec, setTodaySec] = useState(0)
  const [goalMin, setGoalMinS] = useState<number>(() => Number(lsGet('mp_goal_min')) || 20)
  const [active, setActiveS] = useState(false)
  const sources = useRef(new Set<string>())
  const pending = useRef(0)
  const todayRef = useRef(0)
  const goalRef = useRef(goalMin)
  useEffect(() => { goalRef.current = goalMin }, [goalMin])

  const reload = useCallback(async () => {
    if (!uid) return
    const since = new Date(Date.now() - 400 * 86400 * 1000).toISOString().slice(0, 10)
    const { data } = await supabase.from('practice_days').select('day, seconds').gte('day', since).order('day')
    const list = (data ?? []) as Day[]
    setDays(list)
    const t = list.find(d => d.day === seoulDay())?.seconds ?? 0
    todayRef.current = t + pending.current
    setTodaySec(todayRef.current)
  }, [uid])
  useEffect(() => { reload() }, [reload])

  const flush = useCallback(async () => {
    const s = pending.current
    if (!uid || s < 1) return
    pending.current = 0
    const { error } = await supabase.rpc('add_practice_seconds', { sec: s })
    if (error) pending.current += s // 다음에 다시 보냄
  }, [uid])

  const setActive = useCallback((key: string, on: boolean) => {
    if (on) sources.current.add(key); else sources.current.delete(key)
    setActiveS(sources.current.size > 0)
  }, [])

  // 5초마다: 연습 중이면 시간 더하기, 1분 모이면 서버에 저장
  useEffect(() => {
    if (!uid) return
    const iv = window.setInterval(() => {
      if (sources.current.size === 0 || document.visibilityState === 'hidden' && !sources.current.has('metro') && !sources.current.has('watch')) return
      const before = todayRef.current
      pending.current += TICK
      todayRef.current += TICK
      setTodaySec(todayRef.current)
      // 오늘 목표 달성: 하루 한 번 축하
      const goal = goalRef.current * 60
      const key = 'mp_goal_done_' + seoulDay()
      if (before < goal && todayRef.current >= goal && !lsGet(key)) { lsSet(key, '1'); celebrate(`오늘 목표 ${goalRef.current}분 달성!`) }
      if (pending.current >= 60) flush()
    }, TICK * 1000)
    const bye = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', bye)
    window.addEventListener('pagehide', flush)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', bye); window.removeEventListener('pagehide', flush); flush() }
  }, [uid, flush])

  // 날짜가 바뀌면 오늘 시간을 0부터
  useEffect(() => {
    const iv = window.setInterval(() => { const d = seoulDay(); if (d !== lsGet('mp_today')) { lsSet('mp_today', d); reload() } }, 60000)
    return () => clearInterval(iv)
  }, [reload])

  const setGoalMin = (m: number) => { setGoalMinS(m); lsSet('mp_goal_min', String(m)) }

  // 서버 기록 + 아직 안 보낸 오늘 시간
  const merged = (() => {
    const today = seoulDay()
    const map = new Map(days.map(d => [d.day, d.seconds]))
    map.set(today, Math.max(map.get(today) ?? 0, todaySec))
    return [...map.entries()].map(([day, seconds]) => ({ day, seconds })).sort((a, b) => a.day.localeCompare(b.day))
  })()

  return <Ctx.Provider value={{ todaySec, goalMin, setGoalMin, days: merged, reload, setActive, active }}>{children}</Ctx.Provider>
}

const MIN_DAY = 60 // 하루 1분 이상이면 연습한 날
/** 연속 연습: 하루 쉬어도 이어지고, 이틀 연속 쉬면 처음부터 */
export function streakOf(days: Day[]) {
  const set = new Set(days.filter(d => d.seconds >= MIN_DAY).map(d => d.day))
  let count = 0, gap = 0
  const d = new Date(seoulDay() + 'T00:00:00Z')
  if (!set.has(seoulDay())) d.setUTCDate(d.getUTCDate() - 1) // 오늘 아직 안 했으면 어제부터
  for (let i = 0; i < 400; i++) {
    const k = d.toISOString().slice(0, 10)
    if (set.has(k)) { count++; gap = 0 } else { gap++; if (gap >= 2) break }
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return count
}

export const fmtMin = (sec: number) => {
  const m = Math.floor(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`
}
