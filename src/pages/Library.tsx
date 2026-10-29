import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { supabase, type Assignment, type Score } from '../lib/supabase'

const CATS = ['전체', '교재', '발표회 곡', '가요·OST', '클래식']

function Staff() {
  return (
    <svg width="200" height="60" viewBox="0 0 200 60" aria-hidden="true">
      <g stroke="#94a3b8" strokeWidth="1">
        {[12, 20, 28, 36, 44].map(y => <line key={y} x1="10" x2="190" y1={y} y2={y} />)}
      </g>
      <g fill="#334155">
        <ellipse cx="55" cy="32" rx="4" ry="3" /><ellipse cx="85" cy="28" rx="4" ry="3" />
        <ellipse cx="115" cy="24" rx="4" ry="3" /><ellipse cx="145" cy="20" rx="4" ry="3" />
      </g>
    </svg>
  )
}

export default function Library() {
  const { student } = useAuth()
  const [scores, setScores] = useState<Score[]>([])
  const [assigns, setAssigns] = useState<Assignment[]>([])
  const [cat, setCat] = useState('전체')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('scores').select('*').order('created_at', { ascending: false }),
      supabase.from('assignments').select('*').eq('student_id', student!.id),
    ]).then(([s, a]) => {
      setScores(s.data ?? [])
      setAssigns(a.data ?? [])
      setLoading(false)
    })
  }, [student])

  const current = assigns.filter(a => a.is_current)
  const currentIds = new Set(current.map(a => a.score_id))
  const main = current[0] ? scores.find(s => s.id === current[0].score_id) : undefined

  const shown = useMemo(() => scores
    .filter(s => cat === '전체' || s.category === cat)
    .filter(s => !q || (s.title + (s.composer ?? '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(currentIds.has(b.id)) - Number(currentIds.has(a.id))),
  [scores, cat, q, assigns])

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{student?.name} 학생 · {student?.class_name}</p>
          <h1 className="title">오늘도 한 곡 연주해 볼까요?</h1>
        </div>
      </div>

      {main && current[0] && (
        <section className="card hero">
          <div className="big">♪</div>
          <div className="body">
            <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>선생님이 지정한 이번 주 과제</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{main.title}</p>
            {current[0].note && <p style={{ margin: '4px 0 0', fontSize: 14, color: '#4b5563' }}>{current[0].note}</p>}
          </div>
          <Link to={`/score/${main.id}`} className="btn primary">▶ 악보 열고 듣기</Link>
        </section>
      )}

      <div className="chips">
        {CATS.map(c => (
          <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
        ))}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="muted">
          검색
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="곡 이름, 작곡가"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, width: 200 }} />
        </label>
      </div>

      {loading ? <div className="loading">악보를 불러오는 중…</div> : (
        <div className="grid">
          {shown.map(s => {
            const hl = currentIds.has(s.id)
            return (
              <article key={s.id} className="card score-card">
                <div className={'thumb' + (hl ? ' hl' : '')}>
                  <Staff />
                  <span className={'tag' + (hl ? ' hl' : '')}>{hl ? '이번 주 과제' : s.category}</span>
                </div>
                <div className="body">
                  <div>
                    <p className="t">{s.title}</p>
                    <p className="s">{[s.composer, s.key_sig, s.tempo && `♩=${s.tempo}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="actions">
                    <Link to={`/score/${s.id}`} className={'btn ' + (hl ? 'primary' : 'dark')} style={{ flex: 1 }}>열기</Link>
                  </div>
                </div>
              </article>
            )
          })}
          {shown.length === 0 && <p className="muted">조건에 맞는 악보가 없어요.</p>}
        </div>
      )}
    </Shell>
  )
}
