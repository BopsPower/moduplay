import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import LoopBox from '../components/LoopBox'
import { ago, fmtTime, ytId } from '../lib/materials'
import { supabase } from '../lib/supabase'
import { usePracticeActive } from '../lib/practice'
import { deleteTrack, fmtSize, getBlob, listTracks, MAX_TRACKS, saveFile, updateTrack, type Mark, type TrackInfo } from '../lib/myAudio'
import { ask } from '../lib/dialog'
import { useAuth } from '../lib/auth'
import { lastView } from '../lib/view'
import { markMission } from '../components/StartMissions'

const YouTubePlayer = lazy(() => import('../components/YouTubePlayer'))
const StemPanel = lazy(() => import('../components/StemPanel'))
const BandTrack = lazy(() => import('../components/BandTrack'))
import { MAJOR_STEM, type StemSource } from '../lib/stems'
import { takeAudio } from '../lib/handoff'
import { playbackSession } from '../lib/iosAudio'

// 연습 플레이어: 내 폰에 있는 음원을 열어 템포(음높이 그대로)·키(반음)를 바꾸고 A–B 구간을 반복
// 연 음원은 '내 음원 보관함'(본인만, 10곡까지)에 저장. 서버 표가 없으면 이 기기에만 저장

const MAX_MIN = 15 // 너무 긴 파일은 키 바꾸기 계산이 오래 걸려서 안내

// 화면: [유튜브 링크] [내 음원] [백킹트랙] 세 가지. 내 음원은 탭을 바꿔도 재생 상태 그대로 (유튜브·백킹트랙은 다른 탭으로 가면 멈춤)
export default function Player() {
  const { isTeacher, student } = useAuth()
  const asCoach = isTeacher && (!student || lastView() !== 'student')
  const [sp, setSp] = useSearchParams()
  // 기본은 유튜브 탭 (예전 주소 ?tab=yt 도 그대로 동작)
  const tab = sp.get('tab') === 'file' ? 'file' : sp.get('tab') === 'bt' ? 'bt' : 'yt'
  const pick = (t: 'file' | 'yt' | 'bt') => { const n = new URLSearchParams(sp); if (t === 'yt') n.delete('tab'); else n.set('tab', t); setSp(n, { replace: true }) }
  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{asCoach ? '레슨 중에 유튜브 영상·음원을 느리게, 막히는 구간만 반복해서 들려주세요. 코드 진행만 적으면 백킹트랙도 바로 나와요' : '유튜브 영상이나 내 음원으로 느리게·구간 반복, 코드 진행으로 백킹트랙 연습해요'}</p>
        <h1 className="title">연습 플레이어</h1>
      </div>
      <div className="seg" role="tablist" aria-label="연습할 것" style={{ maxWidth: 720 }}>
        <button type="button" role="tab" aria-selected={tab === 'yt'} className={tab === 'yt' ? 'on' : ''} onClick={() => pick('yt')}>▶ 유튜브 링크</button>
        <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'on' : ''} onClick={() => pick('file')}>내 음원</button>
        <button type="button" role="tab" aria-selected={tab === 'bt'} className={tab === 'bt' ? 'on' : ''} onClick={() => pick('bt')}>🎹 백킹트랙</button>
      </div>
      {asCoach && tab !== 'bt' && (
        <div className="pl-coach">
          <b>🎓 레슨에서 이렇게 써 보세요</b>
          <span>① 곡을 열고 템포를 75%쯤으로 낮춰요 ② 어려운 부분을 A·B로 찍어 반복해요 ③ <b>'학생에게 이 구간 보내기'</b>로 같은 속도·구간을 카톡으로 보내면, 학생이 집에서 그대로 이어서 연습해요</span>
        </div>
      )}
      {tab === 'yt' && <YtPart coach={isTeacher} />}
      {tab === 'bt' && <Suspense fallback={<p className="muted">불러오는 중…</p>}><BandTrack coach={isTeacher} /></Suspense>}
      <div style={{ display: tab === 'file' ? 'contents' : 'none' }}><AudioPart /></div>
    </Shell>
  )
}

type MyVideo = { id: string; video_id: string; url: string; title: string | null; speed: number | null; loop_a: number | null; loop_b: number | null; played_at: string }
const YT_SPEEDS = [0.5, 0.6, 0.75, 0.9, 1]

