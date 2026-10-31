import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { useTools } from '../lib/tools'
import { usePracticeActive } from '../lib/practice'
import { KindBadge } from '../components/MaterialRow'
import Comments from '../components/Comments'
import { useAuth } from '../lib/auth'
import { supabase, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { dateLabel, isAudioFile, isPdfFile, myBookmarks, setBookmark, uploaderLabel, VIS_LABEL } from '../lib/materials'

const PdfPages = lazy(() => import('../components/PdfPages')) // PDF 볼 때만 불러옴
const FocusReader = lazy(() => import('../components/FocusReader')) // 악보만 크게 보기
const YouTubePlayer = lazy(() => import('../components/YouTubePlayer')) // 유튜브 영상 (앱 안에서 재생)

// 변환 서버가 만든 마디 데이터 (좌표는 페이지 비율 0~1, t는 시작 시각(초) — 반복 시 여러 개)
type Measure = { i: number; page: number; x: number; y: number; w: number; h: number; t: number[] }
type Measures = { pages: { w: number; h: number }[]; measures: Measure[] }
type Loop = { a: number; b: number } | null // 마디 번호(0부터)

const STEP = 4 // "4마디씩" 이동 단위
const isMobileNow = () => window.matchMedia('(max-width: 640px)').matches

export default function ScoreView() {
  const { id } = useParams()
  const { isTeacher, isAdmin, session } = useAuth()
  const navigate = useNavigate()
  const [score, setScore] = useState<Score | null>(null)
  const [saved, setSaved] = useState(false)
  const [pages, setPages] = useState<string[]>([])
  const [measures, setMeasures] = useState<Measures | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [focus, setFocus] = useState(false) // 악보만 크게 보기
  const [status, setStatus] = useState<'loading' | 'ready' | 'converting' | 'failed' | 'nofile' | 'video'>('loading')

  const [tempo, setTempo] = useState(100)
  const tools = useTools()
  const [mobile, setMobile] = useState(isMobileNow())
  useEffect(() => { const mq = window.matchMedia('(max-width: 640px)'); const h = () => setMobile(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h) }, [])
  const [loop, setLoop] = useState<Loop>(null)
  const [loopPick, setLoopPick] = useState<'a' | 'b' | null>(null) // 구간 지정 중
  const [playing, setPlaying] = useState(false)
  usePracticeActive('score-audio', playing)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(-1) // 현재 마디

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedAtRef = useRef(0)
  const pagesLoadedRef = useRef(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const loopRef = useRef<Loop>(null)
  useEffect(() => { loopRef.current = loop }, [loop])

  async function signed(path: string, sec = 3600) {
    const { data } = await supabase.storage.from('scores').createSignedUrl(path, sec)
    return data?.signedUrl ?? null
  }

  useEffect(() => {
    let timer: number | undefined
    async function load() {
      const { data: s } = await supabase.from('scores').select('*').eq('id', id).single()
      if (!s) return setStatus('nofile')
      setScore(s)
      if (s.tempo) setTempo(s.tempo)

      // 영상만 있는 자료
      if (!s.file_path) { setStatus(s.youtube_url ? 'video' : 'nofile'); return }
      // 음원 자료(직접 녹음한 반주·시범): 악보 없이 재생만
      if (isAudioFile(s.file_path)) {
        setAudioUrl(await signed(s.mp3_path ?? s.file_path, 6 * 3600))
        setStatus('ready')
        return
      }
      // PDF 원본: 서버 변환 없이 브라우저에서 바로 그림 (쪽 그림을 기다리지 않음)
      if (isPdfFile(s.file_path)) {
        setPdfUrl(await signed(s.file_path, 6 * 3600))
        setStatus('ready')
        return
      }

      if (s.convert_status === 'done' && s.page_count) {
        const base = `out/${s.id}`
        if (!pagesLoadedRef.current) {
          const urls = await Promise.all(Array.from({ length: s.page_count }, (_, i) => signed(`${base}/page-${i + 1}.png`)))
          setPages(urls.filter(Boolean) as string[])
          pagesLoadedRef.current = true
          if (s.measures_path) {
            const u = await signed(s.measures_path)
            if (u) { try { setMeasures(await (await fetch(u)).json()); setCur(0) } catch { /* 마디 데이터 없이도 동작 */ } }
          }
        }
        if (s.mp3_path) setAudioUrl(await signed(s.mp3_path))
        else if (!s.convert_error) timer = window.setTimeout(load, 10000) // 페이지는 준비됨, 소리는 아직 만드는 중 → 계속 확인
        setStatus('ready')
      } else if (s.convert_status === 'failed') {
        setStatus(s.file_path.startsWith('demo/') ? 'nofile' : 'failed')
      } else {
        setStatus('converting')
        timer = window.setTimeout(load, 8000) // 변환 중이면 8초마다 다시 확인
      }
    }
    load()
    return () => { if (timer) clearTimeout(timer) }
  }, [id])

  useEffect(() => { if (id) myBookmarks().then(b => setSaved(b.has(id))) }, [id])

  // 시간순 이벤트 목록: [{t, m}] — 반복이 있으면 같은 마디가 여러 번 나옴
  const timeline = useMemo(() => {
    if (!measures) return [] as { t: number; m: number }[]
    const ev: { t: number; m: number }[] = []
    measures.measures.forEach(m => m.t.forEach(t => ev.push({ t, m: m.i })))
    return ev.sort((a, b) => a.t - b.t)
  }, [measures])

  const measureAt = useCallback((t: number) => {
    if (!timeline.length) return -1
    let lo = 0, hi = timeline.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (timeline[mid].t <= t + 0.02) lo = mid; else hi = mid - 1 }
    return timeline[lo].t <= t + 0.02 ? timeline[lo].m : -1
  }, [timeline])

  const startOf = useCallback((m: number) => measures?.measures[m]?.t[0] ?? 0, [measures])
  // 마디 m이 끝나는 시각 = 시간순으로 다음 이벤트의 시각
  const endOf = useCallback((m: number) => {
    const s = startOf(m)
    const next = timeline.find(e => e.t > s + 0.02)
    return next ? next.t : dur
  }, [timeline, startOf, dur])

  // 오디오 이벤트 + 부드러운 커서(requestAnimationFrame)
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    let raf = 0
    const tick = () => {
      const t = a.currentTime
      setPos(t)
      const lp = loopRef.current
      if (lp && !a.paused && t >= endOf(lp.b) - 0.03) { a.currentTime = startOf(lp.a) }
      if (!a.paused) setCur(measureAt(a.currentTime))
      raf = requestAnimationFrame(tick)
    }
    const onMeta = () => setDur(a.duration || 0)
    const onEnd = () => setPlaying(false)
    a.addEventListener('loadedmetadata', onMeta); a.addEventListener('ended', onEnd)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd) }
  }, [audioUrl, measureAt, startOf, endOf])

  // 빠르기 → 재생 속도
  useEffect(() => {
    const a = audioRef.current
    if (a && score) { (a as any).preservesPitch = true; a.playbackRate = Math.max(0.4, Math.min(1.6, tempo / (score.tempo || 100))) }
  }, [tempo, score, audioUrl])

  // 현재 마디가 화면 밖이면 따라가기
  useEffect(() => {
    if (cur < 0 || !playing) return
    const el = sheetRef.current?.querySelector<HTMLElement>(`[data-m="${cur}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 80 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cur, playing])

  function seekTo(t: number) { const a = audioRef.current; if (a) a.currentTime = Math.max(0, Math.min(dur || t, t)); setPos(t); setCur(measureAt(t)) }
  function play() { const a = audioRef.current; if (!a) return; a.play(); setPlaying(true); startedAtRef.current = Date.now() }
  function pause() { const a = audioRef.current; if (!a) return; a.pause(); setPlaying(false) }
  function toStart() { seekTo(loop ? startOf(loop.a) : 0) }
  function stepBy(n: number) {
    const m = Math.max(0, Math.min((measures?.measures.length ?? 1) - 1, (cur < 0 ? 0 : cur) + n))
    seekTo(startOf(m))
  }

  // 마디 클릭: 구간 지정 중이면 A/B로, 아니면 그 마디로 이동
  function clickMeasure(m: number) {
    if (loopPick === 'a') { setLoop({ a: m, b: Math.max(m, loop?.b ?? m) }); setLoopPick('b'); seekTo(startOf(m)); return }
    if (loopPick === 'b') { const a = loop?.a ?? 0; setLoop({ a: Math.min(a, m), b: Math.max(a, m) }); setLoopPick(null); seekTo(startOf(Math.min(a, m))); return }
    seekTo(startOf(m))
  }
  function startLoopPick() { setLoopPick('a'); setLoop(null) }
  function clearLoop() { setLoop(null); setLoopPick(null) }
  // 빠르게: 현재 마디부터 4마디 반복
  function loopHere() { const a = cur < 0 ? 0 : cur; const b = Math.min((measures?.measures.length ?? 1) - 1, a + STEP - 1); setLoop({ a, b }); setLoopPick(null); seekTo(startOf(a)) }

  // 다운로드: 파일 이름을 제목으로 지정한 서명 URL을 새 창에서 열기 (현재 화면은 그대로 유지)
  async function download(path: string, name: string) {
    const win = window.open('', '_blank') // 팝업 차단을 피하려고 클릭 직후에 먼저 창을 열어 둠
    const { data } = await supabase.storage.from('scores').createSignedUrl(path, 3600, { download: name })
    if (!data?.signedUrl) { win?.close(); return }
    if (win) win.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank')
  }

  // 프린트: PC는 바로 인쇄창, 휴대폰은 PDF를 새 창으로 열어 공유 → 프린트
  const [printing, setPrinting] = useState(false)
  const pdfFor = (sc: Score) => sc.pdf_path ?? (isPdfFile(sc.file_path) ? sc.file_path : null)
  async function printScore() {
    if (!score) return
    const p = pdfFor(score)
    if (!p) return
    const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const win = phone ? window.open('', '_blank') : null // 팝업 차단 피하려고 먼저 열어 둠
    setPrinting(true)
    try {
      const url = await signed(p, 3600)
      if (!url) { win?.close(); return }
      if (phone) { if (win) win.location.href = url; else window.open(url, '_blank'); return }
      const blob = await (await fetch(url)).blob()
      const obj = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      const f = document.createElement('iframe')
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'
      f.src = obj
      f.onload = () => setTimeout(() => {
        try { f.contentWindow?.focus(); f.contentWindow?.print() } catch { window.open(obj, '_blank') }
      }, 300)
      document.body.appendChild(f)
      setTimeout(() => { f.remove(); URL.revokeObjectURL(obj) }, 10 * 60 * 1000)
    } catch { win?.close() } finally { setPrinting(false) }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const total = measures?.measures.length ?? 0
  const inLoop = (m: number) => !!loop && m >= loop.a && m <= loop.b

  // 보기 전용 자료(교재 포함)는 다운로드·프린트를 막음 (코치·올린 본인은 가능)
  const mineScore = !!score && !!session && score.created_by === session.user.id
  const locked = !!score && (score.view_only || score.category === '교재') && !isTeacher && !mineScore
  const canEdit = mineScore || isAdmin
  const isBook = !!score && (score.kind === '교재' || score.category === '교재')
  const fp = score?.file_path ?? ''

  async function toggleSave() {
    if (!score) return
    const on = !saved
    setSaved(on)
    const { error } = await setBookmark(score.id, on)
    if (error) setSaved(!on)
  }
  async function remove() {
    if (!score || !confirm(`'${score.title}' 자료를 지울까요? 지우면 되돌릴 수 없어요.`)) return
    const { error } = await supabase.from('scores').delete().eq('id', score.id)
    if (error) return alert('지우지 못했어요: ' + error.message)
    if (score.file_path) await supabase.storage.from('scores').remove([score.file_path])
    navigate('/board', { replace: true })
  }
  async function setHidden(h: boolean) {
    if (!score) return
    const { error } = await supabase.rpc('set_score_hidden', { sid: score.id, h })
    if (error) return alert('바꾸지 못했어요: ' + error.message)
    setScore({ ...score, hidden: h })
  }
  async function report() {
    if (!score) return
    const reason = prompt('코치님이 확인해 줬으면 하는 점을 적어 주세요.\n(예: 악보가 틀린 것 같아요, 학원 밖 자료를 그대로 올렸어요, 장난 글이에요)')
    if (!reason?.trim()) return
    const { error } = await supabase.from('score_reports').insert({ score_id: score.id, reason: reason.trim().slice(0, 500) })
    alert(error ? '보내지 못했어요. 잠시 뒤에 다시 해 주세요.' : '확인 요청을 보냈어요. 코치님이 살펴볼게요.')
  }

  return (
    <Shell bottomBar={status === 'ready' ? (
      <div className="mobar">
        <button className="round" aria-label="처음으로" onClick={toStart}>⏮</button>
        <button className="round" aria-label={`${STEP}마디 뒤로`} disabled={!total} onClick={() => stepBy(-STEP)}>−{STEP}</button>
        <button className="round main" aria-label={playing ? '일시정지' : '재생'} disabled={!audioUrl} onClick={playing ? pause : play}>{playing ? '❚❚' : '▶'}</button>
        <button className="round" aria-label={`${STEP}마디 앞으로`} disabled={!total} onClick={() => stepBy(STEP)}>+{STEP}</button>
        <button className={'round' + (loop ? ' on' : '')} aria-label="구간 반복" disabled={!total} onClick={loop ? clearLoop : loopHere}>↻</button>
        <span className="info">{cur >= 0 ? `${cur + 1}/${total}마디` : fmt(pos)}<br /><span style={{ opacity: .7 }}>{loop ? `반복 ${loop.a + 1}~${loop.b + 1}` : fmt(dur)}</span></span>
      </div>
    ) : undefined} right={
      score && status === 'ready' ? (locked ? (
        <span style={{ color: '#bbb', fontSize: 12 }} title="다운로드할 수 없는 자료예요. 종이로 필요하면 학원에 말해 주세요.">🔒 {isBook ? '교재 · ' : ''}보기 전용</span>
      ) : (
        <>
        {pdfFor(score) && <button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }} onClick={printScore} disabled={printing} title="악보 프린트">{printing ? '준비 중…' : '프린트'}</button>}
        <details className="dl">
          <summary className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666', cursor: 'pointer', listStyle: 'none' }}>다운로드 ▾</summary>
          <div className="dl-menu">
            {([
              ['PDF 악보', pdfFor(score), '.pdf'],
              ['MuseScore 파일 (편곡·수정용)', score.mscz_path ?? (/\.mscz$/i.test(fp) ? fp : null), '.mscz'],
              ['MusicXML', score.xml_path, '.musicxml'],
              ['MIDI', score.midi_path, '.mid'],
              ['MP3 (소리)', isAudioFile(fp) ? null : score.mp3_path, '.mp3'],
            ] as [string, string | null | undefined, string][]).filter(([, p]) => !isAudioFile(fp) || p).map(([label, p, ext]) => (
              <button key={ext} disabled={!p} onClick={() => p && download(p, score.title + ext)}>
                {label}<span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{p ? ext : '준비 중'}</span>
              </button>
            ))}
            {fp && !/\.(mscz|pdf)$/i.test(fp) && <button onClick={() => download(fp, score.title + fp.slice(fp.lastIndexOf('.')))}>{isAudioFile(fp) ? '음원 파일' : '올린 원본 파일'}<span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{fp.slice(fp.lastIndexOf('.'))}</span></button>}
            <Link to="/guide/musescore" style={{ padding: '11px 14px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--accent-deep)', textDecoration: 'none' }}>편곡·수정은 뮤즈스코어에서 → 사용법</Link>
          </div>
        </details>
        </>
      )) : null
    }>
      <button type="button" className="linkish muted" style={{ fontSize: 14, alignSelf: 'flex-start' }} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/board'))}>← 돌아가기</button>

      <section className="mat-head">
        {score && (
          <div className="badges">
            <KindBadge s={score} />
            {score.major && <span className="b">{score.major}</span>}
            {(score.areas ?? []).map(a => <span key={a} className="b">{a}</span>)}
            {score.level && <span className="b">{score.level}</span>}
            {(score.tags ?? []).map(t => <span key={t} className="b tag">#{t}</span>)}
            {score.visibility !== 'students' && score.visibility !== 'public' && <span className="b scope">{VIS_LABEL[score.visibility]}</span>}
            {score.hidden && <span className="b scope">가려 둔 자료</span>}
          </div>
        )}
        <h1 className="title" style={{ fontSize: 24 }}>{score?.title ?? '…'}</h1>
        {score && (
          <p className="muted by">
            {[score.artist || score.composer ? `원곡 ${[score.artist || score.composer, score.song].filter(Boolean).join(' · ')}` : null, score.key_sig].filter(Boolean).join(' · ')}
            {(score.artist || score.composer || score.key_sig) ? ' · ' : ''}올린 사람 <b className={score.uploader_role === 'student' ? 'by-st' : 'by-co'}>{uploaderLabel(score)}</b>
            {score.uploader_role === 'student' && <span className="st-badge">학생 자료</span>}
            {' · '}{dateLabel(score.created_at)}
          </p>
        )}
        {score && (
          <div className="mat-actions">
            {status === 'ready' && (pages.length > 0 || pdfUrl) && <button type="button" className="btn sm primary" onClick={() => setFocus(true)}>악보만 크게 보기</button>}
            <button type="button" className={'btn sm' + (saved ? ' dark' : '')} onClick={toggleSave} aria-pressed={saved}>{saved ? '★ 보관함에 있어요' : '☆ 보관함에 담기'}</button>
            <Link to={`/score/${score.id}/qr`} className="btn sm">QR 뽑기</Link>
            {canEdit && <Link to={`/upload?edit=${score.id}`} className="btn sm">정보 고치기</Link>}
            {canEdit && <button type="button" className="btn sm ghost" onClick={remove}>지우기</button>}
            {isTeacher && !mineScore && <button type="button" className="btn sm ghost" onClick={() => setHidden(!score.hidden)}>{score.hidden ? '다시 보이기' : '잠시 가리기'}</button>}
          </div>
        )}
        {locked && (
          <p className="lock-note">🔒 보기 전용 자료예요. 앱에서 보기만 할 수 있고 다운로드·프린트는 안 돼요. 종이 악보가 필요하면 학원(코치님이나 데스크)에 말해 주세요. 복사해서 드릴게요.</p>
        )}
      </section>

      {score?.coach_memo && (
        <div className="memo">
          <p className="k">코치 메모</p>
          <p className="v" style={{ whiteSpace: 'pre-wrap' }}>{score.coach_memo}</p>
        </div>
      )}
      {score?.description && <p className="mat-desc">{score.description}</p>}

      {score?.youtube_url && (
        <section className="sec">
          <div className="sec-h"><h2>{status === 'video' ? '영상' : '함께 볼 영상'} <span className="muted" style={{ fontSize: 13, fontFamily: 'inherit' }}>· 앱 안에서 재생</span></h2></div>
          <Suspense fallback={<div className="loading">영상을 여는 중…</div>}>
            <YouTubePlayer url={score.youtube_url} marks={score.yt_marks} title={score.title} />
          </Suspense>
          <Link to="/player?tab=file" className="muted" style={{ fontSize: 13 }}>내가 가진 음원으로 키·템포 바꿔 연습하기 →</Link>
        </section>
      )}

      {focus && (
        <Suspense fallback={<div className="focus"><p style={{ color: '#fff', margin: 'auto' }}>여는 중…</p></div>}>
          <FocusReader images={pages.length ? pages : undefined} pdfUrl={pdfUrl} title={score?.title ?? ''} onClose={() => setFocus(false)} />
        </Suspense>
      )}

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      {status !== 'video' && <div className="viewer">
        <section className="sheet" ref={sheetRef}>
          {loopPick && (
            <div className="memo" style={{ position: 'sticky', top: 8, zIndex: 5 }}>
              <p className="k">구간 반복 지정</p>
              <p className="v">{loopPick === 'a' ? '반복을 시작할 마디를 악보에서 눌러주세요.' : '반복을 끝낼 마디를 눌러주세요.'} <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={clearLoop}>취소</button></p>
            </div>
          )}
          <div className="card paper">
            {status === 'loading' && <div className="loading">악보를 불러오는 중…</div>}
            {status === 'converting' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>악보를 준비하고 있어요</p>
                <p style={{ margin: 0 }}>처음 올린 악보는 30초쯤 걸려요. 이 화면은 자동으로 바뀌어요.</p>
              </div>
            )}
            {status === 'nofile' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>아직 악보 파일이 올라오지 않았어요</p>
                <p style={{ margin: 0 }}>자료가 지워졌거나 볼 수 없는 자료예요.</p>
              </div>
            )}
            {status === 'failed' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>이 악보는 준비 중 문제가 생겼어요</p>
                <p style={{ margin: 0 }}>올린 분께 알려주시면 다시 올려드릴게요. {score && fp && !locked && <>그동안 <button className="btn sm ghost" onClick={() => download(fp, score.title + fp.slice(fp.lastIndexOf('.')))}>파일 받기</button>로 프로그램에서 열 수 있어요.</>}</p>
              </div>
            )}
            {status === 'ready' && isAudioFile(fp) && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>♪ 음원 자료예요</p>
                <p style={{ margin: 0 }}>재생 버튼으로 들어 보세요. 빠르기를 줄이면 음높이는 그대로 느리게 들려요.</p>
              </div>
            )}
            {status === 'ready' && pages.map((src, p) => (
              <div key={p} className="page" style={{ position: 'relative' }}>
                <img src={src} alt={`${score?.title} ${p + 1}쪽`} style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid var(--line)' }} />
                {/* 마디 클릭 영역 + 하이라이트 */}
                {measures?.measures.filter(m => m.page === p).map(m => (
                  <div key={m.i} data-m={m.i} role="button" aria-label={`${m.i + 1}마디`}
                    onClick={() => clickMeasure(m.i)}
                    className={'measure' + (m.i === cur ? ' cur' : '') + (inLoop(m.i) ? ' loop' : '') + (loopPick ? ' picking' : '')}
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }} />
                ))}
                <span className="muted" style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 11 }}>{p + 1} / {pages.length}</span>
              </div>
            ))}
            {status === 'ready' && pdfUrl && (
              <Suspense fallback={<div className="loading">PDF를 여는 중…</div>}>
                <PdfPages url={pdfUrl} title={score?.title ?? ''} />
              </Suspense>
            )}
            {status === 'ready' && (
              <div className="head" style={{ justifyContent: 'center', gap: 10, paddingTop: 8 }}>
                <span>{BRAND.academy}</span><span>·</span><a href={BRAND.site} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>www.modu-music.com</a>
              </div>
            )}
          </div>
        </section>

        <aside style={{ position: 'sticky', top: 16 }}>
          <details open={!mobile} className="tools">
            <summary className="card" style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}><span>재생 · 구간 반복 · 빠르기</span><span className="muted">▾</span></summary>
          <div className="card controls">
            <div className="transport">
              <button className="round" aria-label="처음으로" title="처음으로" onClick={toStart}>⏮</button>
              <button className="round" aria-label={`${STEP}마디 뒤로`} title={`${STEP}마디 뒤로`} disabled={!total} onClick={() => stepBy(-STEP)}>−{STEP}</button>
              <button className="round main" aria-label={playing ? '일시정지' : '재생'} disabled={!audioUrl} onClick={playing ? pause : play}>{playing ? '❚❚' : '▶'}</button>
              <button className="round" aria-label={`${STEP}마디 앞으로`} title={`${STEP}마디 앞으로`} disabled={!total} onClick={() => stepBy(STEP)}>+{STEP}</button>
              <button className={'round' + (loop ? ' on' : '')} aria-label="구간 반복" title="현재 마디부터 4마디 반복" disabled={!total} onClick={loop ? clearLoop : loopHere}>↻</button>
            </div>
            <div>
              <div className="bar" onClick={e => { if (!dur) return; const r = (e.target as HTMLElement).closest('.bar')!.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width * dur) }} style={{ cursor: 'pointer' }}>
                <div style={{ width: `${dur ? Math.min(100, pos / dur * 100) : 0}%` }} />
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <span>{fmt(pos)}{cur >= 0 && <> · <b style={{ color: 'var(--ink)' }}>{cur + 1}</b>/{total}마디</>}</span>
                <span>{fmt(dur)}</span>
              </div>
              {!audioUrl && status === 'ready' && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                  {isPdfFile(fp) ? '이 악보는 PDF로 올라와서 보기만 돼요. 재생과 마디 이동은 MuseScore·MusicXML 파일로 올린 악보에서 돼요.' : score?.convert_error ? '이 악보는 소리 파일이 없어요.' : '소리를 만들고 있어요 (몇 분 걸려요). 악보는 먼저 보셔도 돼요.'}
                </p>
              )}
            </div>

            <div className="opt">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
                  <span>구간 반복</span>
                  <span className="muted" style={{ fontWeight: 400 }}>{loop ? `${loop.a + 1}~${loop.b + 1}마디` : '꺼짐'}</span>
                </span>
                <div className="seg">
                  <button className={loopPick ? 'on' : ''} disabled={!total} onClick={startLoopPick}>악보에서 고르기</button>
                  <button disabled={!total} onClick={loopHere}>여기부터 {STEP}마디</button>
                  <button disabled={!loop} onClick={clearLoop}>끄기</button>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>악보에서 마디를 누르면 그 자리부터 시작해요. 재생 전에 골라 두셔도 돼요.</p>
              </div>
              <label className="field">
                <span className="l" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>빠르기</span><span className="muted" style={{ fontWeight: 400 }}>{score?.tempo ? <>♩ = {tempo}{tempo !== score.tempo ? ` (원래 ${score.tempo})` : ''}</> : `${tempo}%`}</span></span>
                <input type="range" min={40} max={160} step={1} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
              </label>
            </div>
          </div>

          </details>
          {/* 메트로놈·스톱워치·횟수 세기는 어느 화면에서나 쓰는 '연습 도구'로 (오른쪽 아래 버튼) */}
          <button type="button" className="card" style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { if (score?.tempo && !tools.metroOn) tools.setBpm(score.tempo); tools.show('metro') }}>
            <span>연습 도구 (메트로놈 · 스톱워치 · 횟수 세기)</span><span className="muted">{score?.tempo && !tools.metroOn ? `♩=${score.tempo}로 열기` : '열기'}</span>
          </button>

        </aside>
      </div>}

      {score && <Comments scoreId={score.id} uploaderId={score.created_by ?? null} />}

      {score && !mineScore && (
        <button type="button" className="linkish muted" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={report}>⚑ 코치님께 확인 요청</button>
      )}
    </Shell>
  )
}
