import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// 코치 화면: 학생 가입 신청 승인 대기 목록
type Req = { id: string; name: string; email: string | null; major: string | null; campus: string | null; teacher_id: string | null; created_at: string }
type Coach = { id: string; name: string }

export default function PendingRequests({ onChange }: { onChange?: () => void }) {
  const { teacherId } = useAuth()
  const [reqs, setReqs] = useState<Req[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('join_requests').select('id,name,email,major,campus,teacher_id,created_at').eq('status', 'pending').order('created_at'),
      supabase.rpc('list_coaches'),
    ])
    setReqs((data as Req[]) ?? []); setCoaches((c as Coach[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function approve(r: Req) {
    setBusy(r.id); setMsg('')
    const coach = pick[r.id] ?? r.teacher_id ?? teacherId ?? null
    const { error } = await supabase.rpc('approve_join_request', { req: r.id, coach })
    setBusy(null)
    if (error) return setMsg('승인하지 못했어요. 새로고침 후 다시 해 주세요.')
    setMsg(`${r.name} 학생을 승인했어요.`); load(); onChange?.()
  }
  async function reject(r: Req) {
    if (!confirm(`${r.name} 신청을 거절할까요? 학생은 다시 신청할 수 있어요.`)) return
    setBusy(r.id)
    await supabase.rpc('reject_join_request', { req: r.id })
    setBusy(null); load()
  }

  if (!reqs.length) return msg ? <p className="ok">{msg}</p> : null
  const fmt = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

  return (
    <section className="card pending">
      <p className="t">승인 대기 <b>{reqs.length}</b>명</p>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>학원생이 맞는지 확인하고 승인해 주세요. 모르는 신청은 거절해 주세요.</p>
      {reqs.map(r => (
        <div key={r.id} className="pending-row">
          <div className="who">
            <b>{r.name}</b> <span className="muted">· {r.major ?? '-'} · {r.campus ?? '-'} · {fmt(r.created_at)}</span>
            <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
          </div>
          <select value={pick[r.id] ?? r.teacher_id ?? teacherId ?? ''} onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))} aria-label="담당 코치">
            <option value="">담당 코치 없음</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn primary sm" disabled={busy === r.id} onClick={() => approve(r)}>승인</button>
          <button className="btn sm" disabled={busy === r.id} onClick={() => reject(r)}>거절</button>
        </div>
      ))}
      {msg && <p className="ok" style={{ marginTop: 8 }}>{msg}</p>}
    </section>
  )
}
