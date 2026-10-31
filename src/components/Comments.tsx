import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, type Comment } from '../lib/supabase'
import { ago, coachLabel } from '../lib/materials'

// 자료마다 질문·댓글. 코치 답변은 강조해서 보여 줌
export default function Comments({ scoreId, uploaderId }: { scoreId: string; uploaderId: string | null }) {
  const { session, isTeacher } = useAuth()
  const [list, setList] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('score_comments').select('*').eq('score_id', scoreId).order('created_at')
    setList((data ?? []) as Comment[])
  }
  useEffect(() => { load() }, [scoreId])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    const { error } = await supabase.from('score_comments').insert({ score_id: scoreId, body: body.trim().slice(0, 1000) })
    setBusy(false)
    if (error) return alert('남기지 못했어요. 잠시 뒤에 다시 해 주세요.')
    setBody(''); load()
  }
  async function del(id: string) {
    if (!confirm('이 글을 지울까요?')) return
    await supabase.from('score_comments').delete().eq('id', id); load()
  }

  return (
    <section className="sec comments">
      <div className="sec-h"><h2>질문·댓글 {list.length > 0 && <span className="muted" style={{ fontSize: 14 }}>{list.length}</span>}</h2></div>
      {list.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>궁금한 점이 있으면 남겨 주세요. 올린 분이나 코치님이 답해 줄 거예요.</p>}
      <ul>
        {list.map(c => (
          <li key={c.id} className={c.is_coach ? 'coach' : ''}>
            <span className="who">
              <b>{c.is_coach ? coachLabel(c.author_name) : c.author_name ?? '학생'}</b>
              {c.user_id === uploaderId && <span className="up">올린 사람</span>}
              <span className="muted">{ago(c.created_at)}</span>
              {(c.user_id === session?.user.id || isTeacher) && <button type="button" className="linkish" onClick={() => del(c.id)}>지우기</button>}
            </span>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="req-form">
        <input value={body} onChange={e => setBody(e.target.value)} maxLength={1000} placeholder="이 자료에 대해 물어보세요" aria-label="질문 남기기" />
        <button className="btn primary" disabled={busy || !body.trim()}>남기기</button>
      </form>
    </section>
  )
}
