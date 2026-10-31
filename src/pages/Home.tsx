import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import InstallHint from '../components/InstallHint'
import { useAuth } from '../lib/auth'
import { supabase, type MaterialRequest, type Score } from '../lib/supabase'
import { ago, listable, myBookmarks } from '../lib/materials'

// 홈: 새로 올라온 자료 · 내 보관함 · 자료 요청
export default function Home() {
  const { student, isTeacher, session } = useAuth()
  const loc = useLocation()
  const [scores, setScores] = useState<Score[]>([])
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [reqs, setReqs] = useState<MaterialRequest[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadReqs() {
    const { data } = await supabase.from('material_requests').select('*').order('created_at', { ascending: false }).limit(30)
    setReqs((data ?? []) as MaterialRequest[])
  }
  useEffect(() => {
    Promise.all([
      supabase.from('scores').select('*').order('created_at', { ascending: false }).limit(60),
      myBookmarks(),
      loadReqs(),
    ]).then(([{ data }, b]) => { setScores((data ?? []) as Score[]); setSaved(b); setLoading(false) })
  }, [])
  useEffect(() => {
    if (!loading && loc.hash === '#requests') document.getElementById('requests')?.scrollIntoView({ behavior: 'smooth' })
  }, [loading, loc.hash])

  const visible = useMemo(() => scores.filter(s => listable(s, isTeacher) && s.visibility !== 'coaches'), [scores, isTeacher])
  const fresh = visible.slice(0, 8)
  const mine = visible.filter(s => saved.has(s.id)).slice(0, 4)
  const openReqs = reqs.filter(r => !r.done).slice(0, 8)
  const doneReqs = reqs.filter(r => r.done).slice(0, 3)

  async function sendReq(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    const { error } = await supabase.from('material_requests').insert({ body: body.trim() })
    setSending(false)
    if (error) return alert('남기지 못했어요. 잠시 뒤에 다시 해 주세요.')
    setBody(''); loadReqs()
  }
  async function delReq(id: string) {
    if (!confirm('이 요청을 지울까요?')) return
    await supabase.from('material_requests').delete().eq('id', id); loadReqs()
  }

  const hello = student ? `${student.name} 학생` : isTeacher ? '코치님' : ''

  return (
    <Shell>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{hello}, 반가워요</p>
          <h1 className="title">오늘은 어떤 자료로 연습할까요?</h1>
        </div>
        <Link to="/upload" className="btn primary">＋ 자료 올리기</Link>
      </div>

      <InstallHint />

      <div className="quick">
        <Link to="/board" className="card"><b>자료실</b><span>카피·릭·리듬·초견 악보와 영상</span></Link>
        <Link to="/playlist" className="card"><b>플레이리스트</b><span>전공별로 꼭 들어 볼 음악</span></Link>
        <Link to="/player" className="card"><b>연습 플레이어</b><span>내 음원 키·템포 바꾸기, 구간 반복</span></Link>
        <Link to="/apps" className="card"><b>추천 앱</b><span>연습할 때 쓰면 좋은 앱</span></Link>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>새로 올라온 자료</h2><Link to="/board">전체 보기 ›</Link></div>
        {loading ? <div className="loading">불러오는 중…</div> : fresh.length ? (
          <div className="mat-list">{fresh.map(s => <MaterialRow key={s.id} s={s} />)}</div>
        ) : <p className="muted" style={{ margin: 0 }}>아직 올라온 자료가 없어요. 첫 자료를 올려 보세요.</p>}
      </section>

      {mine.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>내 보관함</h2><Link to="/saved">전체 보기 ›</Link></div>
          <div className="mat-list">{mine.map(s => <MaterialRow key={s.id} s={s} />)}</div>
        </section>
      )}

      <section className="sec" id="requests">
        <div className="sec-h"><h2>자료 요청</h2></div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>"이런 자료 있으면 좋겠어요"를 남겨 주세요. 코치님이나 친구가 자료를 올려 줄 수 있어요.</p>
        <form onSubmit={sendReq} className="req-form">
          <input value={body} onChange={e => setBody(e.target.value)} maxLength={300} placeholder="예: 셔플 리듬 초견 연습 악보 / Isn't She Lovely 베이스 카피" aria-label="요청 내용" />
          <button className="btn dark" disabled={sending || !body.trim()}>{sending ? '남기는 중…' : '남기기'}</button>
        </form>
        <ul className="req-list">
          {openReqs.map(r => (
            <li key={r.id}>
              <span className="body">{r.body}</span>
              <span className="meta">
                <b className={r.is_coach ? 'by-co' : ''}>{r.is_coach ? `${r.author_name ?? ''} 코치` : r.author_name ?? '학생'}</b> · {ago(r.created_at)}
                {(r.user_id === session?.user.id || isTeacher) && <button type="button" className="linkish" onClick={() => delReq(r.id)}>지우기</button>}
              </span>
            </li>
          ))}
          {doneReqs.map(r => (
            <li key={r.id} className="done">
              <span className="body">✓ {r.body}</span>
              <span className="meta">
                {r.done_score_id ? <Link to={`/score/${r.done_score_id}`} style={{ color: 'var(--accent-deep)' }}>올라온 자료 보기 ›</Link> : '자료가 올라왔어요'}
              </span>
            </li>
          ))}
          {!openReqs.length && !doneReqs.length && <li className="muted">아직 요청이 없어요.</li>}
        </ul>
      </section>
    </Shell>
  )
}
