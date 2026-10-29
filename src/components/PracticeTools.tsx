import { useEffect, useRef, useState } from 'react'

// ───────── 메트로놈 ─────────
// Web Audio로 정확한 박자. 첫 박은 높은 소리(강세). 박자(2/3/4/6) 선택, 탭 템포 지원.
export function Metronome({ bpm, onBpm }: { bpm: number; onBpm: (n: number) => void }) {
  const [on, setOn] = useState(false)
  const [beats, setBeats] = useState(4)
  const [beat, setBeat] = useState(-1)
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const nextRef = useRef(0)
  const countRef = useRef(0)
  const taps = useRef<number[]>([])
  const bpmRef = useRef(bpm); useEffect(() => { bpmRef.current = bpm }, [bpm])
  const beatsRef = useRef(beats); useEffect(() => { beatsRef.current = beats }, [beats])

  function click(time: number, accent: boolean) {
    const ctx = ctxRef.current!
    const osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.frequency.value = accent ? 1600 : 1000
    gain.gain.setValueAtTime(accent ? 0.5 : 0.3, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
    osc.connect(gain).connect(ctx.destination)
    osc.start(time); osc.stop(time + 0.06)
  }

  // 100ms마다 앞으로 0.15초 분량을 미리 예약 (브라우저 타이머 흔들림 방지)
  function schedule() {
    const ctx = ctxRef.current!
    while (nextRef.current < ctx.currentTime + 0.15) {
      const i = countRef.current % beatsRef.current
      click(nextRef.current, i === 0)
      const at = nextRef.current
      window.setTimeout(() => setBeat(i), Math.max(0, (at - ctx.currentTime) * 1000))
      nextRef.current += 60 / bpmRef.current
      countRef.current++
    }
  }

  function start() {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    const ctx = ctxRef.current
    ctx.resume()
    nextRef.current = ctx.currentTime + 0.05
    countRef.current = 0
    timerRef.current = window.setInterval(schedule, 100)
    setOn(true)
  }
  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setOn(false); setBeat(-1)
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function tap() {
    const now = Date.now()
    taps.current = taps.current.filter(t => now - t < 2500).concat(now)
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i])
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      onBpm(Math.max(30, Math.min(240, Math.round(60000 / avg))))
    }
  }

  return (
    <div className="card controls" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>메트로놈</span>
        <span className="muted" style={{ fontSize: 12 }}>♩ = {bpm}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="round" aria-label="느리게" onClick={() => onBpm(Math.max(30, bpm - 1))}>−</button>
        <input type="range" min={30} max={240} value={bpm} onChange={e => onBpm(Number(e.target.value))} style={{ flex: 1 }} />
        <button className="round" aria-label="빠르게" onClick={() => onBpm(Math.min(240, bpm + 1))}>+</button>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: beat === i ? (i === 0 ? 'var(--accent-deep)' : 'var(--accent)') : 'var(--line)', transition: 'background .05s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className={'btn primary'} style={{ flex: 1 }} onClick={on ? stop : start}>{on ? '멈춤' : '시작'}</button>
        <select value={beats} onChange={e => setBeats(Number(e.target.value))} style={{ padding: '10px 8px', border: '1px solid #d1d5db', fontFamily: 'inherit' }} aria-label="박자">
          {[2, 3, 4, 6].map(n => <option key={n} value={n}>{n}박</option>)}
        </select>
        <button className="btn ghost" onClick={tap} title="박자에 맞춰 여러 번 누르면 빠르기를 잡아요">탭</button>
      </div>
    </div>
  )
}

// ───────── 스톱워치 ─────────
// 연습 시간 재기. 시작/멈춤/다시. 멈출 때 onStop(초)로 연습 기록에 남길 수 있음.
export function Stopwatch({ onStop }: { onStop?: (seconds: number) => void }) {
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0)
  const startRef = useRef(0)
  const baseRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const tick = () => { setMs(baseRef.current + (performance.now() - startRef.current)); rafRef.current = requestAnimationFrame(tick) }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  function start() { startRef.current = performance.now(); setRunning(true) }
  function stop() { baseRef.current = baseRef.current + (performance.now() - startRef.current); setRunning(false); onStop?.(Math.round(baseRef.current / 1000)) }
  function reset() { baseRef.current = 0; setMs(0); setRunning(false) }

  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  const text = (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return (
    <div className="card controls" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>스톱워치</span>
        <span className="muted" style={{ fontSize: 12 }}>오늘 연습 시간</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 1, color: running ? 'var(--accent-deep)' : 'var(--ink)' }}>{text}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={running ? stop : start}>{running ? '멈춤' : ms ? '계속' : '시작'}</button>
        <button className="btn ghost" onClick={reset} disabled={running || !ms}>다시</button>
      </div>
    </div>
  )
}
