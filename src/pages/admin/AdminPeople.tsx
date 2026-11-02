import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, type Student, type Teacher } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import CoachMultiPick from '../../components/CoachPick'

// 관리자: 코치·학생을 눌러 정보 바꾸기 + 전공별 보기 + 연결 보기
export type Link = { student_id: string; teacher_id: string; is_primary: boolean }
export type PeopleTab = 'coach' | 'student' | 'major' | 'link'
export type StudentFilter = 'all' | 'nocoach' | 'wait' | 'ended'
type Major = { kind: 's' | 't'; id: string } | null

const short = (c?: string | null) => (c ?? '').replace('뮤지션센터', '')
const rowBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%', padding: '12px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--line, #eee)', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }
const nameChip: React.CSSProperties = { cursor: 'pointer', border: 'none', font: 'inherit', fontSize: 13 }

export default function AdminPeople({ teachers, students, links, reload, myTeacherId, tab, setTab, filter, setFilter }: {
  teachers: Teacher[]; students: Student[]; links: Link[]; reload: () => void; myTeacherId: string | null
  tab: PeopleTab; setTab: (t: PeopleTab) => void; filter: StudentFilter; setFilter: (f: StudentFilter) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Major>(null)
  const tName = (id?: string | null) => teachers.find(t => t.id === id)?.name ?? '?'
  const activeT = teachers.filter(t => t.active)
  const activeS = students.filter(s => s.active)
  const staffUids = new Set(teachers.map(t => t.user_id).filter(Boolean))
  const ended = students.filter(s => !s.active && !(s.user_id && staffUids.has(s.user_id))) // 코치 계정 기록은 빼고
  const coachesOf = (sid: string) => links.filter(l => l.student_id === sid).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const studentsOf = (tid: string) => links.filter(l => l.teacher_id === tid).map(l => ({ s: activeS.find(x => x.id === l.student_id), primary: l.is_primary })).filter(x => x.s) as { s: Student; primary: boolean }[]

  const S = (s: Student) => <button key={s.id} type="button" className="pill" style={nameChip} onClick={() => setOpen({ kind: 's', id: s.id })}>{s.name}</button>
  const T = (t: Teacher, extra?: ReactNode) => <button key={t.id} type="button" className="pill on" style={nameChip} onClick={() => setOpen({ kind: 't', id: t.id })}>{t.name}{extra}</button>

  const studentList = useMemo(() => {
    const base = filter === 'ended' ? ended : activeS
    return base.filter(s => filter === 'nocoach' ? !links.some(l => l.student_id === s.id) : filter === 'wait' ? !s.linked_at : true)
      .filter(s => matches(q, s.name, s.class_name, s.campus, s.email, ...coachesOf(s.id).map(l => tName(l.teacher_id))))
  }, [students, links, filter, q, teachers])

  const coachList = [...teachers].sort((a, b) => Number(b.active) - Number(a.active) || (a.role === b.role ? 0 : a.role === 'teacher' ? -1 : 1) || a.name.localeCompare(b.name, 'ko'))
    .filter(t => matches(q, t.name, t.email, ...(t.majors ?? []), ...(t.campuses ?? [])))

  const majors = [...BRAND.majors, '미정'] as string[]
  const majorOf = (s: Student) => (BRAND.majors as readonly string[]).includes(s.class_name ?? '') ? s.class_name! : '미정'

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} id="people">
      <div className="seg" role="tablist" aria-label="보기">
        {([['coach', '👩‍🏫 코치'], ['student', '🎒 학생'], ['major', '🎓 전공별'], ['link', '🔗 연결']] as [PeopleTab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} style={{ fontSize: 14, padding: '10px 4px' }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {(tab === 'coach' || tab === 'student') && (
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'coach' ? '코치 이름·전공·센터 찾기 (초성 OK)' : '학생 이름·전공·코치 찾기 (초성 OK)'} style={{ padding: '10px 12px', border: '1px solid #d1d5db', fontSize: 15 }} />
      )}

      {tab === 'coach' && (
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>코치를 누르면 정보·담당 학생을 바꿀 수 있어요.</p>
          {coachList.map(t => {
            const mine = studentsOf(t.id)
            return (
              <button key={t.id} type="button" style={{ ...rowBtn, opacity: t.active ? 1 : .45 }} onClick={() => setOpen({ kind: 't', id: t.id })}>
                <b style={{ fontSize: 16 }}>{t.name}</b>
                {t.role === 'admin' && <span className="pill on">관리자</span>}
                {!t.active && <span className="pill">그만둠</span>}
                {!t.linked_at && <span className="pill" style={{ background: '#fff1e6' }}>가입 대기</span>}
                <span className="muted" style={{ fontSize: 13 }}>{(t.majors ?? []).join('·') || '전공 미정'} · {(t.campuses ?? []).map(short).join('·') || '센터 미정'}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13 }}>학생 <b>{mine.filter(x => x.primary).length}</b>{mine.some(x => !x.primary) ? ` +함께 ${mine.filter(x => !x.primary).length}` : ''} ›</span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'student' && (
        <div>
          <div className="chips" style={{ gap: 6, marginBottom: 6 }}>
            {([['all', `전체 ${activeS.length}`], ['nocoach', `코치 없음 ${activeS.filter(s => !links.some(l => l.student_id === s.id)).length}`], ['wait', `가입 대기 ${activeS.filter(s => !s.linked_at).length}`], ['ended', `수강 끝남 ${ended.length}`]] as [StudentFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" className={'chip' + (filter === k ? ' on' : '')} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 13 }} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {studentList.map(s => {
            const cs = coachesOf(s.id)
            return (
              <button key={s.id} type="button" style={{ ...rowBtn, opacity: s.active ? 1 : .45 }} onClick={() => setOpen({ kind: 's', id: s.id })}>
                <b style={{ fontSize: 16 }}>{s.name}</b>
                <span className="muted" style={{ fontSize: 13 }}>{s.class_name ?? '전공 미정'} · {short(s.campus) || '센터 미정'}</span>
                {!s.linked_at && <span className="pill" style={{ background: '#fff1e6' }}>가입 대기</span>}
                <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                  {cs.length ? cs.map((l, i) => <span key={l.teacher_id}>{i ? ', ' : ''}{l.is_primary ? <b>{tName(l.teacher_id)}</b> : tName(l.teacher_id)}</span>) : <span style={{ color: '#c2410c' }}>코치 없음</span>} ›
                </span>
              </button>
            )
          })}
          {!studentList.length && <p className="muted" style={{ fontSize: 14 }}>해당하는 학생이 없어요.</p>}
        </div>
      )}

      {tab === 'major' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>이름을 누르면 바로 바꿀 수 있어요. 진한 이름이 코치, 연한 이름이 학생이에요.</p>
          {majors.map(m => {
            const ss = activeS.filter(s => majorOf(s) === m)
            const ts = activeT.filter(t => m === '미정' ? !(t.majors ?? []).length : (t.majors ?? []).includes(m))
            if (!ss.length && !ts.length) return null
            return (
              <div key={m} style={{ paddingBottom: 10, borderBottom: '1px solid var(--line, #eee)' }}>
                <p style={{ margin: '0 0 6px' }}><b style={{ fontSize: 16 }}>{m === '미정' ? '전공 미정' : m}</b> <span className="muted" style={{ fontSize: 13 }}>· 코치 {ts.length} · 학생 {ss.length}</span></p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>{ts.length ? ts.map(t => T(t)) : <span className="muted" style={{ fontSize: 12 }}>이 전공 코치가 아직 없어요</span>}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ss.map(S)}</div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'link' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>코치마다 연결된 학생이에요. <b>★ 담당</b> · 그냥 이름은 함께 배우는 학생.</p>
          {activeT.map(t => {
            const mine = studentsOf(t.id)
            return (
              <div key={t.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--line, #eee)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>{T(t)}<span className="muted" style={{ fontSize: 13 }}>{mine.length}명</span></div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {mine.length ? [...mine].sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ s, primary }) => (
                    <button key={s.id} type="button" className="pill" style={{ ...nameChip, fontWeight: primary ? 700 : 400 }} onClick={() => setOpen({ kind: 's', id: s.id })}>{primary ? '★ ' : ''}{s.name}</button>
                  )) : <span className="muted" style={{ fontSize: 12 }}>연결된 학생 없음</span>}
                </div>
              </div>
            )
          })}
          {(() => {
            const none = activeS.filter(s => !links.some(l => l.student_id === s.id))
            return none.length ? <div><b style={{ color: '#c2410c' }}>코치 없는 학생 {none.length}명</b><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{none.map(S)}</div></div> : null
          })()}
          {(() => {
            const ws = activeS.filter(s => !s.linked_at), wt = activeT.filter(t => !t.linked_at)
            return (ws.length || wt.length) ? (
              <div style={{ background: '#fff1e6', padding: 12, borderRadius: 12 }}>
                <b>앱에 아직 가입 안 함</b> <span className="muted" style={{ fontSize: 12 }}>(등록은 됐지만 로그인 전)</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{wt.map(t => T(t))}{ws.map(S)}</div>
              </div>
            ) : <p className="ok" style={{ margin: 0 }}>코치·학생 모두 앱에 가입(연결)했어요.</p>
          })()}
        </div>
      )}

      {open?.kind === 't' && teachers.find(t => t.id === open.id) && (
        <CoachEditor t={teachers.find(t => t.id === open.id)!} teachers={teachers} students={activeS} links={links} myTeacherId={myTeacherId}
          onOpenStudent={id => setOpen({ kind: 's', id })} onClose={() => setOpen(null)} reload={reload} />
      )}
      {open?.kind === 's' && students.find(s => s.id === open.id) && (
        <StudentEditor s={students.find(s => s.id === open.id)!} teachers={teachers} links={links}
          onOpenCoach={id => setOpen({ kind: 't', id })} onClose={() => setOpen(null)} reload={reload} />
      )}
    </div>
  )
}

function Sheet({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}><b style={{ fontSize: 19 }}>{title}</b>{sub && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>}</div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
const Lbl = ({ children }: { children: ReactNode }) => <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{children}</span>

function CoachEditor({ t, teachers, students, links, myTeacherId, onOpenStudent, onClose, reload }: {
  t: Teacher; teachers: Teacher[]; students: Student[]; links: Link[]; myTeacherId: string | null
  onOpenStudent: (id: string) => void; onClose: () => void; reload: () => void
}) {
  const [name, setName] = useState(t.name)
  const [email, setEmail] = useState(t.email ?? '')
  const [camps, setCamps] = useState<string[]>(t.campuses ?? [])
  const [majors, setMajors] = useState<string[]>(t.majors ?? [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dirty = name !== t.name || email !== (t.email ?? '') || camps.join() !== (t.campuses ?? []).join() || majors.join() !== (t.majors ?? []).join()
  const mine = links.filter(l => l.teacher_id === t.id).map(l => ({ s: students.find(x => x.id === l.student_id), primary: l.is_primary })).filter(x => x.s) as { s: Student; primary: boolean }[]
  const adminsLeft = teachers.filter(x => x.active && x.role === 'admin' && x.id !== t.id).length

  async function save() {
    if (!name.trim()) return setMsg('이름을 적어 주세요.')
    if (!t.linked_at && !email.includes('@')) return setMsg('이메일을 확인해 주세요.')
    setBusy(true); setMsg('')
    const patch: Partial<Teacher> = { name: name.trim(), campuses: camps, majors }
    if (!t.linked_at) patch.email = email.trim().toLowerCase()
    const { error } = await supabase.from('teachers').update(patch).eq('id', t.id)
    setBusy(false)
    if (error) return setMsg(error.message.includes('teachers_email_lower_idx') ? '이미 등록된 이메일이에요.' : '저장하지 못했어요: ' + error.message)
    setMsg('저장했어요 ✓'); reload()
  }
  async function setRole() {
    const r = t.role === 'admin' ? 'teacher' : 'admin'
    if (r === 'teacher' && t.id === myTeacherId) return alert('본인 관리자 권한은 여기서 뺄 수 없어요.')
    if (r === 'teacher' && adminsLeft === 0) return alert('마지막 관리자는 코치로 바꿀 수 없어요.')
    if (!confirm(`${t.name} 님을 ${r === 'admin' ? '관리자' : '코치'}로 바꿀까요?`)) return
    await supabase.from('teachers').update({ role: r }).eq('id', t.id); reload()
  }
  async function toggleActive() {
    if (t.active && t.id === myTeacherId) return alert('본인 계정은 여기서 끌 수 없어요. 다른 관리자에게 부탁해 주세요.')
    if (t.active && t.role === 'admin' && adminsLeft === 0) return alert('마지막 관리자는 끌 수 없어요.')
    if (!confirm(t.active ? `${t.name} 님을 '그만둠'으로 바꿀까요?\n코치 화면에 들어올 수 없게 돼요. (다시 활성으로 되돌릴 수 있어요)` : `${t.name} 님을 다시 활성으로 바꿀까요?`)) return
    await supabase.from('teachers').update({ active: !t.active }).eq('id', t.id); reload()
  }
  async function addStudent(sid: string) {
    if (!sid) return
    const { error } = await supabase.from('student_teachers').insert({ student_id: sid, teacher_id: t.id, is_primary: false })
    if (error && !/duplicate/i.test(error.message)) return alert('추가하지 못했어요: ' + error.message)
    reload()
  }
  async function removeStudent(sid: string) {
    const { error } = await supabase.from('student_teachers').delete().eq('student_id', sid).eq('teacher_id', t.id).eq('is_primary', false)
    if (error) return alert('빼지 못했어요: ' + error.message)
    reload()
  }
  const toggle = (arr: string[], v: string, max = 99) => arr.includes(v) ? arr.filter(x => x !== v) : arr.length >= max ? arr : [...arr, v]

  return (
    <Sheet title={<>👩‍🏫 {t.name} {t.role === 'admin' && <span className="pill on">관리자</span>}</>} sub={`${t.linked_at ? '앱 가입(연결)됨' : '가입 대기 — 아래 이메일로 로그인하면 연결돼요'}${t.active ? '' : ' · 그만둠'}`} onClose={onClose}>
      <label className="field"><span>이름</span><input value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="field"><span>로그인 이메일 {t.linked_at && <em className="opt">연결된 뒤에는 못 바꿔요</em>}</span>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!t.linked_at} /></label>
      <Lbl>수업 센터</Lbl>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {BRAND.campuses.map(c => <button key={c.name} type="button" className={'pill' + (camps.includes(c.name) ? ' on' : '')} style={{ ...nameChip, fontSize: 14, padding: '6px 12px' }} onClick={() => setCamps(v => toggle(v, c.name))}>{c.name}</button>)}
      </div>
      <Lbl>담당 전공 (최대 3)</Lbl>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {BRAND.majors.map(m => <button key={m} type="button" className={'pill' + (majors.includes(m) ? ' on' : '')} style={{ ...nameChip, fontSize: 14, padding: '6px 12px' }} onClick={() => setMajors(v => toggle(v, m, 3))}>{m}</button>)}
      </div>
      {msg && <p className={msg.includes('✓') ? 'ok' : 'err'} style={{ margin: 0 }}>{msg}</p>}
      <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? '저장 중…' : dirty ? '바꾼 내용 저장' : '바뀐 내용 없음'}</button>

      <hr style={{ border: 'none', borderTop: '1px solid var(--line, #eee)', width: '100%', margin: '4px 0' }} />
      <Lbl>연결된 학생 {mine.length}명 · 이름을 누르면 학생 정보로 가요</Lbl>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {mine.sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ s, primary }) => (
          <span key={s.id} className="pill" style={{ fontSize: 13, fontWeight: primary ? 700 : 400, display: 'inline-flex', alignItems: 'center' }}>
            <button type="button" onClick={() => onOpenStudent(s.id)} style={{ ...nameChip, background: 'none', padding: 0, fontWeight: 'inherit' }}>{primary ? '★ ' : ''}{s.name}</button>
            {!primary && <button type="button" aria-label={`${s.name} 빼기`} onClick={() => removeStudent(s.id)} style={{ ...nameChip, background: 'none', padding: '0 0 0 6px' }}>✕</button>}
          </span>
        ))}
        {!mine.length && <span className="muted" style={{ fontSize: 13 }}>아직 없어요</span>}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>★ 담당 학생은 학생 정보에서 담당 코치를 바꿔요. 그냥 이름은 함께 배우는 학생(✕로 빼기).</span>
      {t.active && (
        <select value="" onChange={e => addStudent(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 14 }} aria-label="함께 배우는 학생 추가">
          <option value="">＋ 함께 배우는 학생 추가</option>
          {students.filter(s => !mine.some(x => x.s.id === s.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(s => <option key={s.id} value={s.id}>{s.name} ({s.class_name ?? '전공 미정'})</option>)}
        </select>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn sm ghost" onClick={setRole}>{t.role === 'admin' ? '코치로 바꾸기' : '관리자로 바꾸기'}</button>
        <button type="button" className="btn sm ghost" onClick={toggleActive}>{t.active ? '그만둠' : '다시 활성'}</button>
      </div>
    </Sheet>
  )
}

function StudentEditor({ s, teachers, links, onOpenCoach, onClose, reload }: {
  s: Student; teachers: Teacher[]; links: Link[]; onOpenCoach: (id: string) => void; onClose: () => void; reload: () => void
}) {
  const activeT = teachers.filter(t => t.active)
  const curExtra = links.filter(l => l.student_id === s.id && !l.is_primary && l.teacher_id !== s.teacher_id).map(l => l.teacher_id)
  const [name, setName] = useState(s.name)
  const [major, setMajor] = useState(s.class_name ?? '')
  const [campus, setCampus] = useState(s.campus ?? '')
  const [coach, setCoach] = useState(s.teacher_id ?? '')
  const [extra, setExtra] = useState<string[]>(curExtra)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dirty = name !== s.name || major !== (s.class_name ?? '') || campus !== (s.campus ?? '') || coach !== (s.teacher_id ?? '') || [...extra].sort().join() !== [...curExtra].sort().join()

  async function save() {
    if (!name.trim()) return setMsg('이름을 적어 주세요.')
    setBusy(true); setMsg('')
    const { error } = await supabase.from('students').update({ name: name.trim(), class_name: major || null, campus: campus || null, teacher_id: coach || null }).eq('id', s.id)
    if (error) { setBusy(false); return setMsg('저장하지 못했어요: ' + error.message) }
    // 함께 배우는 코치: 담당 코치는 빼고 맞춤
    const want = extra.filter(x => x !== coach)
    const del = curExtra.filter(x => !want.includes(x) && x !== coach)
    const add = want.filter(x => !curExtra.includes(x))
    if (del.length) await supabase.from('student_teachers').delete().eq('student_id', s.id).eq('is_primary', false).in('teacher_id', del)
    if (add.length) await supabase.from('student_teachers').upsert(add.map(tid => ({ student_id: s.id, teacher_id: tid, is_primary: false })), { onConflict: 'student_id,teacher_id', ignoreDuplicates: true })
    setBusy(false); setMsg('저장했어요 ✓'); reload()
  }
  async function toggleActive() {
    if (!confirm(s.active ? `${s.name} 학생을 '수강 끝남'으로 바꿀까요?\n학생 목록·숫자에서 빠지고 앱에 들어올 수 없어요. (다시 수강으로 되돌릴 수 있어요)` : `${s.name} 학생을 다시 수강 중으로 바꿀까요?`)) return
    const { error } = await supabase.from('students').update({ active: !s.active }).eq('id', s.id)
    if (error) return alert('바꾸지 못했어요: ' + error.message)
    reload(); onClose()
  }

  return (
    <Sheet title={`🎒 ${s.name}`} sub={`${s.linked_at ? '앱 가입(연결)됨' : '가입 대기'}${s.email ? ' · ' + s.email : ''}${s.active ? '' : ' · 수강 끝남'}`} onClose={onClose}>
      <label className="field"><span>이름</span><input value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="form-row" style={{ gap: 10 }}>
        <label className="field"><span>전공</span>
          <select value={major} onChange={e => setMajor(e.target.value)}>
            <option value="">미정</option>
            {BRAND.majors.map(m => <option key={m} value={m}>{m}</option>)}
            {major && !(BRAND.majors as readonly string[]).includes(major) && <option value={major}>{major}</option>}
          </select></label>
        <label className="field"><span>센터</span>
          <select value={campus} onChange={e => setCampus(e.target.value)}>
            <option value="">미정</option>
            {BRAND.campuses.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select></label>
      </div>
      <label className="field"><span>★ 담당 코치 (대표 한 명)</span>
        <select value={coach} onChange={e => { setCoach(e.target.value); setExtra(v => v.filter(x => x !== e.target.value)) }}>
          <option value="">담당 없음</option>
          {activeT.map(t => <option key={t.id} value={t.id}>{t.name}{(t.majors ?? []).length ? ` (${(t.majors ?? []).join('·')})` : ''}</option>)}
        </select></label>
      <Lbl>함께 배우는 코치 (여러 명 · 눌러서 켜고 끄기)</Lbl>
      {major && <span className="muted" style={{ fontSize: 12 }}>{major} 전공 코치가 앞에 와요</span>}
      <CoachMultiPick coaches={[...activeT].sort((a, b) => Number((b.majors ?? []).includes(major)) - Number((a.majors ?? []).includes(major)) || a.name.localeCompare(b.name, 'ko'))} value={extra} onChange={setExtra} exclude={coach || null} />
      {msg && <p className={msg.includes('✓') ? 'ok' : 'err'} style={{ margin: 0 }}>{msg}</p>}
      <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save}>{busy ? '저장 중…' : dirty ? '바꾼 내용 저장' : '바뀐 내용 없음'}</button>

      {(s.teacher_id || curExtra.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Lbl>코치 정보 보기</Lbl>
          {[s.teacher_id, ...curExtra].filter(Boolean).map(id => (
            <button key={id!} type="button" className="pill on" style={nameChip} onClick={() => onOpenCoach(id!)}>{id === s.teacher_id ? '★ ' : ''}{teachers.find(t => t.id === id)?.name ?? '?'} ›</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm ghost" onClick={toggleActive}>{s.active ? '수강 끝남으로' : '다시 수강 중으로'}</button>
      </div>
    </Sheet>
  )
}
