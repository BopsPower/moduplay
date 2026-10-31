import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { Metronome, RepCounter, Timer } from '../components/PracticeTools'
import { ago, fmtTime, ytId } from '../lib/materials'
import { supabase } from '../lib/supabase'

const YouTubePlayer = lazy(() => import('../components/YouTubePlayer'))

// 연습 플레이어: 내 폰에 있는 음원을 열어 템포(음높이 그대로)·키(반음)를 바꾸고 A–B 구간을 반복
// 파일은 이 기기 안에서만 재생하고 서버로 보내지 않아요.

const MAX_MIN = 15 // 너무 긴 파일은 키 바꾸기 계산이 오래 걸려서 안내

// 화면: [내 음원] [유튜브 링크] 두 가지. 탭을 바꿔도 재생 상태는 그대로 둠
export default function Player() {
  const [sp, setSp] = useSearchParams()
  // 기본은 유튜브 탭 (예전 주소 ?tab=yt 도 그대로 동작)
  const tab = sp.get('tab') === 'file' ? 'file' : 'yt'
  const pick = (t: 'file' | 'yt') => { const n = new URLSearchParams(sp); if (t === 'file') n.set('tab', 'file'); else n.delete('tab'); setSp(n, { replace: true }) }
  return (
    <Shell>
      <Link to="/board" className="muted" style={{ fontSize: 14 }}>← 자료실</Link>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>유튜브 영상이나 내 음원으로 느리게·구간 반복 연습해요</p>
        <h1 className="title">연습 플레이어</h1>
      </div>
      <div className="seg" role="tablist" aria-label="연습할 것" style={{ maxWidth: 720 }}>
        <button type="button" role="tab" aria-selected={tab === 'yt'} className={tab === 'yt' ? 'on' : ''} onClick={() => pick('yt')}>▶ 유튜브 링크</button>
        <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'on' : ''} onClick={() => pick('file')}>내 음원</button>
      </div>
      {tab === 'yt' && <YtPart />}
      <div style={{ display: tab === 'file' ? 'contents' : 'none' }}><AudioPart /></div>
      <PracticePanel />
    </Shell>
  )
}

// 연습 도구: 탭(유튜브/내 음원)을 바꿔도 메트로놈·타이머·횟수가 그대로 이어지도록 플레이어 바깥에 둠
function PracticePanel() {
  const [bpm, setBpm] = useState(100)
  const [minutes, setMinutes] = useState(3)
  const [reps, setReps] = useState(0)
  const [target, setTarget] = useState(10)
  return (
    <section className="sec" style={{ maxWidth: 860 }}>
      <div className="sec-h"><h2 style={{ fontSize: 17 }}>연습 도구</h2><span className="muted" style={{ fontSize: 12 }}>메트로놈 · 타이머 · 반복 체크</span></div>
      <div className="pl-tools">
        <Metronome bpm={bpm} onBpm={setBpm} />
        <Timer onMinutes={setMinutes} onDone={() => setReps(r => r + 1)} />
        <RepCounter reps={reps} target={target} onReps={setReps} onTarget={setTarget} bpm={bpm} minutes={minutes} />
      </div>
    </section>
  )
}

type MyVideo = { id: string; video_id: string; url: string; title: string | null; speed: number | null; loop_a: number | null; loop_b: number | null; played_at: string }
const YT_SPEEDS = [0.5, 0.6, 0.75, 0.9, 1]

