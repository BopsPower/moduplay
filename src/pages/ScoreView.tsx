import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { supabase, type Assignment, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'

type Hands = 'both' | 'right' | 'left'

// 변환 서버가 만들어둔 결과물(페이지 PNG + MP3)을 보여주고 재생합니다.
export default function ScoreView() {
  const { id } = useParams()
  const { student } = useAuth()
  const [score, setScore] = useState<Score | null>(null)
  const [assign, setAssign] = useState<Assignment | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'converting' | 'failed' | 'nofile'>('loading')

  const [tempo, setTempo] = useState(100)
  const [hands, setHands] = useState<Hands>('both')
  const [loop, setLoop] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [page, setPage] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedAtRef = useRef(0)

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
      if (s.tempo) setTempo(s.tempo)
      const { data: a } = await supabase.from('assignments').select('*').eq('student_id', student!.id).eq('score_id', s.id).maybeSingle()
      setAssign(a)
      if (a?.target_tempo) setTempo(a.target_tempo)

      if (s.convert_status === 'done' && s.page_count) {
        const base = `out/${s.id}`
        const urls = await Promise.all(Array.from({ length: s.page_count }, (_, i) => signed(`${base}/page-${i + 1}.png`)))
        setPages(urls.filter(Boolean) as string[])
        if (s.mp3_path) setAudioUrl(await signed(s.mp3_path))
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

  // 오디오 이벤트
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setPos(a.currentTime)
    const onMeta = () => setDur(a.duration || 0)
    const onEnd = () => { if (loop) { a.currentTime = 0; a.play() } else { setPlaying(false); logPractice() } }
    a.addEventListener('timeupdate', onTime); a.addEventListener('loadedmetadata', onMeta); a.addEventListener('ended', onEnd)
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd) }
  }, [audioUrl, loop])

  // 빠르기 → 재생 속도
  useEffect(() => {
    const a = audioRef.current
    if (a && score?.tempo) a.playbackRate = Math.max(0.4, Math.min(1.6, tempo / score.tempo))
  }, [tempo, score, audioUrl])

  // 재생 위치 → 페이지 자동 넘김 (페이지 수로 균등 추정)
  useEffect(() => {
    if (!dur || pages.length < 2) return
    const p = Math.min(pages.length - 1, Math.floor(pos / dur * pages.length))
    if (p !== page) setPage(p)
  }, [pos, dur, pages.length])

  function play() { const a = audioRef.current; if (!a) return; a.play(); setPlaying(true); startedAtRef.current = Date.now() }
  function pause() { const a = audioRef.current; if (!a) return; a.pause(); setPlaying(false); logPractice() }
  function toStart() { const a = audioRef.current; if (a) a.currentTime = 0; setPos(0); setPage(0) }

  async function logPractice() {
    const sec = Math.round((Date.now() - startedAtRef.current) / 1000)
    if (sec < 5 || !score || !student) return
    await supabase.from('practice_logs').insert({ student_id: student.id, score_id: score.id, seconds: sec, tempo, hands })
  }

  async function download(path: string, name: string) {
    const url = await signed(path)
    if (!url) return
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <Shell right={
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {score?.pdf_path && <button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }} onClick={() => download(score.pdf_path!, `${score.title}.pdf`)}>PDF</button>}
        {score && <button className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }} onClick={() => download(score.file_path, `${score.title}.mscz`)}>프로그램에서 열기 (.mscz)</button>}
      </div>
    }>
      <Link to="/" className="muted" style={{ fontSize: 14 }}>← 돌아가기</Link>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="title" style={{ fontSize: 24 }}>{score?.title ?? '…'}</h1>
        <span className="muted" style={{ fontSize: 14 }}>{[score?.composer, score?.key_sig].filter(Boolean).join(' · ')}</span>
        {assign?.is_current && <span style={{ marginLeft: 'auto', padding: '4px 10px', background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontSize: 12, fontWeight: 700 }}>이번 주 과제</span>}
      </div>

      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

      <div className="viewer">
        <section className="sheet">
          <div className="card paper">
            <div className="head"><span>{BRAND.academy}</span><span>{BRAND.campuses[0].tel}</span></div>
            {status === 'loading' && <div className="loading">악보를 불러오는 중…</div>}
            {status === 'converting' && (
              <div className="loading">
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>악보를 준비하고 있어요</p>
                <p style={{ margin: 0 }}>처음 올린 악보는 1~3분 정도 걸려요. 이 화면은 자동으로 바뀌어요.</p>
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
                <p style={{ margin: 0 }}>선생님께 알려주시면 다시 올려드릴게요. {score && <>그동안 <button className="btn sm ghost" onClick={() => download(score.file_path, `${score.title}.mscz`)}>파일 받기</button>로 프로그램에서 열 수 있어요.</>}</p>
              </div>
            )}
            {status === 'ready' && pages.length > 0 && (
              <>
                <img src={pages[page]} alt={`${score?.title} ${page + 1}쪽`} style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid var(--line)' }} />
                {pages.length > 1 && (
                  <div className="row" style={{ justifyContent: 'center', gap: 12, alignItems: 'center' }}>
                    <button className="btn sm ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button>
                    <span>{page + 1} / {pages.length} 쪽</span>
                    <button className="btn sm ghost" disabled={page >= pages.length - 1} onClick={() => setPage(p => p + 1)}>다음</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <aside>
          <div className="card controls">
            <div className="transport">
              <button className="round" aria-label="처음으로" onClick={toStart}>⏮</button>
              <button className="round main" aria-label={playing ? '일시정지' : '재생'} disabled={!audioUrl} onClick={playing ? pause : play}>{playing ? '❚❚' : '▶'}</button>
              <button className={'round' + (loop ? ' on' : '')} aria-label="반복 재생" onClick={() => setLoop(v => !v)}>↻</button>
            </div>
            <div>
              <div className="bar" onClick={e => { const a = audioRef.current; if (!a || !dur) return; const r = (e.target as HTMLElement).closest('.bar')!.getBoundingClientRect(); a.currentTime = (e.clientX - r.left) / r.width * dur }} style={{ cursor: 'pointer' }}>
                <div style={{ width: `${dur ? Math.min(100, pos / dur * 100) : 0}%` }} />
              </div>
              <div className="row" style={{ marginTop: 6 }}><span>{fmt(pos)}</span><span>{fmt(dur)}</span></div>
              {!audioUrl && status === 'ready' && <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>이 악보는 소리 파일이 없어요.</p>}
            </div>

            <div className="opt">
              <label className="field">
                <span className="l" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}><span>빠르기</span><span className="muted" style={{ fontWeight: 400 }}>♩ = {tempo}{score?.tempo && tempo !== score.tempo ? ` (원래 ${score.tempo})` : ''}</span></span>
                <input type="range" min={40} max={160} step={1} value={tempo} onChange={e => setTempo(Number(e.target.value))} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>듣고 싶은 손</span>
                <div className="seg">
                  {([['both', '양손'], ['right', '오른손만'], ['left', '왼손만']] as [Hands, string][]).map(([v, l]) => (
                    <button key={v} className={hands === v ? 'on' : ''} onClick={() => setHands(v)}>{l}</button>
                  ))}
                </div>
                {hands !== 'both' && <p className="muted" style={{ margin: 0, fontSize: 12 }}>한 손만 듣기는 곧 추가돼요. 지금은 양손 소리로 재생돼요.</p>}
              </div>
            </div>
          </div>

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