// 유튜브 링크 연습: 붙여 넣으면 바로 재생, 내 기록에 남고(나만 보임) 지울 수 있음
// 공유 링크로 받은 빠르기는 고를 수 있는 값 중 가장 가까운 것으로
const nearSpeed = (v: number) => YT_SPEEDS.reduce((x, y) => Math.abs(y - v) < Math.abs(x - v) ? y : x, 1)
const num = (v: string | null) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null }

function YtPart({ coach }: { coach?: boolean }) {
  const [sp, setSp] = useSearchParams()
  const [sent, setSent] = useState('')
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
  useEffect(() => {
    load().then(l => {
      // 코치(또는 친구)가 보낸 링크: ?yt=주소&speed=0.75&a=12.5&b=30 → 같은 속도·구간으로 바로 열기
      const u = sp.get('yt')
      if (!u) return
      const n = new URLSearchParams(sp); ['yt', 'speed', 'a', 'b'].forEach(k => n.delete(k)); setSp(n, { replace: true })
      const id = ytId(u)
      if (!id) return setErr('보낸 링크의 유튜브 주소를 알아보지 못했어요.')
      const speed = sp.get('speed') ? nearSpeed(Number(sp.get('speed'))) : null
      let a = num(sp.get('a')), b = num(sp.get('b'))
      if (a != null && b != null && b <= a) { a = null; b = null }
      openShared(l, u, id, { speed, a, b })
    })
  }, [])

  async function openShared(l: MyVideo[], u: string, id: string, st: { speed: number | null; a: number | null; b: number | null }) {
    const old = l.find(v => v.video_id === id)
    const patch = { speed: st.speed ?? old?.speed ?? 1, loop_a: st.a, loop_b: st.b, played_at: new Date().toISOString() }
    if (old) {
      const v = { ...old, ...patch }
      supabase.from('my_videos').update(patch).eq('id', old.id).then(() => {})
      setList(x => [v, ...x.filter(y => y.id !== old.id)]); setCur(v); return
    }
    const t = await title(u)
    const { data, error } = await supabase.from('my_videos').insert({ video_id: id, url: u.slice(0, 300), title: t, ...patch }).select().single()
    if (error || !data) return setErr('보낸 영상을 열지 못했어요. 잠시 뒤에 다시 해 주세요.')
    setList(x => [data as MyVideo, ...x]); setCur(data as MyVideo)
  }

  // 지금 속도·구간을 담은 링크를 카톡 등으로 보내기 (받는 사람도 모두플레이 회원이어야 열림)
  async function share(v: MyVideo) {
    markMission('send-clip')
    const q = new URLSearchParams({ yt: v.url })
    if (v.speed && v.speed !== 1) q.set('speed', String(v.speed))
    if (v.loop_a != null && v.loop_b != null) { q.set('a', String(Math.round(v.loop_a * 10) / 10)); q.set('b', String(Math.round(v.loop_b * 10) / 10)) }
    const link = `${location.origin}/player?${q}`
    const what = [v.speed && v.speed !== 1 ? `${v.speed}배 속도` : '', v.loop_a != null && v.loop_b != null ? `${fmtTime(v.loop_a)}~${fmtTime(v.loop_b)} 구간 반복` : ''].filter(Boolean).join(' · ')
    const text = `🎧 ${v.title ?? '유튜브 영상'}${what ? ` (${what})` : ''}\n모두플레이 연습 플레이어에서 이어서 연습해 보세요`
    try {
      if (navigator.share) { await navigator.share({ title: v.title ?? '모두플레이 연습', text, url: link }); return }
    } catch (x) { if ((x as Error).name === 'AbortError') return }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); setSent('링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.') }
    catch { setSent(link) }
  }

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
    if (!await ask(`'${v.title ?? '이 영상'}'을 내 기록에서 지울까요?`)) return
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
          <div className="pl-share">
            <button type="button" className="btn primary" onClick={() => { setSent(''); share(list.find(x => x.id === cur.id) ?? cur) }}>{coach ? '📨 학생에게 이 구간 보내기' : '📨 이 구간 링크 보내기'}</button>
            <Link to={`/upload?mode=yt&yt=${encodeURIComponent(cur.url)}`} className="muted" style={{ fontSize: 13 }}>이 영상을 자료실에 공유하기 →</Link>
          </div>
          {sent && <p className="muted" style={{ margin: 0, fontSize: 13, wordBreak: 'break-all' }}>{sent}</p>}
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>보낸 링크를 누르면 지금 속도와 A–B 구간 그대로 열려요. 받는 학생도 모두플레이에 가입돼 있어야 해요.</p>
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
  // 내 전공 악기는 악기 나누기 결과에서 처음부터 꺼 둠 (학생만)
  const { student: me } = useAuth()
  const myStem = MAJOR_STEM[(me as { major?: string | null } | null)?.major ?? me?.class_name ?? ''] ?? null
  const [autoSplit, setAutoSplit] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [origUrl, setOrigUrl] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  usePracticeActive('my-audio', playing)
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
  // 내 음원 보관함 (이 기기 안)
  const [cur, setCur] = useState<TrackInfo | null>(null)
  const curId = cur?.id ?? null
  const [tracks, setTracks] = useState<TrackInfo[] | null>(null)
  const [onServer, setOnServer] = useState(true)
  const [opening, setOpening] = useState('')
  const [marks, setMarks] = useState<Mark[]>([])
  const refreshList = () => listTracks().then(r => { setTracks(r.list); setOnServer(r.server); return r.list })
  useEffect(() => { refreshList() }, [])

  // 🎛 악기 나누기 대상 (보관함에 저장된 내 음원, 또는 자료실 음원 ?score=)
  const [stemSrc, setStemSrc] = useState<StemSource | null>(null)
  useEffect(() => { if (cur?.path) setStemSrc({ bucket: 'my-audio', path: cur.path, title: cur.name }) }, [cur?.path])
  const [sp] = useSearchParams()
  const scoreParam = sp.get('score')
  useEffect(() => {
    if (!scoreParam) return
    ;(async () => {
      const { data: s } = await supabase.from('scores').select('id,title,file_path,mp3_path').eq('id', scoreParam).maybeSingle()
      const p = s?.mp3_path || s?.file_path
      if (!s || !p || !/\.(mp3|m4a|wav|aac|ogg)$/i.test(p)) return setErr('이 자료는 음원이 아니라 악기 나누기를 할 수 없어요.')
      setOpening('score')
      const { data } = await supabase.storage.from('scores').download(p)
      setOpening('')
      if (!data) return setErr('음원을 받지 못했어요.')
      open(new File([data], s.title + p.slice(p.lastIndexOf('.')), { type: data.type || 'audio/mpeg' }), false)
      setStemSrc({ bucket: 'scores', path: p, scoreId: s.id, title: s.title })
    })().catch(() => setErr('음원을 열지 못했어요.'))
  }, [scoreParam])

  // 홈 '내 음원 올리기'에서 고른 음원: 바로 열고, 보관함에 저장되면 악기 나누기를 맡김
  useEffect(() => { const p = takeAudio(); if (p) { setAutoSplit(p.split); open(p.file) } }, [])

  function open(f: File | null, save = true) {
    if (!f) return
    setErr('')
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name)) return setErr('음원 파일(mp3·m4a·wav)을 골라 주세요.')
    if (origUrl) URL.revokeObjectURL(origUrl)
    if (shiftedUrl.current) { URL.revokeObjectURL(shiftedUrl.current); shiftedUrl.current = null }
    pcm.current = null
    const u = URL.createObjectURL(f)
    setFile(f); setOrigUrl(u); setSrc(u); setSemi(0); setA(null); setB(null); setPos(0); setPlaying(false)
    setCur(null); setMarks([])
    if (!save) return // 악기 나눠 섞은 소리·자료실 음원은 보관함에 저장하지 않음
    // 내 음원 보관함에 저장하고, 전에 쓰던 템포·구간·이름 붙인 위치를 다시 불러옴
    ;(async () => {
      const list = tracks ?? await refreshList()
      const r = await saveFile(f, list)
      if ('error' in r) { setErr(r.message); return }
      const t = r.track
      if (t.tempo) setTempo(t.tempo)
      setA(t.a ?? null); setB(t.b ?? null); setMarks(t.marks ?? [])
      setCur(t)
      refreshList()
    })().catch(() => setErr('보관함에 저장하지 못했어요. 재생·연습은 그대로 돼요.'))
  }
  async function openSaved(t: TrackInfo) {
    setAutoSplit(false)
    setOpening(t.id); setErr('')
    const blob = await getBlob(t)
    setOpening('')
    if (!blob) { setErr('음원을 받지 못했어요. 인터넷 연결을 확인해 주세요.'); refreshList(); return }
    open(new File([blob], t.name, { type: t.type }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function delSaved(t: TrackInfo) {
    if (!await ask(`'${t.name.replace(/\.[^.]+$/, '')}'을 내 음원 보관함에서 지울까요?`)) return
    await deleteTrack(t)
    if (cur?.id === t.id) setCur(null)
    refreshList()
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
          playbackSession()
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

  // 섞은 소리로 바꾼 뒤 듣던 위치부터 바로 재생
  function playFrom(at: number) {
    const el = audio.current
    if (!el) return
    const go = () => {
      el.removeEventListener('loadedmetadata', go)
      el.currentTime = Math.min(at, el.duration || at)
      el.playbackRate = tempo / 100
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
    el.addEventListener('loadedmetadata', go)
  }

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
  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`

  // 끌어서 위치 옮기기: 누른 채 옆으로 밀면 시간이 보이고, 손을 떼면 그 자리로
  const [drag, setDrag] = useState<number | null>(null)
  const tAt = (e: { clientX: number; currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
  }
  // 이름 붙인 위치 (예: 인트로, 솔로) — 음원별로 보관함에 기억
  const [naming, setNaming] = useState<{ t: number; name: string } | null>(null)
  const saveMarks = (m: Mark[]) => {
    const sorted = [...m].sort((x, y) => x.t - y.t)
    setMarks(sorted)
    if (cur) updateTrack(cur, { marks: sorted })
  }
  // 템포·A–B 구간·길이를 음원별로 기억
  useEffect(() => {
    if (!cur) return
    if (cur.tempo === tempo && cur.a === a && cur.b === b && (cur.dur || 0) === (dur || 0)) return
    const t = window.setTimeout(() => {
      const next = { ...cur, tempo, a, b, dur: dur || null }
      updateTrack(cur, { tempo, a, b, dur: dur || null }).then(() => { setCur(next); refreshList() })
    }, 800)
    return () => clearTimeout(t)
  }, [cur, tempo, a, b, dur])
  const shown = drag ?? pos

  return (
    <>
      <button type="button" className="drop pl-drop" onClick={() => fileRef.current?.click()}>
        <b>{file ? '다른 음원 열기' : '내 음원 열기'}</b>
        <span>내가 가진 음원이나 코치님 반주 파일 · 연 음원은 아래 '내 음원 보관함'에 저장돼요 (나만 볼 수 있어요)</span>
      </button>
      <input ref={fileRef} type="file" hidden accept="audio/*,.mp3,.m4a,.wav,.aac" onChange={e => { setAutoSplit(false); open(e.target.files?.[0] ?? null); e.target.value = '' }} />
      {err && <p className="err">{err}</p>}

      {src && <audio ref={audio} src={src} preload="auto" />}

      <section className="pl-now">
        <span className="k">{file ? '지금 재생 중' : '음원을 열면 여기서 재생돼요'}</span>
        <b className="t">{file?.name.replace(/\.[^.]+$/, '') ?? '—'}</b>
        <div className={'pl-bar' + (drag != null ? ' dragging' : '')} role="slider" aria-label="재생 위치 (옆으로 끌어서 옮기기)" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(shown)} aria-valuetext={fmtTime(shown)} tabIndex={0}
          onPointerDown={e => { if (!src || !dur) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(tAt(e)) }}
          onPointerMove={e => { if (drag != null) setDrag(tAt(e)) }}
          onPointerUp={e => { if (drag != null) { seek(tAt(e)); setDrag(null) } }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={e => { if (e.key === 'ArrowRight') seek(pos + 5); if (e.key === 'ArrowLeft') seek(pos - 5) }}>
          {a != null && b != null && <span className="ab" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />}
          <span className="fill" style={{ width: pct(shown) }} />
          {marks.map((m, i) => <span key={i} className="nm" style={{ left: pct(m.t) }} title={`${m.name} ${fmtTime(m.t)}`} />)}
          {a != null && <span className="mk" style={{ left: pct(a) }}>A</span>}
          {b != null && <span className="mk" style={{ left: pct(b) }}>B</span>}
          {src && dur > 0 && <span className="knob" style={{ left: pct(shown) }} />}
          {drag != null && <span className="bubble" style={{ left: pct(drag) }}>{fmtTime(drag)}</span>}
        </div>
        <div className="pl-time"><span>{fmtTime(shown)}</span><span>{a != null ? (b != null ? `A ${fmtTime(a)} ~ B ${fmtTime(b)} 반복 중` : `A ${fmtTime(a)} · B를 찍어 주세요`) : ''}</span><span>{fmtTime(dur)}</span></div>
        <div className="pl-btns">
          <button type="button" aria-label="5초 뒤로" disabled={!src} onClick={() => seek(pos - 5)}>−5초</button>
          <button type="button" className="main" aria-label={playing ? '일시정지' : '재생'} disabled={!src || busy != null} onClick={toggle}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" aria-label="5초 앞으로" disabled={!src} onClick={() => seek(pos + 5)}>+5초</button>
        </div>
        {src && (
          <div className="pl-marks">
            {marks.map((m, i) => (
              <span key={i} className="pm">
                <button type="button" onClick={() => seek(m.t)} title={`${m.name}(으)로 가기`}>📍 {m.name} <small>{fmtTime(m.t)}</small></button>
                <button type="button" className="x" aria-label={`${m.name} 지우기`} onClick={() => saveMarks(marks.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
            {naming ? (
              <form className="pm-new" onSubmit={e => { e.preventDefault(); const n = naming.name.trim() || `위치 ${marks.length + 1}`; saveMarks([...marks, { t: naming.t, name: n.slice(0, 20) }]); setNaming(null) }}>
                <span>{fmtTime(naming.t)}</span>
                <input autoFocus value={naming.name} maxLength={20} placeholder="이름 (예: 인트로, 솔로, 후렴)" onChange={e => setNaming({ ...naming, name: e.target.value })} aria-label="위치 이름" />
                <button type="submit">저장</button>
                <button type="button" onClick={() => setNaming(null)}>취소</button>
              </form>
            ) : (
              <button type="button" className="pm-add" onClick={() => setNaming({ t: audio.current?.currentTime ?? pos, name: '' })}>＋ 지금 위치에 이름 붙이기</button>
            )}
          </div>
        )}
        <p className="pl-hint">막대를 누른 채 옆으로 밀면 원하는 시간으로 옮겨져요</p>
      </section>
      <LoopBox className="pl-loop" a={a} b={b} setA={setA} setB={setB} now={() => audio.current?.currentTime ?? pos} go={t => { seek(t); if (audio.current?.paused) toggle() }} ready={!!src && busy == null} />

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
      {file && stemSrc && <Suspense fallback={null}><StemPanel src={stemSrc} auto={autoSplit && stemSrc.bucket === 'my-audio'} mute={myStem} onMix={f => { const at = audio.current?.currentTime ?? 0; open(f, false); playFrom(at); window.scrollTo({ top: 0, behavior: 'smooth' }) }} /></Suspense>}

      <section className="sec" style={{ maxWidth: 720 }}>
        <div className="sec-h"><h2 style={{ fontSize: 17 }}>내 음원 보관함</h2><span className="muted" style={{ fontSize: 12 }}>{onServer ? `한 사람당 ${MAX_TRACKS}곡 · 나만 볼 수 있어요` : '이 기기에만 저장 · 나만 볼 수 있어요'}</span></div>
        {tracks == null ? <div className="loading">불러오는 중…</div> : tracks.length ? (
          <>
            <ul className="lounge-list au-list">
              {tracks.map(t => (
                <li key={t.id} style={curId === t.id ? { borderColor: 'var(--accent)' } : undefined}>
                  <button type="button" className="yt-rec" onClick={() => openSaved(t)} disabled={!!opening}>
                    <span className="au-ico" aria-hidden="true">♪</span>
                    <span>
                      <b>{t.name.replace(/\.[^.]+$/, '')}{opening === t.id ? ' · 받는 중…' : ''}</b>
                      <span className="muted">
                        {ago(t.played_at)}{t.dur ? ` · ${fmtTime(t.dur)}` : ''}{t.tempo && t.tempo !== 100 ? ` · 템포 ${t.tempo}%` : ''}
                        {t.a != null && t.b != null ? ` · 구간 ${fmtTime(t.a)}~${fmtTime(t.b)}` : ''}{t.marks?.length ? ` · 📍${t.marks.length}` : ''}
                      </span>
                    </span>
                  </button>
                  <div className="acts"><button type="button" className="btn sm ghost" onClick={() => delSaved(t)}>지우기</button></div>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>{onServer ? `${tracks.length} / ${MAX_TRACKS}곡 · ${fmtSize(tracks.reduce((x, t) => x + t.size, 0))} · 내 계정에 저장돼서 다른 휴대폰·컴퓨터에서도 열 수 있어요 · 한 곡 30MB까지` : `모두 ${tracks.length}곡 · 이 기기에만 저장돼요`}</p>
          </>
        ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직 없어요. 위에서 음원을 열면 여기에 저장돼서 다음에 바로 열 수 있어요.</p>}
      </section>

      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>유튜브 영상은 위 <b>유튜브 링크</b> 탭에서 느리게 보기·구간 반복을 쓸 수 있어요. 유튜브 음원을 파일로 받는 기능은 없어요.</p>
    </>
  )
}
