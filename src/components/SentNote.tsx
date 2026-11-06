import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Score } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { coachLabel } from '../lib/materials'
import { senderOf } from '../pages/Inbox'

// 📤 '코치님께 보내기'로 온 자료 화면 맨 위 안내
// - 보낸 학생: 받은 코치님과 '봤어요' 여부
// - 받은 코치님: 누가 보냈는지 + 열면 '봤어요'로 바꿈 + 의견은 댓글로
export default function SentNote({ score }: { score: Score }) {
  const { session, isTeacher } = useAuth()
  const mine = !!session && score.created_by === session.user.id
  const [to, setTo] = useState<{ name: string; seen: boolean }[] | null>(null)
  useEffect(() => {
    if (mine) {
      Promise.all([
        supabase.from('score_sends').select('teacher_id,seen_at').eq('score_id', score.id),
        supabase.rpc('send_coaches'),
      ]).then(([{ data: s }, { data: c }]) => {
        const names = new Map(((c ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name]))
        setTo(((s ?? []) as { teacher_id: string; seen_at: string | null }[]).map(x => ({ name: coachLabel(names.get(x.teacher_id)), seen: !!x.seen_at })))
      })
    } else if (isTeacher) {
      // 내가 받은 것이면 '봤어요' (읽기 규칙이 내 줄만 바꾸게 함)
      supabase.from('score_sends').update({ seen_at: new Date().toISOString() }).eq('score_id', score.id).is('seen_at', null).then(() => {})
    }
  }, [score.id, mine, isTeacher])

  if (mine) return (
    <div className="sent-note">
      <b>📤 코치님께 보낸 자료예요</b>
      <span>{to === null ? '…' : to.length ? to.map(t => `${t.name} ${t.seen ? '👀 봤어요' : '(아직 안 봄)'}`).join(' · ') : '받는 코치님이 없어요'}</span>
      <span className="muted">나와 받은 코치님만 볼 수 있어요. 코치님 의견은 아래 '질문·댓글'에 달려요. <Link to="/send">내가 보낸 자료 ›</Link></span>
    </div>
  )
  return (
    <div className="sent-note">
      <b>📤 {senderOf(score)} 학생{score.major ? `(${score.major})` : ''}이 코치님께 보낸 자료예요</b>
      <span className="muted">보낸 학생과 받은 코치님만 볼 수 있어요. 아래 '질문·댓글'에 의견을 남기면 학생이 봐요.</span>
      <button type="button" className="btn sm primary" style={{ alignSelf: 'flex-start' }} onClick={() => document.querySelector('.comments')?.scrollIntoView({ behavior: 'smooth' })}>💬 의견 남기러 가기</button>
    </div>
  )
}
