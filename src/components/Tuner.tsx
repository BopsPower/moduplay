import { useEffect, useRef, useState } from 'react'
import { usePracticeActive } from '../lib/practice'

// 튜너: 휴대폰 마이크로 지금 나는 음을 찾아 보여 줌 (기타·베이스 줄 맞추기, 보컬 음정 확인)
// - 소리는 기기 안에서만 분석하고 저장·전송하지 않음
// - 이 판을 닫거나 다른 칸으로 가면 마이크를 바로 끔
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
type Inst = 'auto' | 'guitar' | 'bass' | 'uke'
const STRINGS: Record<Exclude<Inst, 'auto'>, [string, number][]> = {
  // [이름, MIDI 번호]  기타 표준: E2 A2 D3 G3 B3 E4
  guitar: [['6번 E', 40], ['5번 A', 45], ['4번 D', 50], ['3번 G', 55], ['2번 B', 59], ['1번 E', 64]],
  bass: [['4번 E', 28], ['3번 A', 33], ['2번 D', 38], ['1번 G', 43]],
  uke: [['4번 G', 67], ['3번 C', 60], ['2번 E', 64], ['1번 A', 69]],
}
const INST_NAME: Record<Inst, string> = { auto: '자동 (모든 음)', guitar: '기타', bass: '베이스', uke: '우쿨렐레' }

const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 무시 */ } }

/** 자기상관으로 음높이(Hz) 찾기. 소리가 너무 작으면 -1 */
function detectPitch(raw: Float32Array, rawSr: number): number {
  // 휴대폰에서 가볍게: 두 칸씩 평균 내서 절반 길이로 (음높이 찾기에는 충분)
  const half = rawSr > 32000
  const buf = half ? new Float32Array(raw.length >> 1).map((_, i) => (raw[2 * i] + raw[2 * i + 1]) / 2) : raw
  const sr = half ? rawSr / 2 : rawSr
  const n = buf.length
  let rms = 0
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / n)
  if (rms < 0.008) return -1
  // 앞뒤 조용한 부분 잘라내기
  let a = 0, b = n - 1
  let peak = 0
  for (let i = 0; i < n; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v }
  const th = 0.2 * peak
  while (a < n / 2 && Math.abs(buf[a]) < th) a++
  while (b > n / 2 && Math.abs(buf[b]) < th) b--
  const x = buf.subarray(a, b)
  const m = x.length
  const minLag = Math.floor(sr / 1400), maxLag = Math.min(Math.floor(sr / 38), m - 1) // 약 38Hz(베이스 낮은 E 아래)~1400Hz
  if (maxLag <= minLag) return -1
  const c = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i < m - lag; i++) s += x[i] * x[i + lag]
    c[lag] = s
  }
  // 첫 골짜기 뒤의 가장 높은 봉우리
  let lag = minLag
  while (lag < maxLag && c[lag] > c[lag + 1]) lag++
  let best = -1, bestV = -Infinity
  for (let i = lag; i <= maxLag; i++) if (c[i] > bestV) { bestV = c[i]; best = i }
  if (best <= minLag || best >= maxLag) return -1
  // 봉우리 앞뒤로 살짝 보정 (더 정확하게)
  const y1 = c[best - 1], y2 = c[best], y3 = c[best + 1]
  const den = y1 - 2 * y2 + y3
  const shift = den ? (y1 - y3) / (2 * den) : 0
  return sr / (best + shift)
}

