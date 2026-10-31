// 연습 도구(메트로놈 · 스톱워치/타이머 · 횟수 세기)를 앱 전체에서 하나로 관리.
// 화면을 옮겨도 계속 돌아가도록 페이지 밖(App)에 둠.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToolTab = 'metro' | 'watch' | 'reps'
type WatchMode = 'up' | 'down' // 스톱워치(올라감) / 타이머(거꾸로)

type Tools = {
  open: boolean; tab: ToolTab
  show: (tab?: ToolTab) => void; hide: () => void; setTab: (t: ToolTab) => void
  // 메트로놈
  bpm: number; setBpm: (n: number) => void; beats: number; setBeats: (n: number) => void
  metroOn: boolean; beat: number; toggleMetro: () => void; tap: () => void
  // 스톱워치·타이머
  mode: WatchMode; setMode: (m: WatchMode) => void; minutes: number; setMinutes: (m: number) => void
  running: boolean; ms: number; startWatch: () => void; pauseWatch: () => void; resetWatch: () => void
  // 횟수
  reps: number; setReps: (n: number) => void; target: number; setTarget: (n: number) => void
  autoRep: boolean; setAutoRep: (b: boolean) => void
}

const Ctx = createContext<Tools | null>(null)
export const useTools = () => useContext(Ctx)!

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('mp_tools_' + k); return v == null ? d : JSON.parse(v) } catch { return d } }
const save = (k: string, v: unknown) => { try { localStorage.setItem('mp_tools_' + k, JSON.stringify(v)) } catch { /* 저장 안 돼도 동작 */ } }

export function ToolsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ToolTab>('metro')

  // ── 공용 소리 ──
  const ctxRef = useRef<AudioContext | null>(null)
  const audio = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    ctxRef.current.resume()
    return ctxRef.current
  }

  // ── 메트로놈 ──
  const [bpm, setBpmS] = useState<number>(() => load('bpm', 100))
  const [beats, setBeatsS] = useState<number>(() => load('beats', 4))
  const [metroOn, setMetroOn] = useState(false)
  const [beat, setBeat] = useState(-1)
  const bpmRef = useRef(bpm), beatsRef = useRef(beats)
  const setBpm = (n: number) => { const v = Math.max(30, Math.min(240, Math.round(n))); bpmRef.current = v; setBpmS(v); save('bpm', v) }
  const setBeats = (n: number) => { beatsRef.current = n; setBeatsS(n); save('beats', n) }
  const timerRef = useRef<number | null>(null), nextRef = useRef(0), countRef = useRef(0)
  const taps = useRef<number[]>([])

  const click = (ctx: AudioContext, t: number, accent: boolean) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = accent ? 1600 : 1000
    g.gain.setValueAtTime(accent ? 0.5 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06)
  }
  const toggleMetro = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; setMetroOn(false); setBeat(-1); return }
    const ctx = audio()
    nextRef.current = ctx.currentTime + 0.05; countRef.current = 0
    // 100ms마다 앞으로 0.15초 분량을 미리 예약 (브라우저 타이머 흔들림 방지)
    timerRef.current = window.setInterval(() => {
      while (nextRef.current < ctx.currentTime + 0.15) {
        const i = countRef.current % beatsRef.current
        click(ctx, nextRef.current, i === 0)
        const at = nextRef.current
        window.setTimeout(() => setBeat(i), Math.max(0, (at - ctx.currentTime) * 1000))
        nextRef.current += 60 / bpmRef.current
        countRef.current++
      }
    }, 100)
    setMetroOn(true)
  }, [])
  const tap = () => {
    const now = Date.now()
    taps.current = taps.current.filter(t => now - t < 2500).concat(now)
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i])
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))
    }
  }

  // ── 횟수 ──
  const [reps, setRepsS] = useState<number>(0)
  const [target, setTargetS] = useState<number>(() => load('target', 10))
  const [autoRep, setAutoRepS] = useState<boolean>(() => load('autoRep', true))
  const setReps = (n: number) => setRepsS(Math.max(0, n))
  const setTarget = (n: number) => { setTargetS(n); save('target', n) }
  const setAutoRep = (b: boolean) => { setAutoRepS(b); save('autoRep', b) }
  const autoRef = useRef(autoRep); useEffect(() => { autoRef.current = autoRep }, [autoRep])

  // ── 스톱워치·타이머 ──
  const [mode, setModeS] = useState<WatchMode>(() => load('mode', 'up'))
  const [minutes, setMinutesS] = useState<number>(() => load('minutes', 3))
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0) // 스톱워치: 지난 시간 / 타이머: 남은 시간
  const baseRef = useRef(0) // 스톱워치: 멈출 때까지 쌓인 시간, 타이머: 남은 시간
  const startRef = useRef(0)
  const total = minutes * 60000

  useEffect(() => { if (!running) setMs(mode === 'up' ? baseRef.current : (baseRef.current || total)) }, [mode, minutes])

  const beep = () => {
    const ctx = audio()
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.25, o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880; g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.22)
    }
  }
  useEffect(() => {
    if (!running) return
    const iv = window.setInterval(() => {
      const passed = performance.now() - startRef.current
      if (mode === 'up') setMs(baseRef.current + passed)
      else {
        const left = baseRef.current - passed
        if (left <= 0) {
          setMs(0); setRunning(false); baseRef.current = 0; beep()
          if (autoRef.current) setRepsS(r => r + 1)
        } else setMs(left)
      }
    }, 100)
    return () => clearInterval(iv)
  }, [running, mode])

  const startWatch = () => {
    audio() // 타이머 끝 소리를 위해 누른 순간 소리 준비
    if (mode === 'down' && baseRef.current <= 0) baseRef.current = total
    startRef.current = performance.now(); setRunning(true)
  }
  const pauseWatch = () => {
    const passed = performance.now() - startRef.current
    baseRef.current = mode === 'up' ? baseRef.current + passed : Math.max(0, baseRef.current - passed)
    setMs(baseRef.current); setRunning(false)
  }
  const resetWatch = () => { setRunning(false); baseRef.current = mode === 'up' ? 0 : total; setMs(baseRef.current) }
  const setMode = (m: WatchMode) => { if (running) return; setModeS(m); save('mode', m); baseRef.current = m === 'up' ? 0 : minutes * 60000; setMs(baseRef.current) }
  const setMinutes = (m: number) => { if (running) return; setMinutesS(m); save('minutes', m); if (mode === 'down') { baseRef.current = m * 60000; setMs(baseRef.current) } }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const value = useMemo<Tools>(() => ({
    open, tab, show: (t?: ToolTab) => { if (t) setTab(t); setOpen(true) }, hide: () => setOpen(false), setTab,
    bpm, setBpm, beats, setBeats, metroOn, beat, toggleMetro, tap,
    mode, setMode, minutes, setMinutes, running, ms, startWatch, pauseWatch, resetWatch,
    reps, setReps, target, setTarget, autoRep, setAutoRep,
  }), [open, tab, bpm, beats, metroOn, beat, mode, minutes, running, ms, reps, target, autoRep])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const fmtWatch = (ms: number, withTenth = false) => {
  const t = Math.max(0, ms), s = Math.floor(t / 1000)
  const base = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return withTenth ? `${base}.${Math.floor((t % 1000) / 100)}` : base
}