// 유튜브 링크 연습: 붙여 넣으면 바로 재생, 내 기록에 남고(나만 보임) 지울 수 있음
function YtPart() {
  const [list, setList] = useState<MyVideo[]>([])
  const [url, setUrl] = useState('')
  const [cur, setCur] = useState<MyVideo | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from('my_videos').select('*').order('played_at', { ascending: false }).limit(100)
    if (error) setErr('기록을 불러오지 못했어요.')
    setList((data ?? []) as MyVideo[]); setLoading(false)
    return (data ?? []) as MyVideo[]
  }
  useEffect(() => { load() }, [])

  async function title(u: string) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`)
      if (r.ok) { const j = await r.json(); return j?.title ? String(j.title).slice(0, 200) : null }
    } catch { /* 제목 없이도 재생됨 */ }
    return null
  }

  async function add(e?: FormEvent) {
    e?.preventDefault()
    setErr('')
    const id = ytId(url)
    if (!id) return setErr('유튜브 영상 주소를 붙여 넣어 주세요. (예: https://youtu.be/…)')
    const old = list.find(v => v.video_id === id)
    if (old) { open(old); setUrl(''); return }
    const t = await title(url.trim())
    const { data, error } = await supabase.from('my_videos').insert({ video_id: id, url: url.trim().slice(0, 300), title: t }).select().single()
    if (error || !data) return setErr('저장하지 못했어요. 잠시 뒤에 다시 해 주세요.')
    setUrl('')
    setList(l => [data as MyVideo, ...l])
    setCur(data as MyVideo)
  }
  function open(v: MyVideo) {
    setCur(v)
    supabase.from('my_videos').update({ played_at: new Date().toISOString() }).eq('id', v.id).then(() => {})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function del(v: MyVideo) {
    if (!confirm(`'${v.title ?? '이 영상'}'을 내 기록에서 지울까요?`)) return
    await supabase.from('my_videos').delete().eq('id', v.id)
    if (cur?.id === v.id) setCur(null)
    setList(l => l.filter(x => x.id !== v.id))
  }
  // 속도·A–B 구간을 영상별로 기억
  const saveState = (id: string) => (st: { speed: number; a: number | null; b: number | null }) => {
    supabase.from('my_videos').update({ speed: st.speed, loop_a: st.a, loop_b: st.b }).eq('id', id).then(() => {})
    setList(l => l.map(x => x.id === id ? { ...x, speed: st.speed, loop_a: st.a, loop_b: st.b } : x))
  }

  return (
    <>
      <form onSubmit={add} className="req-form" style={{ maxWidth: 720 }}>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="유튜브 영상 주소 붙여 넣기 (https://youtu.be/…)" aria-label="유튜브 주소" />
        <button className="btn primary" disabled={!url.trim()}>재생</button>
      </form>
      {err && <p className="err">{err}</p>}

      {cur && (
        <section className="sec" style={{ maxWidth: 860 }}>
          <div className="sec-h"><h2 style={{ fontSize: 16, fontFamily: 'inherit', fontWeight: 700 }}>{cur.title ?? '유튜브 영상'}</h2></div>
          <Suspense fallback={<div className="loading">영상을 여는 중…</div>}>
            <YouTubePlayer key={cur.id} url={cur.url} title={cur.title ?? undefined} speeds={YT_SPEEDS}
              initial={{ speed: cur.speed ?? 1, a: cur.loop_a, b: cur.loop_b }} onState={saveState(cur.id)} />
          </Suspense>
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            속도를 줄여도 음높이는 그대로예요. 속도와 A–B 구간은 이 영상에 저장돼서 다음에 열면 이어서 쓸 수 있어요.
            키 바꾸기는 유튜브 영상에서는 안 되고, 내 음원 탭에서 쓸 수 있어요.
          </p>
          <Link to={`/upload?mode=yt&yt=${encodeURIComponent(cur.url)}`} className="muted" style={{ fontSize: 13 }}>이 영상을 자료실에 공유하기 →</Link>
        </section>
      )}

      <section className="sec" style={{ maxWidth: 720 }}>
        <div className="sec-h"><h2 style={{ fontSize: 17 }}>내 유튜브 연습 기록</h2><span className="muted" style={{ fontSize: 12 }}>나만 볼 수 있어요</span></div>
        {loading ? <div className="loading">불러오는 중…</div> : list.length ? (
          <ul className="lounge-list">
            {list.map(v => (
              <li key={v.id} style={cur?.id === v.id ? { borderColor: 'var(--accent)' } : undefined}>
                <button type="button" className="yt-rec" onClick={() => open(v)}>
                  <img src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`} alt="" loading="lazy" />
                  <span>
                    <b>{v.title ?? v.url}</b>
                    <span className="muted">{ago(v.played_at)}{v.speed && v.speed !== 1 ? ` · ${v.speed}배` : ''}{v.loop_a != null && v.loop_b != null ? ` · 구간 ${fmtTime(v.loop_a)}~${fmtTime(v.loop_b)}` : ''}</span>
                  </span>
                </button>
                <div className="acts"><button type="button" className="btn sm ghost" onClick={() => del(v)}>지우기</button></div>
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직 기록이 없어요. 위에 유튜브 주소를 붙여 넣으면 바로 재생되고 여기에 남아요.</p>}
      </section>
    </>
  )
}

function AudioPart() {
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
    <>
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

      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>유튜브 영상은 위 <b>유튜브 링크</b> 탭에서 느리게 보기·구간 반복을 쓸 수 있어요. 유튜브 음원을 파일로 받는 기능은 없어요.</p>
    </>
  )
}
