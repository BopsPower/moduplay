import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'

// 학원에서 아직 확인되지 않은 계정: 가입 신청서 → 코치/원장 승인 대기
type Req = { id: string; name: string; major: string | null; campus: string | null; teacher_id: string | null; kind?: 'student' | 'coach'; status: 'pending' | 'approved' | 'rejected'; created_at: string }
type Coach = { id: string; name: string }

export default function JoinRequest({ session, onApproved }: { session: Session; onApproved: () => Promise<void> }) {
  const meta = (session.user.user_metadata ?? {}) as Record<string, string>
  const [req, setReq] = useState<Req | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(meta.name || meta.full_name || meta.nickname || '')
  const [major, setMajor] = useState('')
  const [campus, setCampus] = useState('')
  const [coach, setCoach] = useState('')
  const [kind, setKind] = useState<'student' | 'coach' | null>(null) // 처음에 학생/코치부터 고름
  const [campuses, setCampuses] = useState<string[]>([]) // 코치: 여러 센터 가능
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('join_requests').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase.rpc('list_coaches'),
    ])
    setReq((r as Req) ?? null); setCoaches((c as Coach[]) ?? [])
    if (r) { setName(r.name); setMajor(r.major ?? ''); setCampus(r.campus ?? ''); setCoach(r.teacher_id ?? ''); setKind(r.kind ?? 'student'); setCampuses(r.kind === 'coach' && r.campus ? r.campus.split(',') : []) }
    setLoading(false)
    if (r?.status === 'approved') await onApproved()
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!name.trim()) return setErr('이름을 적어 주세요.')
    if (!kind) return setErr('학생인지 코치인지 먼저 골라 주세요.')
    if (kind === 'coach') {
      if (!campuses.length) return setErr('수업하는 센터를 하나 이상 골라 주세요.')
    } else {
      if (!major) return setErr('전공을 골라 주세요.')
      if (!campus) return setErr('다니는 센터를 골라 주세요.')
    }
    setBusy(true)
    const row = kind === 'coach'
      ? { kind, name: name.trim(), major: null, campus: campuses.join(','), teacher_id: null, status: 'pending' as const, user_id: session.user.id }
      : { kind, name: name.trim(), major, campus, teacher_id: coach || null, status: 'pending' as const, user_id: session.user.id }
    const { error } = req
      ? await supabase.from('join_requests').update(row).eq('id', req.id)
      : await supabase.from('join_requests').insert(row)
    setBusy(false)
    if (error) return setErr('신청하지 못했어요. 잠시 뒤 다시 해 주세요.')
    setEditing(false); load()
  }

  if (loading) return <p className="muted" style={{ margin: 0, textAlign: 'center' }}>확인하는 중…</p>

  if (req && req.status === 'pending' && !editing) {
    const cn = coaches.find(c => c.id === req.teacher_id)?.name
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>신청했어요. 승인을 기다리는 중이에요.</p>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>{req.kind === 'coach' ? '원장님이 확인하면 바로 코치 화면이 열려요.' : <>코치님이나 원장님이 확인하면 바로 열려요. 레슨 때 코치님께 "모두플레이 신청했어요"라고 말씀해 주시면 더 빨라요.</>}</p>
        <div className="card" style={{ padding: 14, fontSize: 14, lineHeight: 1.8 }}>
          {req.kind === 'coach'
            ? <><div><b>{req.name}</b> · 코치 신청</div><div className="muted">수업 센터: {(req.campus ?? '').split(',').join(', ')} · {session.user.email}</div></>
            : <><div><b>{req.name}</b> · {req.major} · {req.campus}</div><div className="muted">담당 코치: {cn ?? '선택 안 함'} · {session.user.email}</div></>}
        </div>
        <button className="btn primary wide" onClick={load}>승인됐는지 확인하기</button>
        <button className="btn wide" onClick={() => setEditing(true)}>신청 내용 고치기</button>
        <button className="btn wide" style={{ border: 'none' }} onClick={() => supabase.auth.signOut()}>다른 계정으로 로그인</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{req?.status === 'rejected' && !editing ? '신청이 승인되지 않았어요' : '모두플레이 이용 신청'}</p>
      <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
        {req?.status === 'rejected' && !editing
          ? '학원에서 확인되지 않았어요. 내용을 확인해 다시 신청하거나 원장님·담당 코치님께 문의해 주세요.'
          : '모두의음악 학원생과 코치만 쓸 수 있어요. 아래를 적어 신청하면 확인 후 열어 드려요.'}
      </p>
      <p style={{ margin: '4px 0 0', fontWeight: 700 }}>어떤 분이세요?</p>
      <div className="seg" role="radiogroup" aria-label="신청 구분">
        <button type="button" role="radio" aria-checked={kind === 'student'} className={'btn' + (kind === 'student' ? ' primary' : '')} style={{ padding: '14px 8px' }} onClick={() => setKind('student')}>학생이에요</button>
        <button type="button" role="radio" aria-checked={kind === 'coach'} className={'btn' + (kind === 'coach' ? ' primary' : '')} style={{ padding: '14px 8px' }} onClick={() => setKind('coach')}>코치예요</button>
      </div>
      {kind && <>
      <label className="field"><span>이름 (실명)</span><input value={name} onChange={e => setName(e.target.value)} maxLength={40} /></label>
      {kind === 'coach' ? (
        <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
          <span>수업하는 센터 (여러 개 고를 수 있어요)</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 6 }}>
            {BRAND.campuses.map(c => (
              <label key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}>
                <input type="checkbox" checked={campuses.includes(c.name)} onChange={e => setCampuses(v => e.target.checked ? [...v, c.name] : v.filter(x => x !== c.name))} />{c.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="field"><span>전공</span>
            <select value={major} onChange={e => setMajor(e.target.value)}><option value="">선택</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="field"><span>다니는 센터</span>
            <select value={campus} onChange={e => setCampus(e.target.value)}><option value="">선택</option>{BRAND.campuses.map(c => <option key={c.name}>{c.name}</option>)}</select>
          </label>
          <label className="field"><span>담당 코치 (모르면 비워 두세요)</span>
            <select value={coach} onChange={e => setCoach(e.target.value)}><option value="">모름</option>{coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
        </>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>신청에는 이름·{kind === 'coach' ? '센터' : '전공·센터'}와 로그인한 계정 이메일({session.user.email})이 쓰입니다. {kind === 'coach' ? '코치 확인과 학생 연결' : '학원생 확인과 과제 연결'}에만 사용해요.</p>
      </>}
      {err && <p className="err">{err}</p>}
      {kind && <button className="btn primary wide" disabled={busy}>{busy ? '잠시만요…' : req ? '다시 신청하기' : kind === 'coach' ? '코치로 신청하기' : '학생으로 신청하기'}</button>}
      {editing && <button type="button" className="btn wide" onClick={() => setEditing(false)}>취소</button>}
      <button type="button" className="btn wide" style={{ border: 'none' }} onClick={() => supabase.auth.signOut()}>다른 계정으로 로그인</button>
    </form>
  )
}
