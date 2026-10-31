import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = { id: string; name: string; major: string | null; campus: string | null; mine: boolean; coaches: string | null }

// 코치 › 학생: 내 담당 전공과 같은 학생 추천 → 눌러서 바로 내 학생으로 (초반 세팅용)
export default function CoachSuggest({ onAdded }: { onAdded: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  async function load() {
    const { data, error } = await supabase.rpc('coach_suggestions')
    setRows(error ? null : ((data ?? []) as Row[]))
  }
  useEffect(() => { load() }, [])
  async function add(r: Row) {
    setBusy(r.id)
    const { error } = await supabase.rpc('coach_add_student', { sid: r.id })
    setBusy(null)
    if (error) return alert('추가하지 못했어요: ' + error.message)
    setRows(list => (list ?? []).map(x => x.id === r.id ? { ...x, mine: true } : x)); onAdded()
  }
  async function addAll() {
    const todo = (rows ?? []).filter(r => !r.mine)
    if (!todo.length || !confirm(`같은 전공 학생 ${todo.length}명을 모두 내 학생으로 추가할까요?`)) return
    for (const r of todo) await add(r)
  }
  if (!rows) return null // 담당 전공이 없거나 아직 준비 전
  const todo = rows.filter(r => !r.mine)
  return (
    <section className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ flex: 1 }}>👋 같은 전공 학생 {todo.length ? `${todo.length}명` : ''}</b>
        {todo.length > 1 && <button type="button" className="btn sm" onClick={addAll}>모두 내 학생으로</button>}
      </div>
      {!rows.length ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>담당 전공이 정해지면 같은 전공 학생이 여기에 추천돼요. (담당 전공은 원장님이 회원 관리에서 정해요)</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...rows].sort((a, b) => Number(a.mine) - Number(b.mine) || a.name.localeCompare(b.name)).map(r => (
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{r.name}</b> <span className="muted" style={{ fontSize: 12 }}>{[r.major, r.campus?.replace('뮤지션센터', ''), r.coaches ? `담당 ${r.coaches}` : '담당 코치 없음'].filter(Boolean).join(' · ')}</span>
              </span>
              {r.mine ? <span className="muted" style={{ fontSize: 12 }}>✓ 내 학생</span>
                : <button type="button" className="btn sm primary" disabled={busy === r.id} onClick={() => add(r)}>＋ 내 학생으로</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
