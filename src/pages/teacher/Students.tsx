import { useEffect, useState, type FormEvent } from 'react'
import { copyText } from '../../lib/copy'
import Shell from '../../components/Shell'
import { supabase, type Student } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import PendingRequests from '../../components/PendingRequests'
import { useAuth } from '../../lib/auth'

type Row = Student & { email: string | null; invite_token: string; linked_at: string | null; week_seconds?: number }

export default function Students() {
  const { teacherId, session } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [cls, setCls] = useState('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    const { data } = await supabase.from('students').select('*').order('active', { ascending: false }).order('name')
    const { data: wk } = await supabase.from('practice_weekly').select('student_id, seconds')
    const sum: Record<string, number> = {}
    for (const w of wk ?? []) sum[w.student_id] = (sum[w.student_id] ?? 0) + w.seconds
    setRows((data ?? []).filter((r: Row) => !r.staff_preview && r.user_id !== session?.user.id).map((r: Row) => ({ ...r, week_seconds: sum[r.id] ?? 0 })))
  }
  useEffect(() => { load() }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!name.trim()) return setErr('학생 이름을 입력해 주세요.')
    if (email && !email.includes('@')) return setErr('이메일 형식을 확인해 주세요.')
    setBusy(true)
    const { error } = await supabase.from('students').insert({ name: name.trim(), class_name: cls.trim() || null, email: email.trim() || null, teacher_id: teacherId }) // 추가한 코치가 담당
    setBusy(false)
    if (error) return setErr(error.message.includes('students_email_lower_idx') ? '이미 같은 이메일의 학생이 있어요.' : '저장하지 못했어요. 다시 시도해 주세요.')
    setName(''); setCls(''); setEmail('')
    setMsg(`${name.trim()} 학생을 등록했어요.`)
    load()
  }

  async function setMajor(r: Row, m: string) {
    await supabase.from('students').update({ class_name: m || null }).eq('id', r.id)
    load()
  }

  async function toggle(r: Row) {
    await supabase.from('students').update({ active: !r.active }).eq('id', r.id)
    load()
  }

  const [copied, setCopied] = useState<string | null>(null)
  const [linkBox, setLinkBox] = useState<{ name: string; url: string } | null>(null)
  const inviteUrl = (r: Row) => `${window.location.origin}/login?invite=${r.invite_token}`

  async function copyInvite(r: Row) {
    const url = inviteUrl(r)
    if (await copyText(url)) {
      setCopied(r.id); setTimeout(() => setCopied(c => (c === r.id ? null : c)), 2500)
    } else {
      setLinkBox({ name: r.name, url }) // 복사가 막힌 환경: 링크를 직접 보여줌
    }
  }

  async function shareInvite(r: Row) {
    const url = inviteUrl(r)
    try { await navigator.share({ title: `${BRAND.app} 초대`, text: `${r.name} 학생, ${BRAND.app}에 들어와 주세요.`, url }) }
    catch { /* 취소 */ }
  }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  const fmtMin = (s = 0) => s < 60 ? '0분' : `${Math.round(s / 60)}분`

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치 화면</p>
        <h1 className="title">학생</h1>
      </div>

      <PendingRequests onChange={load} />

      <form onSubmit={add} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>학생 등록</p>
        <div className="form-row">
          <label className="field"><span>이름</span><input value={name} onChange={e => setName(e.target.value)} placeholder="지우" /></label>
          <label className="field"><span>전공</span>
            <select value={cls} onChange={e => setCls(e.target.value)}>
              <option value="">선택</option>
              {BRAND.majors.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '2 1 240px' }}><span>이메일 (카카오·구글 계정 이메일도 돼요)</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="모르면 비워두고 초대 링크로" /></label>
          <button className="btn primary" disabled={busy}>등록</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>이메일을 넣으면 학생이 그 이메일로 로그인하는 순간 자동으로 연결돼요. 이메일을 모르면 등록 후 "초대 링크 복사"를 눌러 카톡으로 보내 주세요.</p>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </form>

      <div className="chips" style={{ justifyContent: 'flex-end' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="muted">
          검색
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 전공, 이메일 (일부만 입력해도 돼요)"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', width: 240 }} />
        </label>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>이름</th><th>전공</th><th>이메일</th><th>연결</th><th>이번 주 연습</th><th></th></tr></thead>
          <tbody>
            {rows.filter(r => matches(q, r.name, r.class_name, r.email)).map(r => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : .5 }}>
                <td style={{ fontWeight: 700 }}>{r.name}</td>
                <td>
                  <select value={r.class_name ?? ''} onChange={e => setMajor(r, e.target.value)} style={{ padding: '4px 6px', border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: 14 }}>
                    <option value="">-</option>
                    {BRAND.majors.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td className="muted">{r.email ?? '-'}</td>
                <td>{r.linked_at ? <span className="pill on">연결됨</span> : <span className="pill">대기</span>}</td>
                <td>{fmtMin(r.week_seconds)}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {!r.linked_at && <button className="btn sm ghost" onClick={() => copyInvite(r)} style={copied === r.id ? { borderColor: '#16a34a', color: '#16a34a' } : undefined}>{copied === r.id ? '복사됨 ✓' : '초대 링크 복사'}</button>}{!r.linked_at && canShare && <> <button className="btn sm ghost" onClick={() => shareInvite(r)}>보내기</button></>}{' '}
                  <button className="btn sm ghost" onClick={() => toggle(r)}>{r.active ? '그만둠' : '다시 활성'}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>아직 등록된 학생이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      {linkBox && (
        <div className="modal-bg" onClick={() => setLinkBox(null)}>
          <div className="card modal" onClick={e => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700 }}>{linkBox.name} 초대 링크</p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>자동 복사가 막혀 있어요. 아래 링크를 길게 누르거나 전체 선택해서 복사해 주세요.</p>
            <input readOnly value={linkBox.url} onFocus={e => e.currentTarget.select()} autoFocus style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', fontSize: 14 }} />
            <button className="btn wide" onClick={() => setLinkBox(null)}>닫기</button>
          </div>
        </div>
      )}
    </Shell>
  )
}
