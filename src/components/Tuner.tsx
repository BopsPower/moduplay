import { useEffect, useRef, useState } from 'react'
import { usePracticeActive } from '../lib/practice'
import { micSession } from '../lib/iosAudio'
import { logError } from '../lib/errorLog'

// 튜너: 휴대폰 마이크로 지금 나는 음을 찾아 보여 줌 (기타·베이스 줄 맞추기, 보컬 음정 확인)
// - 소리는 기기 안에서만 분석하고 저장·전송하지 않음
// - 이 판을 닫거나 다른 칸으로 가면 마이크를 바로 끔
// - 입력 고르기(2026-11-04): 컴퓨터에 오디오 인터페이스(기타·베이스를 꽂는 USB 장치)·외장 마이크가 있으면 목록에서 고름 (이 기기에 기억)
//   목록 이름은 마이크를 한 번 허용한 뒤에 보임(브라우저 규칙). 장치를 꽂고 빼면 목록이 저절로 바뀜
// - 입력 소리 막대: 소리가 들어오는지 바로 보이게 (인터페이스 볼륨이 너무 작을 때 알아채기)
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

type Input = { id: string; label: string }
const listInputs = async (): Promise<Input[]> => {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    // 크롬의 '기본값'·'통신' 항목은 같은 장치가 한 번 더 나오는 것이라 뺌 (대신 맨 위 '기본 입력')
    return all.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `입력 ${i + 1}` }))
  } catch { return [] }
}

