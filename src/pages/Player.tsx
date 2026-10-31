import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { fmtTime } from '../lib/materials'

// 연습 플레이어: 내 폰에 있는 음원을 열어 템포(음높이 그대로)·키(반음)를 바꾸고 A–B 구간을 반복
// 파일은 이 기기 안에서만 재생하고 서버로 보내지 않아요.

const MAX_MIN = 15 // 너무 긴 파일은 키 바꾸기 계산이 오래 걸려서 안내

export default function Player() {
  const audio = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [origUrl, setOrigUrl] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [tempo, setTempo] = useState(100)
  const [semi, setSemi] = useState(0)
  const [busy, setBusy] = useState<number | null>(null) // 키 바꾸는 중 (0~1)
  const [err, setErr] = useState('')
  const [a, setA] = useState<number | null>(null)
  const [b, setB] = useState<number | null>(null)
  const ab = useRef<{ a: number | null; b: number | null }>({ a: null, b: null })
  useEffect(() => { ab.current = { a, b } }, [a, b])
  const pcm = useRef<{ l: Float32Array; r: Float32Array; sr: number } | null>(null)
  const shiftedUrl = useRef<string | null>(null)
  const job = useRef(0)

  function open(f: File | null) {
    if (!f) return
    setErr('')
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name)) return setErr('음원 파일(mp3·m4a·wav)을 골라 주세요.')
    if (origUrl) URL.revokeObjectURL(origUrl)
    if (shiftedUrl.current) { URL.revokeObjectURL(shiftedUrl.current); shiftedUrl.current = null }
    pcm.current = null
    const u = URL.createObjectURL(f)
    setFile(f); setOrigUrl(u); setSrc(u); setSemi(0); setA(null); setB(null); setPos(0); setPlaying(false)
  }
  useEffect(() => () => { if (origUrl) URL.revokeObjectURL(origUrl) }, [origUrl])

  // 재생 위치·A–B 반복
  useEffect(() => {
    const el = audio.current
    if (!el) return
    let raf = 0
    const tick = () => {
      const t = el.currentTime
      setPos(t)
      const { a, b } = ab.current
      if (a != null && b != null && !el.paused && t >= b) el.currentTime = a
      raf = requestAnimationFrame(tick)
    }
    const meta = () => setDur(el.duration || 0)
    const end = () => setPlaying(false)
    el.addEventListener('loadedmetadata', meta); el.addEventListener('ended', end)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('loadedmetadata', meta); el.removeEventListener('ended', end) }
  }, [src])

  // 템포: 음높이는 그대로 빠르기만
  useEffect(() => {
    const el = audio.current as (HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }) | null
    if (!el) return
    el.preservesPitch = true; el.webkitPreservesPitch = true
    el.defaultPlaybackRate = tempo / 100 // 새 음원으로 바뀌어도 템포 유지
    el.playbackRate = tempo / 100
  }, [tempo, src])

  // 키 바꾸기: 기기 안에서 계산해 새 음원을 만든 뒤 같은 위치에서 이어서 재생
  useEffect(() => {
    if (!file || !origUrl) return
    const my = ++job.current
    const t = window.setTimeout(async () => {
      const el = audio.current
      const at = el?.currentTime ?? 0
      const wasPlaying = !!el && !el.paused
      if (semi === 0) { swap(origUrl, at, wasPlaying); return }
      try {
        setBusy(0)
        if (!pcm.current) {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext
          const ctx = new Ctx()
          const buf = await ctx.decodeAudioData(await file.arrayBuffer())
          ctx.close?.()
          if (buf.duration > MAX_MIN * 60) throw new Error(`${MAX_MIN}분이 넘는 음원은 키 바꾸기가 어려워요. 템포와 구간 반복은 그대로 쓸 수 있어요.`)
          const l = buf.getChannelData(0)
          pcm.current = { l, r: buf.numberOfChannels > 1 ? buf.getChannelData(1) : l, sr: buf.sampleRate }
        }
        const { shiftPcm, toWav } = await import('../lib/pitchShift')
        const { l, r, sr } = pcm.current
        const [ol, or] = await shiftPcm(l, r, sr, semi, p => { if (my === job.current) setBusy(p) })
        if (my !== job.current) return
        const url = URL.createObjectURL(toWav(ol, or, sr))
        if (shiftedUrl.current) URL.revokeObjectURL(shiftedUrl.current)
        shiftedUrl.current = url
        swap(url, audio.current?.currentTime ?? at, wasPlaying)
      } catch (x) {
        if (my === job.current) { setErr((x as Error).message || '키를 바꾸지 못했어요. 다른 파일로 해 보세요.'); setSemi(0) }
      } finally {
        if (my === job.current) setBusy(null)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [semi, file, origUrl])

  function swap(url: string, at: number, play: boolean) {
    const el = audio.current
    if (!el) return setSrc(url)
    if (el.src === url) return
    setSrc(url)
    const onMeta = () => {
      el.currentTime = Math.min(at, el.duration || at)
      el.playbackRate = tempo / 100
      if (play) el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
      el.removeEventListener('loadedmetadata', onMeta)
    }
    el.addEventListener('loadedmetadata', onMeta)
  }

  function toggle() {
    const el = audio.current
    if (!el || !src) return
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => {})
    else { el.pause(); setPlaying(false) }
  }
  const seek = (t: number) => { const el = audio.current; if (el) el.currentTime = Math.max(0, Math.min(dur || t, t)) }
  function abClick() {
    const t = audio.current?.currentTime ?? 0
    if (a == null) { setA(t); setB(null) }
    else if (b == null) { if (t > a + 0.3) setB(t); else setA(t) }
    else { setA(null); setB(null) }
  }
  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`

  return (
    <Shell>
      <Link to="/board" className="muted" style={{ fontSize: 14 }}>← 자료실</Link>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>내 음원으로 템포·키를 바꿔 연습해요</p>
        <h1 className="title">연습 플레이어</h1>
      </div>

      <button type="button" className="drop" onClick={() => fileRef.current?.click()}>
        <b>{file ? '다른 음원 열기' : '내 음원 열기'}</b>
        <span>내가 가진 음원이나 코치님 반주 파일 · 이 기기에서만 재생돼요 (서버에 올라가지 않아요)</span>
      </button>
      <input ref={fileRef} type="file" hidden accept="audio/*,.mp3,.m4a,.wav,.aac" onChange={e => { open(e.target.files?.[0] ?? null); e.target.value = '' }} />
      {err && <p className="err">{err}</p>}

      {src && <audio ref={audio} src={src} preload="auto" />}

      <section className="pl-now">
        <span className="k">{file ? '지금 재생 중' : '음원을 열면 여기서 재생돼요'}</span>
        <b className="t">{file?.name.replace(/\.[^.]+$/, '') ?? '—'}</b>
        <div className="pl-bar" role="slider" aria-label="재생 위치" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} tabIndex={0}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * dur) }}
          onKeyDown={e => { if (e.key === 'ArrowRight') seek(pos + 5); if (e.key === 'ArrowLeft') seek(pos - 5) }}>
          {a != null && b != null && <span className="ab" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />}
          <span className="fill" style={{ width: pct(pos) }} />
          {a != null && <span className="mk" style={{ left: pct(a) }}>A</span>}
          {b != null && <span className="mk" style={{ left: pct(b) }}>B</span>}
        </div>
        <div className="pl-time"><span>{fmtTime(pos)}</span><span>{a != null ? (b != null ? `A ${fmtTime(a)} ~ B ${fmtTime(b)} 반복 중` : `A ${fmtTime(a)} · B를 찍어 주세요`) : ''}</span><span>{fmtTime(dur)}</span></div>
        <div className="pl-btns">
          <button type="button" aria-label="5초 뒤로" disabled={!src} onClick={() => seek(pos - 5)}>−5초</button>
          <button type="button" className="main" aria-label={playing ? '일시정지' : '재생'} disabled={!src || busy != null} onClick={toggle}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" aria-label="5초 앞으로" disabled={!src} onClick={() => seek(pos + 5)}>+5초</button>
          <button type="button" className={'ab-btn' + (a != null ? ' on' : '')} disabled={!src} onClick={abClick}>{a == null ? 'A 찍기' : b == null ? 'B 찍기' : '반복 끄기'}</button>
        </div>
      </section>

      <section className="card pl-opts">
        <div className="row">
          <div className="lab"><b>템포</b><span className="v">{tempo}%</span></div>
          <input type="range" min={50} max={120} step={5} value={tempo} onChange={e => setTempo(Number(e.target.value))} aria-label="템포" />
          <div className="chips">{[60, 75, 90, 100].map(v => <button key={v} type="button" className={'chip sm' + (tempo === v ? ' on' : '')} onClick={() => setTempo(v)}>{v}%</button>)}</div>
          <span className="muted">음높이는 그대로, 빠르기만 바뀌어요</span>
        </div>
        <div className="row">
          <div className="lab"><b>키 바꾸기</b><span className="v">{semi === 0 ? '원래 키' : `반음 ${semi > 0 ? '+' : '−'}${Math.abs(semi)}`}</span></div>
          <div className="pl-key">
            <button type="button" aria-label="반음 내리기" disabled={!file || semi <= -6} onClick={() => setSemi(s => s - 1)}>−</button>
            <span>{busy != null ? `바꾸는 중… ${Math.round(busy * 100)}%` : semi === 0 ? '0' : (semi > 0 ? `+${semi}` : `${semi}`)}</span>
            <button type="button" aria-label="반음 올리기" disabled={!file || semi >= 6} onClick={() => setSemi(s => s + 1)}>＋</button>
          </div>
          {semi !== 0 && <button type="button" className="linkish muted" onClick={() => setSemi(0)}>원래 키로</button>}
          <span className="muted">보컬은 내 음역에 맞게, 악기는 다른 키로 연습할 때 써요. 바꾸는 데 몇 초 걸려요.</span>
        </div>
      </section>

      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>유튜브 영상은 자료 화면에서 느리게 보기·구간 반복을 쓸 수 있어요. 유튜브 음원을 파일로 받는 기능은 없어요.</p>
    </Shell>
  )
}
