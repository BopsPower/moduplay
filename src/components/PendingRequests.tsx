import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// 코치 화면: 학생 가입 신청 승인 대기 목록
type Req = { id: string; name: string; email: string | null; major: string | null; campus: string | null; teacher_id: string | null; kind?: 'student' | 'coach'; created_at: string }
type Coach = { id: string; name: string }

export default function PendingRequests({ onChange }: { onChange?: () => void }) {
  const { isAdmin } = useAuth()
  const [reqs, setReqs] = useState<Req[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function load() {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('join_requests').select('id,name,email,major,campus,teacher_id,kind,created_at').eq('status', 'pending').order('created_at'),
      supabase.rpc('list_coaches'),
    ])
    setReqs((data as Req[]) ?? []); setCoaches((c as Coach[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function approve(r: Req) {
    setMsg('')
    const coach = pick[r.id] ?? r.teacher_id ?? ''
    if (!coach) return setMsg(`${r.name} 학생의 담당 코치를 먼저 골라 주세요.`)
    if (isStaffLike(r) && !confirm(`${r.name} 님은 학원 직원 이메일(${r.email})이에요.\n학생으로 승인할까요? 직원이면 [거절]을 누르고 \"코치예요\"로 다시 신청하도록 안내해 주세요.`)) return
    setBusy(r.id)
    const { error } = await supabase.rpc('approve_join_request', { req: r.id, coach })
    setBusy(null)
    if (error) {
      if (error.message.includes('staff account')) return setMsg(`${r.name} 님은 이미 코치·관리자로 등록된 계정이라 학생으로 승인할 수 없어요.`)
      if (error.message.includes('coach required')) return setMsg('담당 코치를 골라 주세요.')
      return setMsg('승인하지 못했어요. 새로고침 후 다시 해 주세요.')
    }
    setMsg(`${r.name} 학생을 승인했어요.`); load(); onChange?.()
  }
  async function approveCoach(r: Req, admin: boolean) {
    if (!confirm(`${r.name} 님을 ${admin ? '관리자' : '코치'}로 등록할까요?\n${r.email}`)) return
    setBusy(r.id); setMsg('')
    const { error } = await supabase.rpc('approve_coach_request', { req: r.id, make_admin: admin })
    setBusy(null)
    if (error) return setMsg('등록하지 못했어요. 새로고침 후 다시 해 주세요.')
    setMsg(`${r.name} 님을 ${admin ? '관리자' : '코치'}로 등록했어요. 다시 로그인하면 코치 화면이 열려요.`); load(); onChange?.()
  }
  async function reject(r: Req) {
    if (!confirm(`${r.name} 신청을 거절할까요? 학생은 다시 신청할 수 있어요.`)) return
    setBusy(r.id)
    await supabase.rpc('reject_join_request', { req: r.id })
    setBusy(null); load()
  }

  // 학원 도메인 이메일이거나 코치 명단과 같은 이름이면 직원일 수 있음
  const isStaffLike = (r: Req) => !!r.email?.toLowerCase().endsWith('@modu-music.com') || coaches.some(c => c.name.replace(/\s|원장|코치|피디/g, '') === r.name.replace(/\s/g, ''))

  if (!reqs.length) return msg ? <p className="ok">{msg}</p> : null
  const fmt = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

  return (
    <section className="card pending">
      <p className="t">승인 대기 <b>{reqs.length}</b>명</p>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>학원생이 맞는지 확인하고 담당 코치를 골라 승인해 주세요. 모르는 신청은 거절해 주세요.
        {' '}<b>코치 신청</b>은 {isAdmin ? <>여기서 [코치로 승인]을 눌러 주세요. 관리자 권한은 승인 뒤 <Link to="/admin">관리자 화면</Link>에서 올려요</> : '원장님만 등록할 수 있어요'}. 직원을 학생으로 승인하지 마세요.</p>
      {reqs.map(r => (
        <div key={r.id} className="pending-row">
          <div className="who">
            <b>{r.name}</b> {r.kind !== 'coach' && isStaffLike(r) && <span className="pill" style={{ background: '#fff4d6', color: '#8a5a00' }}>직원일 수 있어요</span>} {r.kind === 'coach'
              ? <><span className="pill on">코치 신청</span> <span className="muted">· {(r.campus ?? '-').split(',').join(', ')} · {fmt(r.created_at)}</span></>
              : <span className="muted">· {r.major ?? '-'} · {r.campus ?? '-'} · {fmt(r.created_at)}</span>}
            <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
          </div>
{r.kind === 'coach' ? (
            <>
              <button className="btn primary sm" disabled={busy === r.id || !isAdmin} onClick={() => approveCoach(r, false)}>코치로 승인</button>
            </>
          ) : (
            <>
                    <select value={pick[r.id] ?? r.teacher_id ?? ''} onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))} aria-label="담당 코치">
            <option value="">담당 코치 선택</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn primary sm" disabled={busy === r.id} onClick={() => approve(r)}>승인</button>
            </>
          )}
          <button className="btn sm" disabled={busy === r.id} onClick={() => reject(r)}>거절</button>
        </div>
      ))}
      {msg && <p className="ok" style={{ marginTop: 8 }}>{msg}</p>}
    </section>
  )
}
