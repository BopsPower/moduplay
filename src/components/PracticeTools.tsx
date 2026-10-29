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

// ───────── 연습 타이머 ─────────
// 1~5분 골라서 거꾸로 셈. 0이 되면 소리 나고 멈춤. 다시 '시작'하면 처음부터 다시 거꾸로.
export function Timer({ onDone }: { onDone?: (seconds: number) => void }) {
  const [minutes, setMinutes] = useState(3)
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(3 * 60 * 1000) // 남은 ms
  const endRef = useRef(0)
  const rafRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)

  function beep() {
    const ctx = ctxRef.current!
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.25
      const osc = ctx.createOscillator(), g = ctx.createGain()
      osc.frequency.value = 880
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
      osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.22)
    }
  }

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const rem = endRef.current - performance.now()
      if (rem <= 0) { setLeft(0); setRunning(false); beep(); onDone?.(minutes * 60); return }
      setLeft(rem); rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  function start() {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    ctxRef.current.resume() // 소리는 사용자가 누른 뒤에만 켤 수 있어서 여기서 준비
    const ms = left > 0 && left < minutes * 60 * 1000 ? left : minutes * 60 * 1000 // 멈췄다 계속이면 남은 시간부터, 끝났으면 처음부터
    endRef.current = performance.now() + ms
    setLeft(ms); setRunning(true)
  }
  function pause() { setLeft(endRef.current - performance.now()); setRunning(false) }
  function pick(m: number) { setMinutes(m); setRunning(false); setLeft(m * 60 * 1000) }

  const total = Math.ceil(left / 1000)
  const text = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  const done = left <= 0

  return (
    <div className="card controls" style={{ gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>연습 타이머</span>
        <span className="muted" style={{ fontSize: 12 }}>{done ? '끝! 잘했어요' : running ? '연습 중' : `${minutes}분`}</span>
      </div>
      <div className="seg">
        {[1, 2, 3, 4, 5].map(m => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => pick(m)} disabled={running}>{m}분</button>)}
      </div>
      <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 1, color: done ? 'var(--accent-deep)' : running ? 'var(--accent-deep)' : 'var(--ink)' }}>{text}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }} onClick={running ? pause : start}>{running ? '멈춤' : done ? '다시 시작' : left < minutes * 60 * 1000 ? '계속' : '시작'}</button>
        {!running && !done && left < minutes * 60 * 1000 && <button className="btn ghost" onClick={() => pick(minutes)}>처음으로</button>}
      </div>
    </div>
  )
}
