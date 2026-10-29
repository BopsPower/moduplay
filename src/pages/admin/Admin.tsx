import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Shell from '../../components/Shell'
import { supabase, type Student, type Teacher } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'

// 관리자 화면: 코치·학생 수, 코치↔학생 매칭, 코치 등록, 학생 담당 코치 지정
export default function Admin() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  async function load() {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('teachers').select('*').order('role').order('name'),
      supabase.from('students').select('*').order('name'),
    ])
    setTeachers(t ?? []); setStudents(s ?? [])
  }
  useEffect(() => { load() }, [])

  async function addTeacher(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    if (!name.trim() || !email.includes('@')) return setErr('이름과 이메일을 확인해 주세요.')
    const { error } = await supabase.from('teachers').insert({ name: name.trim(), email: email.trim().toLowerCase(), role })
    if (error) return setErr(error.message.includes('teachers_email_lower_idx') ? '이미 등록된 이메일이에요.' : '저장하지 못했어요: ' + error.message)
    setMsg(`${name.trim()} 코치님을 등록했어요. 그 이메일로 로그인하면 바로 코치 화면이 열려요.`)
    setName(''); setEmail(''); setRole('teacher'); load()
  }
  async function setTeacherOf(st: Student, teacherId: string) {
    await supabase.from('students').update({ teacher_id: teacherId || null }).eq('id', st.id); load()
  }
  async function toggleTeacher(t: Teacher) {
    await supabase.from('teachers').update({ active: !t.active }).eq('id', t.id); load()
  }
  async function setRoleOf(t: Teacher, r: 'admin' | 'teacher') {
    await supabase.from('teachers').update({ role: r }).eq('id', t.id); load()
  }

  const activeT = teachers.filter(t => t.active)
  const activeS = students.filter(s => s.active)
  const byTeacher = useMemo(() => {
    const m = new Map<string, Student[]>()
    for (const s of activeS) { const k = s.teacher_id ?? ''; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    return m
  }, [activeS])
  const unassigned = byTeacher.get('') ?? []

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · {BRAND.academyShort}</p>
        <h1 className="title">회원 관리</h1>
      </div>

      {/* 숫자 요약 */}
      <div className="form-row" style={{ gap: 12 }}>
        {[
          ['코치', activeT.filter(t => t.role === 'teacher').length, `관리자 ${activeT.filter(t => t.role === 'admin').length}명 별도`],
          ['학생', activeS.length, `연결됨 ${activeS.filter(s => s.linked_at).length} · 대기 ${activeS.filter(s => !s.linked_at).length}`],
          ['담당 코치 없는 학생', unassigned.length, unassigned.length ? '아래에서 지정해 주세요' : '모두 배정됨'],
        ].map(([k, v, sub]) => (
          <div key={String(k)} className="card" style={{ padding: 18, flex: '1 1 160px' }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{k}</p>
            <p style={{ margin: '4px 0 2px', fontSize: 32, fontWeight: 700 }}>{v}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>명</span></p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* 코치 등록 */}
      <form onSubmit={addTeacher} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>코치 등록</p>
        <div className="form-row">
          <label className="field"><span>이름</span><input value={name} onChange={e => setName(e.target.value)} placeholder="김코치" /></label>
          <label className="field" style={{ flex: '2 1 240px' }}><span>로그인 이메일 (카카오·구글 계정 이메일)</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teacher@example.com" /></label>
          <label className="field"><span>권한</span>
            <select value={role} onChange={e => setRole(e.target.value as any)}><option value="teacher">코치</option><option value="admin">관리자</option></select>
          </label>
          <button className="btn primary">등록</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>등록한 이메일로 로그인(가입)하는 순간 자동으로 코치 권한이 붙어요. 따로 초대 코드는 없어요.</p>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </form>

      {/* 코치별 매칭 */}
      <div className="chips" style={{ justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>코치 ↔ 학생 매칭</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="muted">검색
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="코치·학생 이름, 전공" style={{ padding: '8px 12px', border: '1px solid #d1d5db', width: 220 }} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[...teachers.map(t => [t, byTeacher.get(t.id) ?? []] as [Teacher, Student[]]), [null, unassigned] as [null, Student[]]]
          .filter(([t, list]) => (t ? matches(q, t.name, t.email) : false) || list.some(s => matches(q, s.name, s.class_name, s.email)) || (!q && (t || list.length)))
          .map(([t, list]) => (
          <div key={t?.id ?? 'none'} className="card" style={{ padding: 18, opacity: t && !t.active ? .5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 16 }}>{t ? t.name : '담당 코치 없음'}</b>
              {t && <span className={'pill' + (t.role === 'admin' ? ' on' : '')}>{t.role === 'admin' ? '관리자' : '코치'}</span>}
              {t && (t.linked_at ? <span className="pill on">연결됨</span> : <span className="pill">가입 대기</span>)}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>학생 {list.length}명</span>
            </div>
            {t && <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>{t.email}</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map(s => (
                <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{s.class_name ?? '-'}</span>
                  <select value={s.teacher_id ?? ''} onChange={e => setTeacherOf(s, e.target.value)} style={{ marginLeft: 'auto', padding: '4px 6px', border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: 13 }} aria-label="담당 코치">
                    <option value="">담당 없음</option>
                    {activeT.map(tt => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                  </select>
                </li>
              ))}
              {list.length === 0 && <li className="muted" style={{ fontSize: 13 }}>배정된 학생이 없어요.</li>}
            </ul>
            {t && (
              <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn sm ghost" onClick={() => setRoleOf(t, t.role === 'admin' ? 'teacher' : 'admin')}>{t.role === 'admin' ? '코치로' : '관리자로'}</button>
                <button className="btn sm ghost" onClick={() => toggleTeacher(t)}>{t.active ? '그만둠' : '다시 활성'}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Shell>
  )
}
