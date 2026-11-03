import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow, { KindBadge } from '../components/MaterialRow'
import InstallHint from '../components/InstallHint'
import PracticeCard from '../components/PracticeCard'
import IntroCard from '../components/IntroVideo'
import Tour from '../components/Tour'
import StartMissions from '../components/StartMissions'
import { useCover } from '../components/Cover'
import { CoachMajorsCard } from '../components/CoachMajors'
import Avatar from '../components/Avatar'
import AvatarEdit from '../components/AvatarEdit'
import { defaultLook, instOfMajor, lookOf } from '../lib/avatar'
import { lastView } from '../lib/view'
import { useAuth } from '../lib/auth'
import { supabase, type MaterialRequest, type Score } from '../lib/supabase'
import { ago, listable, myBookmarks, coachLabel, musicianOf, isAudioFile } from '../lib/materials'
import { ask, say } from '../lib/dialog'

// 홈: 새로 올라온 자료 · 내 보관함 · 자료 요청
export default function Home() {
  const { student, isTeacher, isAdmin, session } = useAuth()
  const [pinEdit, setPinEdit] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const loc = useLocation()
  const [scores, setScores] = useState<Score[]>([])
  const [pinned, setPinned] = useState<Score[]>([])
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
      supabase.from('scores').select('*').not('pinned_at', 'is', null).not('visibility', 'in', '(admin,review)').order('pinned_at', { ascending: false }).limit(12),
    ]).then(([{ data }, b, , pin]) => { setScores((data ?? []) as Score[]); setSaved(b); setPinned((pin?.data ?? []) as Score[]); setLoading(false) })
  }, [])
  useEffect(() => {
    if (!loading && loc.hash === '#requests') document.getElementById('requests')?.scrollIntoView({ behavior: 'smooth' })
  }, [loading, loc.hash])

  const visible = useMemo(() => scores.filter(s => listable(s, isTeacher) && s.visibility !== 'coaches'), [scores, isTeacher])
  const fresh = visible.slice(0, 15)
  // 새로 올라온 자료: 5개씩 한 묶음 → 휴대폰은 옆으로 넘기고, PC는 나란히
  const freshPages = Array.from({ length: Math.ceil(fresh.length / 5) }, (_, i) => fresh.slice(i * 5, i * 5 + 5))
  const must = useMemo(() => pinned.filter(s => listable(s, isTeacher) && s.visibility !== 'coaches'), [pinned, isTeacher])
  const mine = visible.filter(s => saved.has(s.id)).slice(0, 4)
  const openReqs = reqs.filter(r => !r.done).slice(0, 8)
  const doneReqs = reqs.filter(r => r.done).slice(0, 3)

  // 📌 필수 자료 순서: 고정 시각(pinned_at)이 늦을수록 위. 위·아래 자료와 시각을 맞바꿔 순서를 옮김
  async function movePin(i: number, d: -1 | 1) {
    const j = i + d
    const a = must[i], b = must[j]
    if (!a || !b || pinBusy) return
    setPinBusy(true)
    const [r1, r2] = await Promise.all([
      supabase.from('scores').update({ pinned_at: b.pinned_at }).eq('id', a.id),
      supabase.from('scores').update({ pinned_at: a.pinned_at }).eq('id', b.id),
    ])
    setPinBusy(false)
    if (r1.error || r2.error) return say('순서를 바꾸지 못했어요. 새로고침 후 다시 해 주세요.')
    setPinned(p => p.map(x => x.id === a.id ? { ...x, pinned_at: b.pinned_at } : x.id === b.id ? { ...x, pinned_at: a.pinned_at } : x)
      .sort((x, y) => (y.pinned_at ?? '').localeCompare(x.pinned_at ?? '')))
  }

  async function sendReq(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    const { error } = await supabase.from('material_requests').insert({ body: body.trim() })
    setSending(false)
    if (error) return say('남기지 못했어요. 잠시 뒤에 다시 해 주세요.')
    setBody(''); loadReqs()
  }
  async function delReq(id: string) {
    if (!await ask('이 요청을 지울까요?')) return
    await supabase.from('material_requests').delete().eq('id', id); loadReqs()
  }

  // 코치: 악보 창고(담당 코치 검수) 곡 수 — 읽기 규칙이 내 담당 전공만 세어 줌
  const [storeN, setStoreN] = useState(0)
  useEffect(() => { if (isTeacher) supabase.from('scores').select('id', { count: 'exact', head: true }).eq('visibility', 'review').then(({ count }) => setStoreN(count ?? 0)) }, [isTeacher])
  const [avatarEdit, setAvatarEdit] = useState(false)
  const myLook = lookOf(session?.user.user_metadata)
  const [tName, setTName] = useState('')
  useEffect(() => { if (isTeacher && session) supabase.from('teachers').select('name').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setTName(data?.name ?? '')) }, [isTeacher, session])
  const asCoach = isTeacher && (!student || lastView() !== 'student')
  const hello = asCoach ? `모두의음악 ${coachLabel(tName)}님` : `모두의음악 뮤지션${student?.name ? ` ${student.name}님` : ''}`

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
      {(!isTeacher || lastView() === 'student') ? <IntroCard /> : <IntroCard who="coach" />}
      {session && <StartMissions uid={session.user.id} coach={asCoach} />}

      {isTeacher && lastView() !== 'student' && <CoachMajorsCard />}
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

      <nav className="qk-grid" aria-label="바로 가기">
        <Link to="/board" className="qk qk-main qk-dark"><i aria-hidden="true">📚</i><span className="qk-t"><b>자료실</b><small>곡·카피 악보·테크닉 연습·반주·시범 영상</small></span><em aria-hidden="true">→</em></Link>
        <Link to="/player" className="qk qk-main qk-or"><i aria-hidden="true">🎧</i><span className="qk-t"><b>연습 플레이어</b><small>{asCoach ? '레슨 중 느리게·구간 반복, 학생에게 보내기' : '유튜브·내 음원 느리게, 구간 반복'}</small></span><em aria-hidden="true">→</em></Link>
        <Link to="/playlist" className="qk"><i aria-hidden="true">🎵</i><span className="qk-t"><b>플레이리스트</b><small>전공별로 꼭 들어 볼 음악</small></span><em aria-hidden="true">›</em></Link>
        <Link to="/apps" className="qk"><i aria-hidden="true">📱</i><span className="qk-t"><b>추천 앱</b><small>연습할 때 쓰면 좋은 앱</small></span><em aria-hidden="true">›</em></Link>
      </nav>

      {must.length > 0 && (
        <section className="sec must-sec">
          <div className="sec-h"><h2>📌 필수 자료</h2>
            {isAdmin && must.length > 1
              ? <button type="button" className={'btn sm' + (pinEdit ? ' dark' : ' ghost')} onClick={() => setPinEdit(v => !v)} title="관리자 계정에만 보여요">{pinEdit ? '순서 정하기 끝' : '↕ 순서 정하기 (관리자)'}</button>
              : <span className="muted" style={{ fontSize: 12 }}>학원이 꼭 보라고 고정한 자료</span>}
          </div>
          {pinEdit && <p className="muted" style={{ margin: '0 0 4px', fontSize: 12 }}>관리자만 보이는 화면이에요. ▲▼로 옮기면 홈과 자료실 맨 위 순서가 바로 바뀌어요. 새로 고정한 자료는 맨 위에 들어가요.</p>}
          <div className="mat-list" hidden={!pinEdit}>{must.map((s, i) => pinEdit ? (
            <div key={s.id} className="pin-ord-row">
              <MaterialRow s={s} />
              <span className="pin-ord">
                <button type="button" aria-label={`${s.title} 위로`} disabled={i === 0 || pinBusy} onClick={() => movePin(i, -1)}>▲</button>
                <button type="button" aria-label={`${s.title} 아래로`} disabled={i === must.length - 1 || pinBusy} onClick={() => movePin(i, 1)}>▼</button>
              </span>
            </div>
          ) : null)}</div>
          {!pinEdit && (
            <div className="must-grid">
              {must.map(s => <MustCard key={s.id} s={s} canSave={isAdmin || s.created_by === session?.user.id} />)}
            </div>
          )}
        </section>
      )}

      <section className="sec">
        <div className="sec-h"><h2>새로 올라온 자료</h2><Link to="/board">전체 보기 ›</Link></div>
        {loading ? <div className="loading">불러오는 중…</div> : fresh.length ? (
          <>
            <div className="fresh-pages">{freshPages.map((p, i) => <div key={i} className="fresh-page">{p.map(s => <MaterialRow key={s.id} s={s} />)}</div>)}</div>
            {freshPages.length > 1 && <p className="fresh-hint">옆으로 넘기면 {fresh.length - 5}개 더 있어요 →</p>}
          </>
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

// 필수 자료 카드: 교재 표지(PDF 첫 쪽)를 책처럼. 표지가 없으면 제목을 적은 기본 표지
function MustCard({ s, canSave }: { s: Score; canSave: boolean }) {
  const cover = useCover(s, canSave)
  const icon = s.kind === '교재' || s.category === '교재' ? '📘' : isAudioFile(s.file_path) ? '🎧' : !s.file_path && s.youtube_url ? '▶️' : '🎼'
  return (
    <Link to={`/score/${s.id}`} className="must-card">
      <span className={'must-cover' + (cover === undefined ? ' wait' : '')}>
        {cover
          ? <img src={cover} alt="" decoding="async" />
          : <span className="must-ph" aria-hidden="true"><i>{icon}</i><em>{s.title}</em></span>}
        <span className="must-kb"><KindBadge s={s} /></span>
      </span>
      <b>{s.title}</b>
      <small>{[s.major ?? '전체 전공', musicianOf(s)].filter(Boolean).join(' · ')}</small>
    </Link>
  )
}
