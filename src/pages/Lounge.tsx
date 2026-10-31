import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import { supabase, type MaterialRequest, type Score } from '../lib/supabase'
import { ago, coachLabel, kindOf, musicianOf } from '../lib/materials'
import { lazy, Suspense } from 'react'
import { BRAND } from '../lib/brand'
import { useAuth } from '../lib/auth'
const ReviewModal = lazy(() => import('../components/ReviewModal'))

type Report = { id: string; score_id: string; reason: string; resolved: boolean; created_at: string; score: Score | null }
type Tab = 'review' | 'coaches' | 'reports' | 'requests' | 'students' | 'hidden'

// 코치 라운지: 코치끼리 나누는 자료 · 신고 확인 · 자료 요청 · 학생이 올린 자료 살펴보기
export default function Lounge() {
  const [tab, setTab] = useState<Tab>('coaches')
  const [scores, setScores] = useState<Score[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [reqs, setReqs] = useState<MaterialRequest[]>([])
  const [loading, setLoading] = useState(true)
  // 담당 강사 검수: 내 담당 전공의 '검수 중' 악보 (읽기 규칙이 내 전공만 돌려줌)
  const { isAdmin } = useAuth()
  const [rev, setRev] = useState<Score[]>([])
  const [rmaj, setRmaj] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  async function loadReview() {
    const all: Score[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('scores').select('id,title,artist,major,kind,category,file_path,visibility,convert_status,tags,created_at').eq('visibility', 'review').order('title').range(from, from + 999)
      all.push(...((data ?? []) as Score[])); if (!data || data.length < 1000) break
    }
    setRev(all)
  }
  useEffect(() => { loadReview().then(() => {}) }, [])
  const firstRev = useMemo(() => rev.some(s => s.visibility === 'review'), [rev.length])
  useEffect(() => { if (firstRev) setTab(t => t === 'coaches' ? 'review' : t) }, [firstRev])
  const revShown = useMemo(() => rev.filter(s => !rmaj || s.major === rmaj), [rev, rmaj])
  const revMajors = useMemo(() => { const m = new Map<string, number>(); rev.forEach(s => m.set(s.major ?? '공통', (m.get(s.major ?? '공통') ?? 0) + 1)); return [...m] }, [rev])
  async function decide(sc: Score, v: Score['visibility']) {
    const { error } = await supabase.rpc('review_decide', { sid: sc.id, decision: v === 'admin' ? 'reject' : 'publish' })
    if (error) { alert('정하지 못했어요: ' + error.message); return }
    setRev(list => list.map(x => x.id === sc.id ? { ...x, visibility: v === 'admin' ? 'admin' : 'students' } : x))
  }
  async function setKind(sc: Score, ch: Partial<Score>) {
    if (!ch.kind) return
    const { error } = await supabase.rpc('review_decide', { sid: sc.id, decision: 'kind', new_kind: ch.kind })
    if (error) { alert('바꾸지 못했어요: ' + error.message); return }
    setRev(list => list.map(x => x.id === sc.id ? { ...x, kind: ch.kind } : x))
  }

  async function load() {
    const [{ data: s }, { data: r }, { data: q }] = await Promise.all([
      supabase.from('scores').select('*').not('visibility', 'in', '(admin,review)').order('created_at', { ascending: false }).limit(300),
      supabase.from('score_reports').select('*, score:scores(*)').eq('resolved', false).order('created_at', { ascending: false }),
      supabase.from('material_requests').select('*').eq('done', false).order('created_at', { ascending: false }),
    ])
    setScores((s ?? []) as Score[]); setReports((r ?? []) as Report[]); setReqs((q ?? []) as MaterialRequest[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const coachOnly = useMemo(() => scores.filter(s => s.visibility === 'coaches' && !s.hidden), [scores])
  const fromStudents = useMemo(() => scores.filter(s => s.uploader_role === 'student').slice(0, 40), [scores])
  const hidden = useMemo(() => scores.filter(s => s.hidden), [scores])

  async function resolve(id: string) { await supabase.from('score_reports').update({ resolved: true }).eq('id', id); load() }
  async function hide(sid: string, h: boolean) {
    const { error } = await supabase.rpc('set_score_hidden', { sid, h })
    if (error) alert('바꾸지 못했어요: ' + error.message)
    load()
  }
  async function closeReq(id: string) { await supabase.from('material_requests').update({ done: true }).eq('id', id); load() }

  const pending = rev.filter(s => s.visibility === 'review')
  const tabs: [Tab, string, number?][] = [
    ...(rev.length ? [['review', '검수 기다리는 악보', pending.length] as [Tab, string, number]] : []),
    ['coaches', '코치끼리 자료', coachOnly.length], ['reports', '확인 요청', reports.length], ['requests', '자료 요청', reqs.length],
    ['students', '학생이 올린 자료'], ['hidden', '가려 둔 자료', hidden.length],
  ]

  return (
    <Shell>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치님들만 보는 공간</p>
          <h1 className="title">코치 라운지</h1>
        </div>
        <Link to="/upload" className="btn primary">＋ 자료 올리기</Link>
      </div>

      <div className="chips" role="tablist">
        {tabs.map(([t, l, n]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {l}{n ? <span className={'cnt' + (t === 'reports' ? ' warn' : '')}>{n}</span> : null}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">불러오는 중…</div> : (
        <>
          {tab === 'review' && (
            <section className="sec">
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
                {isAdmin ? '관리자는 모든 전공의 검수 악보가 보여요. ' : '내 담당 전공의 악보예요. '}
                하나씩 보고 <b>학생에게 공개</b>하면 그때 소리·악보 그림이 만들어져 자료실에 올라가요. 쓸 수 없는 악보는 <b>필요 없음</b>.
              </p>
              <div className="chips" style={{ marginBottom: 10 }}>
                <button type="button" className={'chip' + (!rmaj ? ' on' : '')} onClick={() => setRmaj('')}>전체 {pending.length}</button>
                {revMajors.map(([m]) => <button key={m} type="button" className={'chip' + (rmaj === m ? ' on' : '')} onClick={() => setRmaj(m === '공통' ? '' : m)}>{m} {pending.filter(s => (s.major ?? '공통') === m).length}</button>)}
              </div>
              <button type="button" className="btn primary" disabled={!revShown.some(s => s.visibility === 'review')}
                onClick={() => setOpen(Math.max(0, revShown.findIndex(s => s.visibility === 'review')))}>👀 차례로 검수하기</button>
              <ul className="rows card" style={{ marginTop: 10, maxHeight: 'none' }}>
                {revShown.slice(0, 300).map((s, k) => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{s.title}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{[musicianOf(s), s.major, BRAND.kindShort[kindOf(s)] ?? kindOf(s)].filter(Boolean).join(' · ')}</div>
                    </div>
                    {s.visibility === 'review' ? <button type="button" className="btn sm ghost" onClick={() => setOpen(k)}>👀 보기</button>
                      : <span className="muted" style={{ fontSize: 12 }}>{s.visibility === 'admin' ? '필요 없음' : '✓ 공개함'}</span>}
                  </li>
                ))}
              </ul>
              {revShown.length > 300 && <p className="muted" style={{ fontSize: 12 }}>처음 300개만 보여요. 차례로 검수하기로 모두 볼 수 있어요.</p>}
              {open !== null && (
                <Suspense fallback={null}>
                  <ReviewModal mode="coach" list={revShown} all={rev} start={open} onClose={() => setOpen(null)} onVis={decide} onField={setKind} />
                </Suspense>
              )}
            </section>
          )}

          {tab === 'coaches' && (
            <section className="sec">
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>올릴 때 <b>코치끼리만</b>을 고른 자료예요. 학생에게는 보이지 않아요. 수업 아이디어, 편곡 초안, 입시 자료를 나눠 보세요.</p>
              {coachOnly.length ? <div className="mat-list">{coachOnly.map(s => <MaterialRow key={s.id} s={s} />)}</div>
                : <p className="muted">아직 코치끼리 나눈 자료가 없어요.</p>}
            </section>
          )}

          {tab === 'reports' && (
            <section className="sec">
              {reports.length ? (
                <ul className="lounge-list">
                  {reports.map(r => (
                    <li key={r.id}>
                      <div className="body">
                        {r.score ? <Link to={`/score/${r.score_id}`}><b>{r.score.title}</b></Link> : <b>지워진 자료</b>}
                        <p>{r.reason}</p>
                        <span className="muted">{ago(r.created_at)}{r.score?.hidden ? ' · 지금 가려 둠' : ''}</span>
                      </div>
                      <div className="acts">
                        {r.score && <button type="button" className="btn sm" onClick={() => hide(r.score_id, !r.score!.hidden)}>{r.score.hidden ? '다시 보이기' : '잠시 가리기'}</button>}
                        <button type="button" className="btn sm dark" onClick={() => resolve(r.id)}>확인 끝</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">들어온 확인 요청이 없어요.</p>}
            </section>
          )}

          {tab === 'requests' && (
            <section className="sec">
              {reqs.length ? (
                <ul className="lounge-list">
                  {reqs.map(r => (
                    <li key={r.id}>
                      <div className="body">
                        <p style={{ marginTop: 0 }}>{r.body}</p>
                        <span className="muted">{r.is_coach ? coachLabel(r.author_name) : r.author_name ?? '학생'} · {ago(r.created_at)}</span>
                      </div>
                      <div className="acts">
                        <Link to={`/upload?req=${r.id}`} className="btn sm primary">자료 올려 주기</Link>
                        <button type="button" className="btn sm" onClick={() => closeReq(r.id)}>닫기</button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">남아 있는 요청이 없어요.</p>}
            </section>
          )}

          {tab === 'students' && (
            <section className="sec">
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>학생 자료는 올리자마자 공개돼요. 틀린 곳이 있으면 댓글로 알려 주고, 문제가 있으면 자료 화면에서 <b>잠시 가리기</b>를 누르세요.</p>
              {fromStudents.length ? <div className="mat-list">{fromStudents.map(s => <MaterialRow key={s.id} s={s} />)}</div>
                : <p className="muted">아직 학생이 올린 자료가 없어요.</p>}
            </section>
          )}

          {tab === 'hidden' && (
            <section className="sec">
              {hidden.length ? (
                <ul className="lounge-list">
                  {hidden.map(s => (
                    <li key={s.id}>
                      <div className="body"><Link to={`/score/${s.id}`}><b>{s.title}</b></Link><span className="muted"> · 학생에게 안 보여요</span></div>
                      <div className="acts"><button type="button" className="btn sm" onClick={() => hide(s.id, false)}>다시 보이기</button></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">가려 둔 자료가 없어요.</p>}
            </section>
          )}
        </>
      )}
    </Shell>
  )
}
