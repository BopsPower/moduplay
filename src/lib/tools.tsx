// 연습 도구(메트로놈 · 스톱워치/타이머 · 횟수 세기 · 튜너 · 반주(드럼 루프·드론))를 앱 전체에서 하나로 관리.
// 화면을 옮겨도 계속 돌아가도록 페이지 밖(App)에 둠.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePracticeActive } from './practice'
import { celebrate } from './celebrate'
import { IS_WEBKIT, audioOk, audioReport, closeAudio, playbackSession, resetAllAudio, trackAudio, unlockAudio } from './iosAudio'
import { logError } from './errorLog'
import { DronePlayer, GROOVES, GroovePlayer, noteFreq, type GrooveId } from './backing'

export type ToolTab = 'metro' | 'watch' | 'reps' | 'tuner' | 'backing'
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
  reps: number; setReps: (n: number) => void; addRep: (d: number) => void; target: number; setTarget: (n: number) => void
  autoRep: boolean; setAutoRep: (b: boolean) => void
  // 드럼 루프 (메트로놈과 같은 빠르기)
  grooveOn: boolean; groove: GrooveId; setGroove: (g: GrooveId) => void; toggleGroove: () => void; grooveVol: number; setGrooveVol: (v: number) => void
  swing: number; setSwing: (v: number) => void // 0 똑바로 ~ 1 셋잇단처럼
  room: number; setRoom: (v: number) => void // 드럼 울림(공간감) 0 짧고 단단하게 ~ 1 녹음 그대로
  // 드론 (기준음)
  droneOn: boolean; droneNote: number; setDroneNote: (n: number) => void; droneOct: number; setDroneOct: (o: number) => void
  droneFifth: boolean; setDroneFifth: (b: boolean) => void; droneVol: number; setDroneVol: (v: number) => void; toggleDrone: () => void
  notice: string // 소리 장치를 다시 준비했을 때 안내
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
  const [notice, setNotice] = useState('')
  // 지금 무엇이든 울리는 중인지 (울리는 중엔 장치를 바꾸지 않음)
  const busy = () => !!timerRef.current || grooveOnRef.current || droneOnRef.current
  // 모두 닫기(resetAllAudio) 때: 다 멈추고 참조를 지움 → 다음에 누를 때 새 장치
  const dropAll = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setMetroOn(false); setBeat(-1)
    gp.current?.close(); gp.current = null; grooveOnRef.current = false; setGrooveOn(false)
    dp.current?.stop(); dp.current = null; droneOnRef.current = false; setDroneOn(false)
    ctxRef.current = null
  }
  const audio = () => {
    playbackSession()
    setNotice('')
    let c = ctxRef.current
    // 사파리·아이패드: 쉬는 동안 멈춘(시계가 안 가는) 장치는 버리고 누른 그 순간 새로 만듦
    if (c && IS_WEBKIT && !busy() && !audioOk(c)) {
      gp.current?.close(); gp.current = null; dp.current?.stop(); dp.current = null
      closeAudio(c); c = null; ctxRef.current = null
    }
    if (!c) { c = new (window.AudioContext || (window as any).webkitAudioContext)() as AudioContext; ctxRef.current = c; trackAudio(c, 'tools', dropAll) }
    if (IS_WEBKIT) unlockAudio(c); else c.resume()
    return c
  }
  // 켠 뒤 1.5초 동안 시계가 안 가면: 앱의 모든 소리 장치를 닫고 한 번 더 누르게 함
  const watch = (ctx: AudioContext) => {
    const t0 = ctx.currentTime
    window.setTimeout(() => {
      if (ctxRef.current !== ctx || !busy() || ctx.currentTime - t0 >= 0.3) return
      logError('sound-diag', new Error(`tools clock stuck: ${audioReport()}`))
      resetAllAudio()
      setNotice('소리가 멈춰서 다시 준비했어요. 한 번 더 눌러 주세요.')
    }, 1500)
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
    stopGrooveRef.current() // 드럼 루프와 메트로놈은 같이 안 울림 (박이 겹쳐 헷갈림)
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
    watch(ctx)
  }, [])
  // ── 드럼 루프 ──
  const [grooveOn, setGrooveOn] = useState(false)
  const [groove, setGrooveS] = useState<GrooveId>(() => load('groove', 'rock'))
  const [grooveVol, setGrooveVolS] = useState<number>(() => load('grooveVol', 0.8))
  const grooveRef = useRef(groove); useEffect(() => { grooveRef.current = groove }, [groove])
  const [swing, setSwingS] = useState<number>(() => load('swing', GROOVES.find(g => g.id === load('groove', 'rock'))?.swing ?? 0))
  const swingRef = useRef(swing)
  const setSwing = (v: number) => { const x = Math.max(0, Math.min(1, v)); swingRef.current = x; setSwingS(x); save('swing', x) }
  // 드럼 울림: 처음엔 녹음보다 40% 줄인 0.6 (원장님 2026-11-04 "공간감이 40% 적었으면")
  const [room, setRoomS] = useState<number>(() => load('room', 0.6))
  const roomRef = useRef(room)
  const setRoom = (v: number) => { const x = Math.max(0, Math.min(1, v)); roomRef.current = x; setRoomS(x); save('room', x) }
  const gp = useRef<GroovePlayer | null>(null)
  const grooveOnRef = useRef(false)
  const stopGroove = () => { gp.current?.stop(); grooveOnRef.current = false; setGrooveOn(false) }
  const stopGrooveRef = useRef(stopGroove); stopGrooveRef.current = stopGroove
  const toggleGroove = () => {
    if (grooveOn) return stopGroove()
    const ctx = audio()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; setMetroOn(false); setBeat(-1) } // 메트로놈은 끔
    if (!gp.current) gp.current = new GroovePlayer(ctx, () => bpmRef.current, () => GROOVES.find(g => g.id === grooveRef.current) ?? GROOVES[0], () => swingRef.current, grooveVol, () => roomRef.current)
    const p = gp.current
    grooveOnRef.current = true; setGrooveOn(true)
    watch(ctx)
    if (p.kit) { p.start(); return }
    // 처음 한 번: 실제 드럼 녹음을 받아 옴 (최대 3초 기다리고, 늦으면 만든 소리로 먼저 시작 → 받으면 바로 바뀜)
    let started = false
    const go = () => { if (!started && grooveOnRef.current) { started = true; p.start() } }
    const wait = window.setTimeout(go, 3000)
    import('./sampler').then(m => m.loadFont(ctx, m.DRUMS)).then(kit => { p.kit = kit }).catch(() => { /* 만든 소리로 계속 */ }).finally(() => { clearTimeout(wait); go() })
  }
  // 리듬을 바꾸면 그 리듬에 어울리는 스윙으로 (셔플·재즈는 튀게, 록·팝은 똑바로) — 바꾼 뒤에 스윙 단추로 조절
  const setGroove = (g: GrooveId) => { setGrooveS(g); grooveRef.current = g; save('groove', g); setSwing(GROOVES.find(x => x.id === g)?.swing ?? 0) }
  const setGrooveVol = (v: number) => { setGrooveVolS(v); save('grooveVol', v); gp.current?.setVolume(v) }

  // ── 드론 (한 음을 계속 울림) ──
  const [droneOn, setDroneOn] = useState(false)
  const [droneNote, setDroneNoteS] = useState<number>(() => load('droneNote', 0))
  const [droneOct, setDroneOctS] = useState<number>(() => load('droneOct', 3))
  const [droneFifth, setDroneFifthS] = useState<boolean>(() => load('droneFifth', false))
  const [droneVol, setDroneVolS] = useState<number>(() => load('droneVol', 0.5))
  const dp = useRef<DronePlayer | null>(null)
  const playDrone = (n: number, o: number, f: boolean) => {
    const ctx = audio()
    if (!dp.current) dp.current = new DronePlayer(ctx, droneVol)
    dp.current.start(noteFreq(n, o), f); droneOnRef.current = true; setDroneOn(true)
    watch(ctx)
  }
  const droneOnRef = useRef(false)
  const toggleDrone = () => { if (droneOn) { dp.current?.stop(); droneOnRef.current = false; setDroneOn(false) } else playDrone(droneNote, droneOct, droneFifth) }
  const setDroneNote = (n: number) => { setDroneNoteS(n); save('droneNote', n); if (droneOn) playDrone(n, droneOct, droneFifth) }
  const setDroneOct = (o: number) => { setDroneOctS(o); save('droneOct', o); if (droneOn) playDrone(droneNote, o, droneFifth) }
  const setDroneFifth = (f: boolean) => { setDroneFifthS(f); save('droneFifth', f); if (droneOn) playDrone(droneNote, droneOct, f) }
  const setDroneVol = (v: number) => { setDroneVolS(v); save('droneVol', v); dp.current?.setVolume(v) }

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
  const repsRef = useRef(reps); useEffect(() => { repsRef.current = reps }, [reps])
  const targetRef = useRef(target); useEffect(() => { targetRef.current = target }, [target])

  // ── 스톱워치·타이머 ──
  const [mode, setModeS] = useState<WatchMode>(() => load('mode', 'up'))
  const [minutes, setMinutesS] = useState<number>(() => load('minutes', 3))
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0) // 스톱워치: 지난 시간 / 타이머: 남은 시간
  const baseRef = useRef(0) // 스톱워치: 멈출 때까지 쌓인 시간, 타이머: 남은 시간
  const startRef = useRef(0)
  const total = minutes * 60000
  const minutesRef = useRef(minutes); useEffect(() => { minutesRef.current = minutes }, [minutes])

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
          beep()
          // 세트 연습: 끝날 때마다 1회 올리고, 목표 횟수 전이면 타이머를 바로 다시 시작
          if (autoRef.current && repsRef.current + 1 < targetRef.current) {
            setRepsS(r => r + 1); repsRef.current += 1
            baseRef.current = minutesRef.current * 60000; startRef.current = performance.now(); setMs(baseRef.current)
          } else {
            setMs(0); setRunning(false); baseRef.current = 0
            if (autoRef.current) { setRepsS(r => r + 1); repsRef.current += 1 }
          }
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

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); gp.current?.close(); dp.current?.stop() }, [])

  // 메트로놈·스톱워치를 쓰는 동안은 연습 시간으로 쌓임
  usePracticeActive('metro', metroOn)
  usePracticeActive('watch', running)
  usePracticeActive('groove', grooveOn)
  usePracticeActive('drone', droneOn)
  // 횟수 목표를 채우면 축하
  const prevReps = useRef(0)
  useEffect(() => { if (prevReps.current < target && reps >= target && reps > 0) celebrate(`목표 ${target}회 달성!`); prevReps.current = reps }, [reps, target])

  const value = useMemo<Tools>(() => ({
    open, tab, show: (t?: ToolTab) => { if (t) setTab(t); setOpen(true) }, hide: () => setOpen(false), setTab,
    bpm, setBpm, beats, setBeats, metroOn, beat, toggleMetro, tap,
    mode, setMode, minutes, setMinutes, running, ms, startWatch, pauseWatch, resetWatch,
    reps, setReps, addRep: (d: number) => setRepsS(r => Math.max(0, r + d)), target, setTarget, autoRep, setAutoRep,
    grooveOn, groove, setGroove, toggleGroove, grooveVol, setGrooveVol, swing, setSwing, room, setRoom,
    droneOn, droneNote, setDroneNote, droneOct, setDroneOct, droneFifth, setDroneFifth, droneVol, setDroneVol, toggleDrone,
    notice,
  }), [notice, open, tab, bpm, beats, metroOn, beat, mode, minutes, running, ms, reps, target, autoRep, grooveOn, groove, grooveVol, swing, room, droneOn, droneNote, droneOct, droneFifth, droneVol])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const fmtWatch = (ms: number, withTenth = false) => {
  const t = Math.max(0, ms), s = Math.floor(t / 1000)
  const base = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return withTenth ? `${base}.${Math.floor((t % 1000) / 100)}` : base
}