export default function Tuner() {
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [inst, setInstS] = useState<Inst>(() => lsGet('mp_tuner_inst', 'auto') as Inst)
  const [a4, setA4S] = useState<number>(() => Number(lsGet('mp_tuner_a4', '440')) || 440)
  const [freq, setFreq] = useState<number | null>(null)
  const stop = useRef<() => void>(() => {})
  const a4Ref = useRef(a4); useEffect(() => { a4Ref.current = a4 }, [a4])
  usePracticeActive('tuner', on)

  const setInst = (v: Inst) => { setInstS(v); lsSet('mp_tuner_inst', v) }
  const setA4 = (v: number) => { setA4S(v); lsSet('mp_tuner_a4', String(v)) }

  async function start() {
    setErr('')
    try {
      // 아이폰: 마이크를 쓰는 동안은 녹음+재생 세션으로
      try { const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (as) as.type = 'play-and-record' } catch { /* 무시 */ }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      await ctx.resume()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 4096
      src.connect(an)
      const buf = new Float32Array(an.fftSize)
      const recent: number[] = []
      let raf = 0, last = 0, quiet = 0
      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop)
        if (ts - last < 70) return
        last = ts
        an.getFloatTimeDomainData(buf)
        const f = detectPitch(buf, ctx.sampleRate)
        if (f > 0) {
          quiet = 0
          recent.push(f); if (recent.length > 5) recent.shift()
          const sorted = [...recent].sort((p, q) => p - q)
          setFreq(sorted[Math.floor(sorted.length / 2)])
        } else if (++quiet > 12) { recent.length = 0; setFreq(null) } // 1초쯤 조용하면 지움
      }
      raf = requestAnimationFrame(loop)
      stop.current = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach(t => t.stop())
        ctx.close().catch(() => {})
        try { const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (as) as.type = 'playback' } catch { /* 무시 */ }
        stop.current = () => {}
      }
      setOn(true)
    } catch (e) {
      const name = (e as { name?: string })?.name
      setErr(name === 'NotAllowedError' || name === 'SecurityError'
        ? '마이크 사용이 막혀 있어요. 주소창(또는 설정 > 사파리/크롬 > 마이크)에서 이 사이트의 마이크를 허용한 뒤 다시 눌러 주세요.'
        : '마이크를 켜지 못했어요. 다른 앱이 마이크를 쓰고 있으면 끄고 다시 해 주세요.')
    }
  }
  const off = () => { stop.current(); setOn(false); setFreq(null) }
  useEffect(() => () => stop.current(), [])

  // 지금 음 → 가장 가까운 음 이름과 얼마나 벗어났는지(센트)
  let target: { name: string; oct: number; cents: number; midi: number; label?: string } | null = null
  if (freq) {
    const midiF = 69 + 12 * Math.log2(freq / a4)
    if (inst === 'auto') {
      const midi = Math.round(midiF)
      target = { midi, name: NAMES[((midi % 12) + 12) % 12], oct: Math.floor(midi / 12) - 1, cents: Math.round((midiF - midi) * 100) }
    } else {
      const list = STRINGS[inst]
      const [label, midi] = list.reduce((b, s) => Math.abs(s[1] - midiF) < Math.abs(b[1] - midiF) ? s : b)
      target = { midi, label, name: NAMES[midi % 12], oct: Math.floor(midi / 12) - 1, cents: Math.max(-99, Math.min(99, Math.round((midiF - midi) * 100))) }
    }
  }
  const ok = !!target && Math.abs(target.cents) <= 5
  const needle = target ? Math.max(-50, Math.min(50, target.cents)) : 0

  return (
    <div className="tools-body tuner">
      <div className="seg sm" role="radiogroup" aria-label="악기">
        {(Object.keys(INST_NAME) as Inst[]).map(k => (
          <button key={k} type="button" role="radio" aria-checked={inst === k} className={inst === k ? 'on' : ''} onClick={() => setInst(k)}>{k === 'auto' ? '자동' : INST_NAME[k]}</button>
        ))}
      </div>

      <div className={'tn-face' + (ok ? ' ok' : '') + (on ? '' : ' off')} aria-live="polite">
        <div className="tn-note">
          {target ? <>{target.name}<small>{target.oct}</small></> : <span className="tn-wait">{on ? '♪' : '—'}</span>}
        </div>
        <div className="tn-scale" aria-hidden="true">
          <span className="tn-mid" />
          {[-50, -25, 25, 50].map(v => <span key={v} className="tn-tick" style={{ left: `${50 + v}%` }} />)}
          {target && <span className="tn-needle" style={{ left: `${50 + needle}%` }} />}
        </div>
        <div className="tn-read">
          {target
            ? ok ? <b className="tn-ok">✓ 맞아요</b>
              : <b>{target.cents < 0 ? `${-target.cents} 낮아요 ↑ 올리세요` : `${target.cents} 높아요 ↓ 내리세요`}</b>
            : <span className="muted">{on ? (inst === 'auto' ? '소리를 내 주세요 (노래·악기 모두 돼요)' : '줄을 하나씩 튕겨 주세요') : '아래 [튜너 켜기]를 눌러 주세요'}</span>}
          {freq && <small className="muted"> · {freq.toFixed(1)}Hz{target?.label ? ` · ${target.label}줄` : ''}</small>}
        </div>
      </div>

      {inst !== 'auto' && (
        <div className="tn-strings" aria-label="줄">
          {STRINGS[inst].map(([label, midi]) => (
            <span key={label} className={'tn-str' + (target?.midi === midi ? (ok ? ' ok' : ' cur') : '')}>{NAMES[midi % 12]}<small>{label.split(' ')[0]}</small></span>
          ))}
        </div>
      )}

      <div className="row">
        <button type="button" className={'btn' + (on ? ' ghost' : ' primary')} style={{ flex: 1 }} onClick={on ? off : start}>{on ? '튜너 끄기' : '🎤 튜너 켜기'}</button>
        <select value={a4} onChange={e => setA4(Number(e.target.value))} aria-label="기준음 A">
          {[438, 439, 440, 441, 442, 443].map(v => <option key={v} value={v}>A = {v}Hz</option>)}
        </select>
      </div>
      {err && <p className="hint" style={{ color: '#b42318' }}>{err}</p>}
      <p className="hint">처음 한 번은 마이크 허용을 눌러 주세요. 소리는 이 기기 안에서만 듣고 저장하지 않아요. 판을 닫으면 마이크도 꺼져요. 보통은 A = 440Hz예요.</p>
    </div>
  )
}
