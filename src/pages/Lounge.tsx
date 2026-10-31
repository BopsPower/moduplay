import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import { supabase, type MaterialRequest, type Score } from '../lib/supabase'
import { ago, coachLabel, genreOf, kindOf, musicianOf, pickedBy } from '../lib/materials'
import { matches } from '../lib/search'
import { lazy, Suspense } from 'react'
import { BRAND } from '../lib/brand'
import { useAuth } from '../lib/auth'
const ReviewModal = lazy(() => import('../components/ReviewModal'))

type Report = { id: string; score_id: string; reason: string; resolved: boolean; created_at: string; score: Score | null }
type Tab = 'review' | 'coaches' | 'reports' | 'requests' | 'students' | 'hidden'

// 코치 라운지: 코치끼리 나누는 자료 · 신고 확인 · 자료 요청 · 학생이 올린 자료 살펴보기
export default function Lounge() {
  const [tab, setTab] = useState<Tab>(() => new URLSearchParams(location.search).get('tab') === 'review' ? 'review' : 'coaches')
  const [scores, setScores] = useState<Score[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [reqs, setReqs] = useState<MaterialRequest[]>([])
  const [loading, setLoading] = useState(true)
  // 담당 강사 검수: 내 담당 전공의 '검수 중' 악보 (읽기 규칙이 내 전공만 돌려줌)
  const { isAdmin, session } = useAuth()
  const [myName, setMyName] = useState<string | undefined>()
  useEffect(() => { if (session) supabase.from('teachers').select('name').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setMyName(data?.name ?? undefined)) }, [session])
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
  const [picks] = useState(() => new Set<string>()) // 이 화면에서 꺼낸 것 (목록에 남겨 보여 주기)
  const [rq, setRq] = useState('')
  const [rgen, setRgen] = useState('')
  const [rlimit, setRlimit] = useState(100)
  const inStore = useMemo(() => rev.filter(s => s.visibility === 'review'), [rev])
  // 추천순: 학생들이 좋아할 장르 먼저, 그다음 뮤지션이 있는 곡, 테크닉 연습은 뒤로
  const RANK = ['케이팝', '팝', 'OST', '애니메이션', '게임 음악', '발라드', '록', 'R&B', '힙합', '재즈']
  const score = (s: Score) => { const g = genreOf(s); const r = g ? RANK.indexOf(g) : -1; return (r >= 0 ? r : 20) + (musicianOf(s) ? 0 : 5) + (kindOf(s) === '연습 악보' ? 40 : 0) }
  const revShown = useMemo(() => rev
    .filter(s => s.visibility === 'review' || picks.has(s.id))
    .filter(s => !rmaj || (s.major ?? '공통') === rmaj)
    .filter(s => !rgen || genreOf(s) === rgen)
    .filter(s => matches(rq, s.title, musicianOf(s) ?? '', genreOf(s) ?? ''))
    .sort((a, b) => rgen ? a.title.localeCompare(b.title) : score(a) - score(b)), [rev, rmaj, rgen, rq])
  const revMajors = useMemo(() => { const m = new Map<string, number>(); inStore.forEach(s => m.set(s.major ?? '공통', (m.get(s.major ?? '공통') ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]) }, [inStore])
  const revGenres = useMemo(() => { const m = new Map<string, number>(); inStore.filter(s => !rmaj || (s.major ?? '공통') === rmaj).forEach(s => { const g = genreOf(s); if (g) m.set(g, (m.get(g) ?? 0) + 1) }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 12) }, [inStore, rmaj])
  const [picked, setPicked] = useState({ all: 0, mine: 0 })
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('scores').select('tags').in('visibility', ['students', 'public', 'coaches', 'mine'])
      const names = (data ?? []).map(r => pickedBy(r as any)).filter(Boolean) as string[]
      const all = names.length, me = myName ? names.filter(n => n === myName).length : 0
      setPicked({ all: all ?? 0, mine: me ?? 0 })
    })()
  }, [myName, rev])
  async function decide(sc: Score, v: Score['visibility']) {
    const { error } = await supabase.rpc('review_decide', { sid: sc.id, decision: v === 'admin' ? 'reject' : 'publish' })
    if (error) { alert('정하지 못했어요: ' + error.message); return }
    picks.add(sc.id)
    setRev(list => list.map(x => x.id === sc.id ? { ...x, visibility: v === 'admin' ? 'admin' : 'students' } : x))
  }
  async function setKind(sc: Score, ch: Partial<Score>) {
    if (isAdmin && !ch.kind) { // 관리자: 이름·뮤지션·전공 바로 고치기
      const { error } = await supabase.from('scores').update(ch).eq('id', sc.id)
      if (error) { alert('바꾸지 못했어요: ' + error.message); return }
      setRev(list => list.map(x => x.id === sc.id ? { ...x, ...ch } : x)); return
    }
    if (!ch.kind && ch.title) { // 코치: 담당 전공 창고 곡 이름·뮤지션
      const { error } = await supabase.rpc('coach_rename_score', { sid: sc.id, new_title: ch.title, new_artist: ch.artist ?? null })
      if (error) { alert('바꾸지 못했어요: ' + error.message); return }
      setRev(list => list.map(x => x.id === sc.id ? { ...x, title: ch.title!, artist: ch.artist ?? null } : x)); return
    }
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
    setScores((s ?? []) as Score[]); setReports(((r ?? []) as (Report & { by_coach?: boolean })[]).filter(x => !x.by_coach)) // 코치가 보낸 요청은 관리자 화면에서 처리; setReqs((q ?? []) as MaterialRequest[]); setLoading(false)
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
    ...(rev.length ? [['review', '🎁 악보 창고', pending.length] as [Tab, string, number]] : []),
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
              <div className="card" style={{ padding: '14px 16px', marginBottom: 12, background: 'var(--orS, #fff1e6)' }}>
                <b style={{ fontSize: 16 }}>🎁 우리 학원 악보 창고</b>
                <p style={{ margin: '4px 0 0', fontSize: 14 }}>
                  학원이 모아 둔 악보 <b>{pending.length.toLocaleString()}곡</b>이 잠들어 있어요. 마음에 드는 곡을 찾으면 <b>우리 학생들에게 꺼내 주기</b>만 누르세요 — 자료실에 바로 올라가고, 소리·악보 그림은 몇 분 뒤 만들어져요.
                </p>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  코치님들이 꺼낸 악보 <b>{picked.all}</b>곡{picked.mine ? <> · 내가 꺼낸 악보 <b>{picked.mine}</b>곡</> : null}
                </p>
              </div>
              <input type="search" value={rq} onChange={e => setRq(e.target.value)} placeholder="곡 이름·뮤지션으로 찾기 (예: 아이유, Metallica)" aria-label="악보 창고 검색"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', marginBottom: 8 }} />
              <div className="chips" style={{ marginBottom: 6 }}>
                <button type="button" className={'chip' + (!rmaj ? ' on' : '')} onClick={() => setRmaj('')}>전공 전체</button>
                {revMajors.map(([m, c]) => <button key={m} type="button" className={'chip' + (rmaj === m ? ' on' : '')} onClick={() => setRmaj(m)}>{m} {c}</button>)}
              </div>
              <div className="chips sm" style={{ marginBottom: 10 }}>
                <button type="button" className={'chip' + (!rgen ? ' on' : '')} onClick={() => setRgen('')}>✨ 추천순</button>
                {revGenres.map(([g, c]) => <button key={g} type="button" className={'chip' + (rgen === g ? ' on' : '')} onClick={() => setRgen(g)}>{g} {c}</button>)}
              </div>
              {revShown.length ? (
                <ul className="rows card" style={{ maxHeight: 'none' }}>
                  {revShown.slice(0, rlimit).map((s, k) => (
                    <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer' }} onClick={() => setOpen(k)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{s.title}</b>
                        <div className="muted" style={{ fontSize: 12 }}>{[musicianOf(s), s.major, genreOf(s), BRAND.kindShort[kindOf(s)] ?? kindOf(s)].filter(Boolean).join(' · ')}</div>
                      </div>
                      {s.visibility === 'review' ? <span className="btn sm ghost">👀 보기</span>
                        : <span className="muted" style={{ fontSize: 12 }}>{s.visibility === 'admin' ? '창고 정리됨' : '🎁 꺼내 줌'}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">찾는 악보가 창고에 없어요. 다른 이름으로 찾아보세요.</p>}
              {revShown.length > rlimit && <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setRlimit(l => l + 100)}>더 보기 ({(revShown.length - rlimit).toLocaleString()}곡 남음)</button>}
              {open !== null && (
                <Suspense fallback={null}>
                  <ReviewModal mode={isAdmin ? 'admin' : 'coach'} list={revShown} all={rev} start={open} onClose={() => setOpen(null)} onVis={decide} onField={setKind} />
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
