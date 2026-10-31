import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import InstallHint from '../components/InstallHint'
import PracticeCard from '../components/PracticeCard'
import IntroCard from '../components/IntroVideo'
import Tour from '../components/Tour'
import Avatar from '../components/Avatar'
import AvatarEdit from '../components/AvatarEdit'
import { defaultLook, instOfMajor, lookOf } from '../lib/avatar'
import { lastView } from '../lib/view'
import { useAuth } from '../lib/auth'
import { supabase, type MaterialRequest, type Score } from '../lib/supabase'
import { ago, listable, myBookmarks, coachLabel } from '../lib/materials'

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
      supabase.from('scores').select('*').not('visibility', 'in', '(admin,review)').order('created_at', { ascending: false }).limit(60),
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

  // 코치: 악보 창고(담당 강사 검수) 곡 수 — 읽기 규칙이 내 담당 전공만 세어 줌
  const [storeN, setStoreN] = useState(0)
  useEffect(() => { if (isTeacher) supabase.from('scores').select('id', { count: 'exact', head: true }).eq('visibility', 'review').then(({ count }) => setStoreN(count ?? 0)) }, [isTeacher])
  const [avatarEdit, setAvatarEdit] = useState(false)
  const myLook = lookOf(session?.user.user_metadata)
  const hello = isTeacher && (!student || lastView() !== 'student') ? '모두의음악 코치님' : '모두의음악 뮤지션'

  return (
    <Shell>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{hello}, 반가워요</p>
          <h1 className="title">오늘도 신나게 연습해 볼까요?</h1>
        </div>
        <Link to="/upload" className="btn primary">＋ 자료 올리기</Link>
      </div>

      <Tour />
      {!myLook && (
        <button type="button" className="card" onClick={() => setAvatarEdit(true)}
          style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, background: '#f4f1ea', border: '2px solid #1d1a17', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}>
          <Avatar look={defaultLook(instOfMajor((student as { major?: string | null } | null)?.major ?? student?.class_name), 'f')} size={56} head />
          <span style={{ flex: 1 }}>
            <b style={{ fontSize: 16 }}>내 뮤지션 캐릭터를 만들어 보세요</b>
            <span className="muted" style={{ display: 'block', fontSize: 13 }}>악기·옷·머리를 고르면 오른쪽 위 동그라미가 내 캐릭터로 바뀌어요. 연습하면 꾸밈 아이템이 열려요 →</span>
          </span>
        </button>
      )}
      {avatarEdit && <AvatarEdit onClose={() => setAvatarEdit(false)} />}
      {(!isTeacher || lastView() === 'student') && <IntroCard />}

      {isTeacher && lastView() !== 'student' && storeN > 0 && (
        <Link to="/lounge?tab=review" className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--orS, #fff1e6)', textDecoration: 'none', color: 'inherit' }}>
          <span style={{ fontSize: 34 }} aria-hidden="true">🎁</span>
          <span style={{ flex: 1 }}>
            <b style={{ fontSize: 16 }}>우리 학원 악보 창고에 {storeN.toLocaleString()}곡이 있어요</b>
            <span className="muted" style={{ display: 'block', fontSize: 13 }}>둘러보다 마음에 드는 곡을 학생들에게 꺼내 주세요 →</span>
          </span>
        </Link>
      )}

      <PracticeCard />

      <InstallHint />

      <div className="quick">
        <Link to="/board" className="card"><b>자료실</b><span>곡·연주 카피·테크닉 연습·반주·시범 영상</span></Link>
        <Link to="/player" className="card"><b>연습 플레이어</b><span>유튜브·내 음원 느리게, 구간 반복</span></Link>
        <Link to="/playlist" className="card"><b>플레이리스트</b><span>전공별로 꼭 들어 볼 음악</span></Link>
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
                <b className={r.is_coach ? 'by-co' : ''}>{r.is_coach ? coachLabel(r.author_name) : r.author_name ?? '학생'}</b> · {ago(r.created_at)}
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
