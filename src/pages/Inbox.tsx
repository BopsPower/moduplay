import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { KindBadge } from '../components/MaterialRow'
import { useAuth } from '../lib/auth'
import { supabase, type Score } from '../lib/supabase'
import { ago, coachLabel } from '../lib/materials'

// 📥 학생이 보낸 자료 (코치): 학생이 '코치님께 보내기'로 나를 골라 보낸 자료. 열면 '봤어요'로 바뀜, 의견은 자료 화면 댓글로
// 관리자는 모든 코치님이 받은 것을 봄 (받은 코치님 이름 같이)

export type InboxRow = {
  score_id: string; teacher_id: string; created_at: string; seen_at: string | null
  scores: Pick<Score, 'id' | 'title' | 'kind' | 'category' | 'major' | 'file_path' | 'youtube_url' | 'description' | 'tags' | 'uploader_name'> | null
  teachers?: { name: string | null } | null
}
export const senderOf = (s: { tags?: string[] | null; uploader_name?: string | null } | null) =>
  (s?.tags ?? []).find(t => t.startsWith('auto:보낸이:'))?.slice(9) || s?.uploader_name || '학생'

export async function loadInbox(teacherId: string | null, limit = 200) {
  let q = supabase.from('score_sends')
    .select('score_id,teacher_id,created_at,seen_at,scores(id,title,kind,category,major,file_path,youtube_url,description,tags,uploader_name),teachers(name)')
    .order('created_at', { ascending: false }).limit(limit)
  if (teacherId) q = q.eq('teacher_id', teacherId)
  const { data } = await q
  return ((data ?? []) as unknown as InboxRow[]).filter(r => r.scores)
}

export default function Inbox() {
  const { session, isAdmin } = useAuth()
  const [rows, setRows] = useState<InboxRow[] | null>(null)
  const [onlyNew, setOnlyNew] = useState(false)
  const [all, setAll] = useState(false) // 관리자: 모든 코치님이 받은 것
  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data: t } = await supabase.from('teachers').select('id').eq('user_id', session.user.id).maybeSingle()
      setRows(await loadInbox(isAdmin && all ? null : (t?.id ?? '00000000-0000-0000-0000-000000000000')))
    })()
  }, [session, isAdmin, all])
  const shown = useMemo(() => (rows ?? []).filter(r => !onlyNew || !r.seen_at), [rows, onlyNew])
  const newN = (rows ?? []).filter(r => !r.seen_at).length

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>학생이 코치님을 골라 보낸 카피·공부 자료·연습 녹음이에요. 보낸 학생과 코치님만 볼 수 있어요.</p>
        <h1 className="title">📥 학생이 보낸 자료</h1>
      </div>
      <div className="chips">
        <button type="button" className={'chip' + (!onlyNew ? ' on' : '')} onClick={() => setOnlyNew(false)}>전체 {rows?.length ?? ''}</button>
        <button type="button" className={'chip' + (onlyNew ? ' on' : '')} onClick={() => setOnlyNew(true)}>아직 안 본 것 {newN}</button>
        {isAdmin && <button type="button" className={'chip sm' + (all ? ' pick' : '')} onClick={() => setAll(a => !a)} title="관리자에게만 보여요">{all ? '✓ ' : ''}모든 코치님 받은 것 (관리자)</button>}
      </div>
      {rows === null ? <div className="loading">불러오는 중…</div> : shown.length ? (
        <ul className="inbox-list">{shown.map(r => <InboxItem key={r.score_id + r.teacher_id} r={r} showTo={isAdmin && all} />)}</ul>
      ) : (
        <section className="card" style={{ padding: 18 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{onlyNew ? '새로 받은 자료가 없어요.' : '아직 받은 자료가 없어요.'}</p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>학생들은 홈 맨 위 '📤 코치님께 보내기'에서 코치님을 골라 자료를 보내요. 레슨 때 "딴 카피는 여기로 보내 줘"라고 알려 주세요.</p>
        </section>
      )}
    </Shell>
  )
}

export function InboxItem({ r, showTo }: { r: InboxRow; showTo?: boolean }) {
  const s = r.scores!
  return (
    <li className={'inbox-item' + (r.seen_at ? '' : ' new')}>
      <Link to={`/score/${s.id}`}>
        <span className="ii-top">
          {!r.seen_at && <span className="ii-new">새로 옴</span>}
          <b className="ii-who">{senderOf(s)}{s.major ? <small> · {s.major}</small> : null}</b>
          <span className="muted ii-when">{ago(r.created_at)}</span>
        </span>
        <span className="ii-t"><KindBadge s={s as Score} /> {s.title}</span>
        {s.description && <span className="ii-msg">“{s.description}”</span>}
        {showTo && <span className="muted" style={{ fontSize: 12 }}>받은 코치님: {coachLabel(r.teachers?.name)}{r.seen_at ? ' · 봤어요' : ''}</span>}
      </Link>
    </li>
  )
}
