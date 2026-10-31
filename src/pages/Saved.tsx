import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import { supabase, type Score } from '../lib/supabase'

// 내 보관함: ☆ 눌러 담아 둔 자료
export default function Saved() {
  const [rows, setRows] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('score_bookmarks').select('created_at, score:scores(*)').order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows(((data ?? []) as unknown as { score: Score | null }[]).map(r => r.score).filter((s): s is Score => !!s && !s.hidden))
        setLoading(false)
      })
  }, [])
  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>☆ 눌러 담아 둔 자료</p>
        <h1 className="title">내 보관함</h1>
      </div>
      {loading ? <div className="loading">불러오는 중…</div> : rows.length ? (
        <div className="mat-list">{rows.map(s => <MaterialRow key={s.id} s={s} />)}</div>
      ) : (
        <section className="card" style={{ padding: 20 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>아직 담아 둔 자료가 없어요.</p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>자료를 열고 <b>☆ 보관함에 담기</b>를 누르면 여기에 모여요. <Link to="/board" style={{ color: 'var(--accent-deep)' }}>자료실 가기 ›</Link></p>
        </section>
      )}
    </Shell>
  )
}
