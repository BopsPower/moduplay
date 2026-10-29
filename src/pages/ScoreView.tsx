import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { supabase, type Assignment, type Score } from '../lib/supabase'
import { loadMscz, type Hands, type LoadedScore } from '../lib/player'
import { BRAND } from '../lib/brand'

export default function ScoreView() {
  const { id } = useParams()
  const { student } = useAuth()
  const [score, setScore] = useState<Score | null>(null)
  const [assign, setAssign] = useState<Assignment | null>(null)
  const [loaded, setLoaded] = useState<LoadedScore | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'nofile' | 'error'>('loading')

  const [playing, setPlaying] = useState(false)
  const [tempo, setTempo] = useState(100)
  const [hands, setHands] = useState<Hands>('both')
  const [loop, setLoop] = useState(false)
  const [metronome, setMetronome] = useState(false)
  const [pos, setPos] = useState(0)          // 초
  const [page, setPage] = useState(0)

  const audioRef = useRef<AudioContext | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const startedAtRef = useRef(0)
  const practicedRef = useRef(0)

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('scores').select('*').eq('id', id).single()
      if (!s) return setStatus('error')
      setScore(s)
      if (s.tempo) setTempo(s.tempo)
      const { data: a } = await supabase.from('assignments').select('*').eq('student_id', student!.id).eq('score_id', s.id).maybeSingle()
      setAssign(a)
      if (a?.target_tempo) setTempo(a.target_tempo)

      const { data: file, error } = await supabase.storage.from('scores').download(s.file_path)
      if (error || !file) return setStatus('nofile')
      try {
        const buf = new Uint8Array(await file.arrayBuffer())
        setLoaded(await loadMscz(buf))
        setStatus('ready')
      } catch (e) {
        console.error(e)
        setStatus('error')
      }
    })()
  }, [id])

  // 재생 위치 → 페이지 자동 넘김
  useEffect(() => {
    if (!loaded) return
    const m = [...loaded.measures].reverse().find(m => m.time <= pos)
    if (m && m.page !== page) setPage(m.page)
  }, [pos, loaded])

  async function play() {
    if (!loaded) return
    if (!audioRef.current) audioRef.current = new AudioContext()
    const ctx = audioRef.current
    await ctx.resume()
    setPlaying(true)
    startedAtRef.current = Date.now()
    const ratio = tempo / (score?.tempo ?? 100)
    const base = ctx.currentTime + 0.1
    const parts = loaded.partNames.map((_, i) => hands === 'both' || (hands === 'right' && i === 0) || (hands === 'left' && i === 1))
    const sources: AudioBufferSourceNode[] = []
    let endTime = 0
    stopRef.current = await loaded.synthAudio(ratio, parts, (chunk, time, done) => {
      const frames = chunk.length / 2
      const buffer = ctx.createBuffer(2, frames, 44100)
      const L = buffer.getChannelData(0), R = buffer.getChannelData(1)
      for (let i = 0; i < frames; i++) { L[i] = chunk[i * 2]; R[i] = chunk[i * 2 + 1] }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = ratio
      src.connect(ctx.destination)
      src.start(base + time / ratio)
      sources.push(src)
      endTime = (time + frames / 44100) / ratio
      if (done) src.onended = () => { if (loop) { stopAll(); play() } else stopAll() }
    })
    const tick = () => {
      if (!stopRef.current) return
      setPos((ctx.currentTime - base) * ratio)
      raf = requestAnimationFrame(tick)
    }
    let raf = requestAnimationFrame(tick)
    function stopAll() {
      cancelAnimationFrame(raf)
      sources.forEach(s => { try { s.stop() } catch { /* already stopped */ } })
      stopRef.current?.()
      stopRef.current = null
      setPlaying(false)
      logPractice()
    }
    ;(stopRef as any).stopAll = stopAll
    void endTime
  }

  function pause() { (stopRef as any).stopAll?.() }
  function toStart() { pause(); setPos(0); setPage(0) }

  async function logPractice() {
    const sec = Math.round((Date.now() - startedAtRef.current) / 1000)
    if (sec < 5 || !score || !student) return
    practicedRef.current += sec
    await supabase.from('practice_logs').insert({ student_id: student.id, score_id: score.id, seconds: sec, tempo, hands })
  }

  useEffect(() => () => { (stopRef as any).stopAll?.() }, [])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const dur = loaded?.duration ?? 0
  const curMeasure = loaded ? loaded.measures.filter(m => m.time <= pos).length : 0

  return (
    <Shell right={
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }} onClick={() => window.print()}>인쇄</button>
        {score && <button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }} onClick={async () => {
          const { data } = await supabase.storage.from('scores').download(score.file_path)
          if (!data) return
          const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = `${score.title}.mscz`; a.click()
        }}>프로그램에서 열기 (.mscz)</button>}
      </div>
    }>
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← 돌아가기</Link>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="title" style={{ fontSize: 24 }}>{score?.title ?? '…'}</h1>
        <span className="muted" style={{ fontSize: 14 }}>{[score?.composer, score?.key_sig].filter(Boolean).join(' · ')}</span>
        {assign?.is_current && <span style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, background: 'var(--accent-soft)', color: '#3730a3', fontSize: 12, fontWeight: 500 }}>이번 주 과제</span>}
      </div>

      <div className="viewer">
        <section className="sheet">
          <div className="card paper">
            <div className="head">
              <span>{BRAND.academy}</span><span>{BRAND.campuses[0].tel}</span>
            </div>
            {status === 'loading' && <div className="loading">악보를 그리는 중…</div>}
            {status === 'nofile' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 500, color: 'var(--ink)' }}>아직 악보 파일이 올라오지 않았어요</p>
                <p style={{ margin: 0 }}>선생님이 악보를 올리면 여기서 바로 보고 들을 수 있어요.</p>
              </div>
            )}
            {status === 'error' && <div className="loading">악보를 여는 데 문제가 생겼어요. 다시 시도해 주세요.</div>}
            {status === 'ready' && loaded && (
              <div style={{ position: 'relative' }}>
                <div dangerouslySetInnerHTML={{ __html: loaded.pages[page] }} />
                {loaded.measures.filter(m => m.page === page && m.id === curMeasure).map(m => (
                  <div key={m.id} className="measure-hl" style={{ left: `${m.x / 12}px`, top: `${m.y / 12}px`, width: `${m.sx / 12}px`, height: `${m.sy / 12}px` }} />
                ))}
                {loaded.pages.length > 1 && (
                  <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 12 }}>
                    <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button>
                    <span>{page + 1} / {loaded.pages.length} 쪽</span>
                    <button className="btn sm" disabled={page >= loaded.pages.length - 1} onClick={() => setPage(p => p + 1)}>다음</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <aside>
          <div className="card controls">
            <div className="transport">
              <button className="round" aria-label="처음으로" onClick={toStart}>⏮</button>
              <button className="round main" aria-label={playing ? '일시정지' : '재생'} disabled={status !== 'ready'} onClick={playing ? pause : play}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button className={'round' + (loop ? ' on' : '')} aria-label="반복 재생" onClick={() => setLoop(v => !v)}>↻</button>
            </div>
            <div>
              <div className="bar"><div style={{ width: `${dur ? Math.min(100, pos / dur * 100) : 0}%` }} /></div>
              <div className="row" style={{ marginTop: 6 }}>
                <span>{fmt(pos)}{curMeasure ? ` · ${curMeasure}마디` : ''}</span><span>{fmt(dur)}</span>
              </div>
            </div>

            <div className="opt">
              <label className="field">
                <span className="l"><span>빠르기</span><span className="muted">♩ = {tempo}{score?.tempo && tempo !== score.tempo ? ` (원래 ${score.tempo})` : ''}</span></span>
                <input type="range" min={40} max={160} step={1} value={tempo} disabled={playing} onChange={e => setTempo(Number(e.target.value))} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>듣고 싶은 손</span>
                <div className="seg">
                  {([['both', '양손'], ['right', '오른손만'], ['left', '왼손만']] as [Hands, string][]).map(([v, l]) => (
                    <button key={v} className={hands === v ? 'on' : ''} disabled={playing} onClick={() => setHands(v)}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="l" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500 }}>
                <span>메트로놈</span>
                <input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} style={{ width: 20, height: 20 }} />
              </label>
            </div>
          </div>

          {assign?.note && (
            <div className="memo">
              <p className="k">선생님 메모</p>
              <p className="v">{assign.note}</p>
              {assign.due_date && <p className="v" style={{ marginTop: 6, fontSize: 13 }}>레슨: {assign.due_date}</p>}
            </div>
          )}
        </aside>
      </div>
    </Shell>
  )
}