export default function Tuner() {
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [inputs, setInputs] = useState<Input[]>([])
  const [devId, setDevIdS] = useState(() => lsGet('mp_tuner_dev', '')) // '' = 기본 입력
  const [level, setLevel] = useState(0) // 0~1 (입력 소리 크기)
  const [inst, setInstS] = useState<Inst>(() => lsGet('mp_tuner_inst', 'auto') as Inst)
  const [a4, setA4S] = useState<number>(() => Number(lsGet('mp_tuner_a4', '440')) || 440)
  const [freq, setFreq] = useState<number | null>(null)
  const stop = useRef<() => void>(() => {})
  const a4Ref = useRef(a4); useEffect(() => { a4Ref.current = a4 }, [a4])
  usePracticeActive('tuner', on)

  const setInst = (v: Inst) => { setInstS(v); lsSet('mp_tuner_inst', v) }
  const refresh = () => listInputs().then(setInputs)
  useEffect(() => {
    refresh()
    const md = navigator.mediaDevices
    if (!md?.addEventListener) return
    md.addEventListener('devicechange', refresh)
    return () => md.removeEventListener('devicechange', refresh)
  }, [])
  const setA4 = (v: number) => { setA4S(v); lsSet('mp_tuner_a4', String(v)) }

  const starting = useRef(false)
  async function start(id = devId) {
    if (starting.current) return // 두 번 눌러도 한 번만 (마이크 세션 수가 어긋나지 않게)
    starting.current = true
    try { await startMic(id) } finally { starting.current = false }
  }
  async function startMic(id: string) {
    setErr(''); setNote('')
    // 사파리·아이폰(2026-11-05 "튜너 입력이 안됨"): 소리 세션과 오디오 장치는 '누른 그 순간'(마이크 허락을 기다리기 전에) 만들어야
    // 멈춤(suspended) 없이 켜짐. 기다린 뒤에 만들면 사파리는 소리 분석을 시작하지 않음
    micSession(true) // 아이폰: 마이크를 쓰는 동안은 녹음+재생 세션
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    let ctx: AudioContext | null = null
    try { ctx = new Ctx(); ctx.resume().catch(() => {}) } catch { ctx = null }
    let stream: MediaStream | null = null
    try {
      // 소리를 바꾸지 않게(울림 지우기·잡음 줄이기·자동 크기 끔) + 2채널 인터페이스면 두 입력 모두 (기타를 2번 입력에 꽂아도 들리게)
      const base: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }
      // 순서대로 시도: 고른 장치 → 기본 입력(세부 조건) → 기본 입력(조건 없이, 세부 조건을 못 받는 브라우저용)
      const tries: (MediaTrackConstraints | true)[] = [...(id ? [{ ...base, deviceId: { exact: id } }] : []), base, true]
      let lastErr: unknown = null, usedK = -1
      for (let k = 0; k < tries.length && !stream; k++) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: tries[k] }); usedK = k } catch (e) {
          const n = (e as { name?: string })?.name
          if (n === 'NotAllowedError' || n === 'SecurityError') throw e
          lastErr = e
        }
      }
      if (!stream) throw lastErr ?? new Error('마이크 없음')
      if (id && usedK > 0) {
        // 고른 장치가 빠졌거나 못 써서 기본 입력으로 켬
        setDevIdS(''); lsSet('mp_tuner_dev', ''); setNote('고른 입력을 찾지 못해 기본 입력으로 켰어요.')
      }
      const s = stream
      const track = s.getAudioTracks()[0]
      refresh() // 허용한 뒤라 장치 이름이 보임
      track?.addEventListener('ended', () => { stop.current(); setOn(false); setFreq(null); setLevel(0); setNote('입력 장치가 빠졌어요. 다시 꽂고 [튜너 켜기]를 눌러 주세요.') })
      if (!ctx || ctx.state === 'closed') ctx = new Ctx()
      const c = ctx
      if (c.state !== 'running') await Promise.race([c.resume().catch(() => {}), new Promise(r => setTimeout(r, 800))])
      const src = c.createMediaStreamSource(s)
      const an = c.createAnalyser(); an.fftSize = 4096
      src.connect(an)
      // 사파리에서도 분석이 꼭 돌게 소리 0으로 스피커 쪽에 이어 둠 (들리지 않음)
      const mute = c.createGain(); mute.gain.value = 0
      an.connect(mute); mute.connect(c.destination)
      const buf = new Float32Array(an.fftSize)
      const bytes = new Uint8Array(an.fftSize)
      const read = typeof an.getFloatTimeDomainData === 'function'
        ? () => an.getFloatTimeDomainData(buf)
        : () => { an.getByteTimeDomainData(bytes); for (let i = 0; i < bytes.length; i++) buf[i] = (bytes[i] - 128) / 128 } // 옛 사파리
      // 그래도 멈춰 있으면 화면을 한 번 누를 때 다시 켬
      const wake = () => { c.resume().catch(() => {}) }
      if (c.state !== 'running') { setNote('소리 분석이 멈춰 있어요. 화면을 한 번 눌러 주세요.'); window.addEventListener('pointerdown', wake) }
      c.onstatechange = () => { if (c.state === 'running') { setNote(n => n.startsWith('소리 분석이 멈춰') ? '' : n); window.removeEventListener('pointerdown', wake) } }
      const recent: number[] = []
      let raf = 0, last = 0, quiet = 0, peak = 0
      const t0 = performance.now(); let diag = false
      const loop = (ts: number) => {
        raf = requestAnimationFrame(loop)
        if (ts - last < 70) return
        last = ts
        read()
        let ss = 0
        for (let i = 0; i < buf.length; i++) ss += buf[i] * buf[i]
        const rms = Math.sqrt(ss / buf.length); if (rms > peak) peak = rms
        const db = 20 * Math.log10(rms + 1e-9)
        setLevel(Math.round(Math.max(0, Math.min(1, (db + 60) / 54)) * 40) / 40) // -60dB~-6dB → 0~1
        // 4초가 지나도 소리가 하나도 안 들어오면 원인 찾기용 기록 (한 번만)
        if (!diag && ts - t0 > 4000) {
          diag = true
          if (peak < 1e-6 || c.state !== 'running') {
            const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession
            logError('tuner-diag', new Error(`no input: state=${c.state} sr=${c.sampleRate} peak=${peak.toExponential(1)} track=${JSON.stringify({ ...track?.getSettings?.(), muted: track?.muted, ready: track?.readyState })} session=${as?.type ?? '-'}`))
          }
        }
        const f = detectPitch(buf, c.sampleRate)
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
        window.removeEventListener('pointerdown', wake)
        s.getTracks().forEach(t => t.stop())
        c.onstatechange = null
        c.close().catch(() => {})
        micSession(false)
        stop.current = () => {}
      }
      setOn(true)
    } catch (e) {
      stream?.getTracks().forEach(t => t.stop())
      ctx?.close().catch(() => {})
      micSession(false) // 실패해도 세션을 원래대로 (안 그러면 아이폰에서 다른 소리가 작아짐)
      const name = (e as { name?: string })?.name
      if (name !== 'NotAllowedError') logError('tuner', e)
      setErr(name === 'NotAllowedError' || name === 'SecurityError'
        ? '마이크 사용이 막혀 있어요. 주소창(또는 설정 > 사파리/크롬 > 마이크)에서 이 사이트의 마이크를 허용한 뒤 다시 눌러 주세요.'
        : '마이크를 켜지 못했어요. 다른 앱이 마이크를 쓰고 있으면 끄고 다시 해 주세요.')
    }
  }
  const off = () => { stop.current(); setOn(false); setFreq(null); setLevel(0) }
  const pickInput = (id: string) => {
    setDevIdS(id); lsSet('mp_tuner_dev', id)
    if (on) { stop.current(); setFreq(null); start(id) }
  }
  const named = inputs.some(d => !d.label.startsWith('입력 '))
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

      {on && (
        <div className="tn-level" aria-label="입력 소리 크기">
          <span className="lbl">소리</span>
          <span className="tn-bar"><i style={{ width: `${Math.round(level * 100)}%` }} className={level > 0.33 ? 'ok' : ''} /></span>
        </div>
      )}

      {(inputs.length > 1 || (inputs.length === 1 && named && devId)) && (
        <label className="tn-input">
          <span className="lbl">입력</span>
          <select value={inputs.some(d => d.id === devId) ? devId : ''} onChange={e => pickInput(e.target.value)} aria-label="소리 입력 고르기">
            <option value="">기본 입력 (시스템 설정)</option>
            {inputs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      )}

      <div className="row">
        <button type="button" className={'btn' + (on ? ' ghost' : ' primary')} style={{ flex: 1 }} onClick={on ? off : () => start()}>{on ? '튜너 끄기' : '🎤 튜너 켜기'}</button>
        <select value={a4} onChange={e => setA4(Number(e.target.value))} aria-label="기준음 A">
          {[438, 439, 440, 441, 442, 443].map(v => <option key={v} value={v}>A = {v}Hz</option>)}
        </select>
      </div>
      {err && <p className="hint" style={{ color: '#b42318' }}>{err}</p>}
      {note && <p className="hint" style={{ color: '#9a5b00' }}>{note}</p>}
      {inputs.length > 1 && !named && <p className="hint">오디오 인터페이스·외장 마이크 이름은 튜너를 한 번 켜면(마이크 허용) 목록에 보여요.</p>}
      <p className="hint">처음 한 번은 마이크 허용을 눌러 주세요. 소리는 이 기기 안에서만 듣고 저장하지 않아요. 판을 닫으면 마이크도 꺼져요. 보통은 A = 440Hz예요.
        컴퓨터에 오디오 인터페이스(기타·베이스를 꽂는 장치)를 연결했으면 '입력'에서 고르면 돼요. 소리 막대가 거의 안 움직이면 인터페이스의 입력 볼륨(게인)을 올려 주세요.</p>
    </div>
  )
}
