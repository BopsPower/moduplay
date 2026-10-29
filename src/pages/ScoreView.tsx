import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { Metronome, RepCounter, Timer } from '../components/PracticeTools'
import { useAuth } from '../lib/auth'
import { supabase, type Assignment, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'

// 변환 서버가 만든 마디 데이터 (좌표는 페이지 비율 0~1, t는 시작 시각(초) — 반복 시 여러 개)
type Measure = { i: number; page: number; x: number; y: number; w: number; h: number; t: number[] }
type Measures = { pages: { w: number; h: number }[]; measures: Measure[] }
type Loop = { a: number; b: number } | null // 마디 번호(0부터)

const STEP = 4 // "4마디씩" 이동 단위
const isMobileNow = () => window.matchMedia('(max-width: 640px)').matches

export default function ScoreView() {
  const { id } = useParams()
  const { student } = useAuth()
  const [score, setScore] = useState<Score | null>(null)
  const [assign, setAssign] = useState<Assignment | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [measures, setMeasures] = useState<Measures | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'converting' | 'failed' | 'nofile'>('loading')

  const [tempo, setTempo] = useState(100)
  const [metroBpm, setMetroBpm] = useState(100)
  const [reps, setReps] = useState(0)
  const [target, setTarget] = useState(10)
  const [minutes, setMinutes] = useState(3)
  const [mobile, setMobile] = useState(isMobileNow())
  useEffect(() => { const mq = window.matchMedia('(max-width: 640px)'); const h = () => setMobile(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h) }, [])
  const [loop, setLoop] = useState<Loop>(null)
  const [loopPick, setLoopPick] = useState<'a' | 'b' | null>(null) // 구간 지정 중
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(-1) // 현재 마디

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedAtRef = useRef(0)
  const pagesLoadedRef = useRef(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const loopRef = useRef<Loop>(null)
  useEffect(() => { loopRef.current = loop }, [loop])

  async function signed(path: string) {
    const { data } = await supabase.storage.from('scores').createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }

  useEffect(() => {
    let timer: number | undefined
    async function load() {
      const { data: s } = await supabase.from('scores').select('*').eq('id', id).single()
      if (!s) return setStatus('nofile')
      setScore(s)
      if (s.tempo) { setTempo(s.tempo); setMetroBpm(s.tempo) }
      const { data: a } = await supabase.from('assignments').select('*').eq('student_id', student!.id).eq('score_id', s.id).maybeSingle()
      setAssign(a)
      if (a?.target_tempo) { setTempo(a.target_tempo); setMetroBpm(a.target_tempo) }

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
    const onEnd = () => { setPlaying(false); logPractice() }
    a.addEventListener('loadedmetadata', onMeta); a.addEventListener('ended', onEnd)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd) }
  }, [audioUrl, measureAt, startOf, endOf])

  // 빠르기 → 재생 속도
  useEffect(() => {
    const a = audioRef.current
    if (a && score?.tempo) a.playbackRate = Math.max(0.4, Math.min(1.6, tempo / score.tempo))
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
  function pause() { const a = audioRef.current; if (!a) return; a.pause(); setPlaying(false); logPractice() }
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

  async function logPractice() {
    const sec = Math.round((Date.now() - startedAtRef.current) / 1000)
    if (sec < 5 || !score || !student) return
    await supabase.from('practice_logs').insert({ student_id: student.id, score_id: score.id, seconds: sec, tempo })
  }

  // 다운로드: 파일 이름을 제목으로 지정한 서명 URL을 새 창에서 열기 (현재 화면은 그대로 유지)
  async function download(path: string, name: string) {
    const win = window.open('', '_blank') // 팝업 차단을 피하려고 클릭 직후에 먼저 창을 열어 둠
    const { data } = await supabase.storage.from('scores').createSignedUrl(path, 3600, { download: name })
    if (!data?.signedUrl) { win?.close(); return }
    if (win) win.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank')
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const total = measures?.measures.length ?? 0
  const inLoop = (m: number) => !!loop && m >= loop.a && m <= loop.b

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
      score && status === 'ready' ? (
        <details className="dl">
          <summary className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666', cursor: 'pointer', listStyle: 'none' }}>다운로드 ▾</summary>
          <div className="dl-menu">
            {([
              ['PDF 악보', score.pdf_path, '.pdf'],
              ['MuseScore 파일', score.mscz_path ?? (/\.mscz$/i.test(score.file_path) ? score.file_path : null), '.mscz'],
              ['MusicXML', score.xml_path, '.musicxml'],
              ['MIDI', score.midi_path, '.mid'],
              ['MP3 (소리)', score.mp3_path, '.mp3'],
            ] as [string, string | null | undefined, string][]).map(([label, p, ext]) => (
              <button key={ext} disabled={!p} onClick={() => p && download(p, score.title + ext)}>
                {label}<span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{p ? ext : '준비 중'}</span>
              </button>
            ))}
            {!/\.mscz$/i.test(score.file_path) && <button onClick={() => download(score.file_path, score.title + score.file_path.slice(score.file_path.lastIndexOf('.')))}>올린 원본 파일<span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{score.file_path.slice(score.file_path.lastIndexOf('.'))}</span></button>}
          </div>
        </details>
      ) : null
    }>
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← 돌아가기</Link>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="title" style={{ fontSize: 24 }}>{score?.title ?? '…'}</h1>
        <span className="muted" style={{ fontSize: 14 }}>{[score?.composer, score?.key_sig].filter(Boolean).join(' · ')}</span>
        {assign?.is_current && <span style={{ marginLeft: 'auto', padding: '4px 10px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontSize: 12, fontWeight: 700 }}>이번 주 과제</span>}
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      <div className="viewer">
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
                <p style={{ margin: 0 }}>선생님이 악보를 올리면 여기서 바로 보고 들을 수 있어요.</p>
              </div>
            )}
            {status === 'failed' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>이 악보는 준비 중 문제가 생겼어요</p>
                <p style={{ margin: 0 }}>선생님께 알려주시면 다시 올려드릴게요. {score && <>그동안 <button className="btn sm ghost" onClick={() => download(score.file_path, score.title + score.file_path.slice(score.file_path.lastIndexOf('.')))}>파일 받기</button>로 프로그램에서 열 수 있어요.</>}</p>
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
                  {/\.pdf$/i.test(score?.file_path ?? '') ? '이 악보는 PDF로 올라와서 보기·인쇄만 돼요. 재생과 마디 이동은 MuseScore·MusicXML 파일로 올린 악보에서 돼요.' : score?.convert_error ? '이 악보는 소리 파일이 없어요.' : '소리를 만들고 있어요 (몇 분 걸려요). 악보는 먼저 보셔도 돼요.'}
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
                <span className="l" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>빠르기</span><span className="muted" style={{ fontWeight: 400 }}>♩ = {tempo}{score?.tempo && tempo !== score.tempo ? ` (원래 ${score.tempo})` : ''}</span></span>
                <input type="range" min={40} max={160} step={1} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
              </label>
            </div>
          </div>

          </details>
          <details open={!mobile} className="tools">
            <summary className="card" style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}><span>연습 도구 (메트로놈 · 타이머 · 반복)</span><span className="muted">▾</span></summary>
          <Metronome bpm={metroBpm} onBpm={setMetroBpm} />
          <Timer onMinutes={setMinutes} onDone={async sec => { setReps(r => r + 1); if (score && student) await supabase.from('practice_logs').insert({ student_id: student.id, score_id: score.id, seconds: sec, tempo: metroBpm }) }} />
          <RepCounter reps={reps} target={target} onReps={setReps} onTarget={setTarget} bpm={metroBpm} minutes={minutes} />
          </details>

          {assign?.note && (
            <div className="memo">
              <p className="k">선생님 메모</p>
              <p className="v">{assign.note}</p>
              {assign.due_date && <p className="v" style={{ marginTop: 6, fontSize: 13 }}>다음 레슨: {assign.due_date}</p>}
            </div>
          )}
        </aside>
      </div>
    </Shell>
  )
}
