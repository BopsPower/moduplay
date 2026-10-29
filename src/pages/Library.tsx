import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { supabase, type Assignment, type Score } from '../lib/supabase'
import { Staff } from './Board'

type Row = Assignment & { score: Score }

export default function Library() {
  const { student } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('assignments').select('*, score:scores(*)').eq('student_id', student!.id).order('created_at', { ascending: false })
      .then(({ data }) => { setRows((data ?? []) as Row[]); setLoading(false) })
  }, [student])

  const current = rows.filter(r => r.is_current)
  const done = rows.filter(r => !r.is_current)
  const main = current[0]

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{student?.name} 학생{student?.class_name ? ` · ${student.class_name}` : ''}</p>
        <h1 className="title">오늘도 한 곡 연주해 볼까요?</h1>
      </div>

      {main ? (
        <section className="card hero">
          <div className="big">♪</div>
          <div className="body">
            <p className="k">선생님이 지정한 이번 주 과제</p>
            <p className="t">{main.score.title}</p>
            {main.note && <p className="s">{main.note}</p>}
            {(main.target_tempo || main.due_date) && (
              <p className="s" style={{ fontSize: 13 }}>
                {main.target_tempo ? `목표 ♩=${main.target_tempo}` : ''}{main.target_tempo && main.due_date ? ' · ' : ''}{main.due_date ? `다음 레슨 ${main.due_date}` : ''}
              </p>
            )}
          </div>
          <Link to={`/score/${main.score.id}`} className="btn primary">▶ 악보 열고 듣기</Link>
        </section>
      ) : (
        <section className="card" style={{ padding: 24 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>아직 받은 과제가 없어요</p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>선생님이 과제를 주면 여기에 떠요. 그동안 <Link to="/board" style={{ color: 'var(--accent)' }}>악보 자료실</Link>에서 아무 곡이나 들어보세요.</p>
        </section>
      )}

      {loading ? <div className="loading">불러오는 중…</div> : (
        <>
          {current.length > 1 && (
            <>
              <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>진행 중인 과제</h2>
              <div className="grid">
                {current.slice(1).map(r => <Card key={r.id} r={r} hl />)}
              </div>
            </>
          )}
          {done.length > 0 && (
            <>
              <h2 style={{ margin: '8px 0 0', fontSize: 18 }}>끝낸 과제</h2>
              <div className="grid">{done.map(r => <Card key={r.id} r={r} />)}</div>
            </>
          )}
        </>
      )}
    </Shell>
  )
}

function Card({ r, hl }: { r: Row; hl?: boolean }) {
  const s = r.score
  return (
    <article className="card score-card">
      <div className={'thumb' + (hl ? ' hl' : '')}>
        <Staff />
        <span className={'tag' + (hl ? ' hl' : '')}>{hl ? '진행 중' : '완료'}</span>
      </div>
      <div className="body">
        <div>
          <p className="t">{s.title}</p>
          <p className="s">{[s.composer, s.key_sig, r.target_tempo && `목표 ♩=${r.target_tempo}`].filter(Boolean).join(' · ')}</p>
          {r.note && <p className="s" style={{ marginTop: 6, color: 'var(--ink-2)' }}>{r.note}</p>}
        </div>
        <div className="actions"><Link to={`/score/${s.id}`} className={'btn ' + (hl ? 'primary' : 'dark')} style={{ flex: 1 }}>열기</Link></div>
      </div>
    </article>
  )
}
