import { useEffect, useState, type FormEvent } from 'react'
import Shell from '../../components/Shell'
import { supabase, type Student, type Teacher } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import AdminPeople, { type PeopleTab, type StudentFilter } from './AdminPeople'
import { useAuth } from '../../lib/auth'
import PendingRequests from '../../components/PendingRequests'
import ErrorLogCard from '../../components/ErrorLogCard'
import { ReportsCard } from '../../components/ScoreReport'

// 관리자 화면: 코치·학생 수, 코치↔학생 매칭, 코치 등록, 학생 담당 코치 지정
export default function Admin() {
  const { teacherId } = useAuth()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [links, setLinks] = useState<{ student_id: string; teacher_id: string; is_primary: boolean }[]>([]) // 학생↔코치 여러 명
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher')
  const [camps, setCamps] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<PeopleTab>('coach')
  const [sf, setSf] = useState<StudentFilter>('all')
  const go = (t: PeopleTab, f: StudentFilter = 'all') => { setTab(t); setSf(f); requestAnimationFrame(() => document.getElementById('people')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }

  async function load() {
    const [{ data: t }, { data: s }, { data: l }] = await Promise.all([
      supabase.from('teachers').select('*').order('role').order('name'),
      supabase.from('students').select('*').order('name'),
      supabase.from('student_teachers').select('student_id,teacher_id,is_primary'),
    ])
    setLinks((l ?? []) as { student_id: string; teacher_id: string; is_primary: boolean }[])
    setTeachers(t ?? []); setStudents((s ?? []).filter(x => !x.staff_preview)) // 관리자 미리보기 기록은 학생 수·매칭에서 제외
  }
  useEffect(() => { load() }, [])

  async function addTeacher(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    if (!name.trim() || !email.includes('@')) return setErr('이름과 이메일을 확인해 주세요.')
    const { error } = await supabase.from('teachers').insert({ name: name.trim(), email: email.trim().toLowerCase(), role, campuses: camps })
    if (error) return setErr(error.message.includes('teachers_email_lower_idx') ? '이미 등록된 이메일이에요.' : '저장하지 못했어요: ' + error.message)
    setMsg(`${name.trim()} 코치님을 등록했어요. 그 이메일로 로그인하면 바로 코치 화면이 열려요.`)
    setName(''); setEmail(''); setRole('teacher'); setCamps([]); load()
  }
  // 담당 전공 (최대 3개): '담당 강사 검수' 자료가 이 전공 코치에게 보여요
  async function toggleMajor(t: Teacher, m: string) {
    const cur = t.majors ?? []
    if (!cur.includes(m) && cur.length >= 3) return alert('담당 전공은 3개까지 고를 수 있어요.')
    const { error } = await supabase.from('teachers').update({ majors: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] }).eq('id', t.id)
    if (error) return alert('바꾸지 못했어요: ' + error.message)
    load()
  }

  const activeT = teachers.filter(t => t.active)
  const activeS = students.filter(s => s.active)
  const unassigned = activeS.filter(st => !links.some(l => l.student_id === st.id)) // 연결된 코치가 한 명도 없는 학생

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · {BRAND.academyShort}</p>
        <h1 className="title">회원 관리</h1>
      </div>

      <ReportsCard />

      {/* 가입 신청 승인 (정식 학생·코치 권한은 여기서만) */}
      <PendingRequests onChange={load} />

      {/* 코치 담당 전공 한눈에 (최대 3) — 자료실 기본 보기·악보 창고·같은 전공 학생 추천에 쓰임 */}
      {activeT.length > 0 && (
        <details className="card" open={activeT.some(t => !(t.majors ?? []).length)} style={{ padding: '14px 18px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
            🎓 코치 담당 전공 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 아직 안 정한 코치 {activeT.filter(t => !(t.majors ?? []).length).length}명 / {activeT.length}명</span>
          </summary>
          <p className="muted" style={{ margin: '8px 0 10px', fontSize: 13 }}>눌러서 켜고 꺼요 (최대 3개). 코치님도 홈·내 계정 메뉴에서 직접 고를 수 있어요.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...activeT].sort((a, b) => ((a.majors ?? []).length ? 1 : 0) - ((b.majors ?? []).length ? 1 : 0) || a.name.localeCompare(b.name, 'ko')).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '1px solid var(--line, #eee)' }}>
                <b style={{ minWidth: 84, fontSize: 14 }}>{t.name}{t.role === 'admin' ? ' (관리자)' : ''}</b>
                {BRAND.majors.map(m => (
                  <button key={m} type="button" className={'pill' + ((t.majors ?? []).includes(m) ? ' on' : '')} style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => toggleMajor(t, m)}>{m}</button>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 숫자 요약 */}
      <div className="form-row" style={{ gap: 12 }}>
        {[
          ['코치', activeT.filter(t => t.role === 'teacher').length, `관리자 ${activeT.filter(t => t.role === 'admin').length}명 별도`],
          ['학생', activeS.length, `연결됨 ${activeS.filter(s => s.linked_at).length} · 대기 ${activeS.filter(s => !s.linked_at).length}`],
          ['담당 코치 없는 학생', unassigned.length, unassigned.length ? '눌러서 지정해 주세요' : '모두 배정됨'],
        ].map(([k, v, sub], i) => (
          <button key={String(k)} type="button" className="card" onClick={() => i === 0 ? go('coach') : i === 1 ? go('student') : go('student', 'nocoach')}
            style={{ padding: 18, flex: '1 1 160px', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', border: 'none' }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{k} <span style={{ float: 'right' }}>보기 ›</span></p>
            <p style={{ margin: '4px 0 2px', fontSize: 32, fontWeight: 700 }}>{v}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>명</span></p>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>{sub}</p>
          </button>
        ))}
      </div>

      {/* 코치·학생 눌러서 바꾸기 / 전공별 / 연결 */}
      <AdminPeople teachers={teachers} students={students} links={links} reload={load} myTeacherId={teacherId ?? null}
        tab={tab} setTab={setTab} filter={sf} setFilter={setSf} />

      {/* 코치 등록 */}
      <details className="card" style={{ padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>➕ 코치 등록</summary>
      <form onSubmit={addTeacher} style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-row">
          <label className="field"><span>코치 이름 <em className="req">필수</em></span><input value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field" style={{ flex: '2 1 240px' }}><span>로그인 이메일 <em className="req">필수</em> <em className="opt">카카오 계정 이메일</em></span><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label className="field"><span>권한</span>
            <select value={role} onChange={e => setRole(e.target.value as any)}><option value="teacher">코치</option><option value="admin">관리자</option></select>
          </label>
          <button className="btn primary">등록</button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
          <span className="muted">수업 센터 (둘 다 가능)</span>
          {BRAND.campuses.map(c => (
            <label key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={camps.includes(c.name)} onChange={e => setCamps(v => e.target.checked ? [...v, c.name] : v.filter(x => x !== c.name))} />{c.name}
            </label>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>등록한 이메일로 로그인(가입)하는 순간 자동으로 코치 권한이 붙어요. 이미 가입한 계정이면 바로 연결돼요. 따로 초대 코드는 없어요.</p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>관리자는 학생 화면도 볼 수 있어요(관리자 미리보기, 학생 수에는 안 들어가요). 코치는 학생 기록을 가질 수 없어요.</p>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </form>
      </details>


      <ErrorLogCard />
    </Shell>
  )
}
