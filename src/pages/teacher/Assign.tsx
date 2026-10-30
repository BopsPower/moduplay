import { useEffect, useState } from 'react'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { supabase, type Assignment, type Score, type Student } from '../../lib/supabase'

type Row = Assignment & { student: Pick<Student, 'name' | 'class_name'>; score: Pick<Score, 'title'> }

export default function Assign() {
  const [students, setStudents] = useState<Student[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [scoreId, setScoreId] = useState('')
  const [note, setNote] = useState('')
  const [tempo, setTempo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    const [s, sc, a] = await Promise.all([
      supabase.from('students').select('*').eq('active', true).order('name'),
      supabase.from('scores').select('*').order('created_at', { ascending: false }),
      supabase.from('assignments').select('*, student:students(name, class_name), score:scores(title)').order('created_at', { ascending: false }),
    ])
    setStudents(s.data ?? []); setScores(sc.data ?? []); setRows((a.data ?? []) as Row[])
    if (!scoreId && sc.data?.[0]) setScoreId(sc.data[0].id)
  }
  useEffect(() => { load() }, [])

  function toggle(id: string) {
    const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n)
  }

  // 전공별 묶음 (전공 미지정은 맨 뒤 '전공 없음')
  const groups: [string, Student[]][] = (() => {
    const map = new Map<string, Student[]>()
    for (const s of students) { const k = s.class_name || '전공 없음'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s) }
    const order = [...BRAND.majors, '전공 없음'] as string[]
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  })()
  function toggleGroup(list: Student[]) {
    setPicked(p => { const n = new Set(p); const all = list.every(s => n.has(s.id)); list.forEach(s => all ? n.delete(s.id) : n.add(s.id)); return n })
  }

  async function give() {
    setErr(''); setMsg('')
    if (picked.size === 0) return setErr('학생을 한 명 이상 선택해 주세요.')
    if (!scoreId) return setErr('악보를 선택해 주세요.')
    setBusy(true)
    const payload = [...picked].map(student_id => ({
      student_id, score_id: scoreId, note: note.trim() || null,
      target_tempo: tempo ? Number(tempo) : null, is_current: true,
    }))
    const { error } = await supabase.from('assignments').upsert(payload, { onConflict: 'student_id,score_id' })
    setBusy(false)
    if (error) return setErr('저장하지 못했어요: ' + error.message)
    const title = scores.find(s => s.id === scoreId)?.title
    setMsg(`${picked.size}명에게 "${title}" 과제를 줬어요.`)
    setPicked(new Set()); setNote(''); setTempo('')
    load()
  }

  async function done(r: Row) {
    await supabase.from('assignments').update({ is_current: !r.is_current }).eq('id', r.id)
    load()
  }
  async function remove(r: Row) {
    await supabase.from('assignments').delete().eq('id', r.id)
    load()
  }

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치 화면</p>
        <h1 className="title">과제</h1>
      </div>

      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>과제 주기</p>
        <div>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>1. 학생 선택 (여러 명 가능)</p>
          {/* 전공별로 묶어서 보여주고, 전공 이름을 누르면 그 전공 전체 선택/해제 */}
          {groups.map(([major, list]) => (
            <div key={major} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
              <button className={'chip' + (list.every(s => picked.has(s.id)) ? ' on' : '')} style={{ fontWeight: 700, minWidth: 84 }} onClick={() => toggleGroup(list)} title="전공 전체 선택/해제">{major} 전체</button>
              <div className="chips" style={{ flex: 1 }}>
                {list.map(s => (
                  <button key={s.id} className={'chip' + (picked.has(s.id) ? ' on' : '')} onClick={() => toggle(s.id)}>{s.name}</button>
                ))}
              </div>
            </div>
          ))}
          {students.length === 0 && <span className="muted" style={{ fontSize: 14 }}>먼저 학생을 등록해 주세요.</span>}
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: '2 1 260px' }}><span>2. 악보</span>
            <select value={scoreId} onChange={e => setScoreId(e.target.value)}>
              {scores.map(s => <option key={s.id} value={s.id}>{s.title}{s.composer ? ` — ${s.composer}` : ''}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '0 1 130px' }}><span>목표 빠르기(BPM) <em className="opt">선택</em></span><input type="number" min={20} max={300} value={tempo} onChange={e => setTempo(e.target.value)} /></label>
        </div>
        <label className="field"><span>3. 메모 (학생에게 보여요)</span>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="예) 오른손 먼저 천천히, 3마디 왼손 화음 10번" />
        </label>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div><button className="btn primary" onClick={give} disabled={busy}>{busy ? '저장 중…' : '과제 주기'}</button></div>
      </div>

      {/* PC: 표 */}
      <div className="card hide-m" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>학생</th><th>악보</th><th>목표</th><th>메모</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ opacity: r.is_current ? 1 : .55 }}>
                <td style={{ fontWeight: 700 }}>{r.student?.name}</td>
                <td>{r.score?.title}</td>
                <td>{r.target_tempo ? `♩=${r.target_tempo}` : '-'}</td>
                <td className="muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note ?? ''}</td>
                <td>{r.is_current ? <span className="pill acc">진행 중</span> : <span className="pill">완료</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn sm ghost" onClick={() => done(r)}>{r.is_current ? '완료 처리' : '다시 진행'}</button>{' '}
                  <button className="btn sm ghost" onClick={() => remove(r)}>삭제</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>아직 준 과제가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 모바일: 한 과제 = 한 카드 (옆으로 밀지 않아도 상태·버튼까지 다 보임) */}
      <div className="asg-cards">
        {rows.map(r => (
          <div key={r.id} className="card asg-card" style={{ opacity: r.is_current ? 1 : .6 }}>
            <div className="top">
              <b>{r.student?.name}</b>
              {r.is_current ? <span className="pill acc">진행 중</span> : <span className="pill">완료</span>}
            </div>
            <div className="ttl">{r.score?.title}{r.target_tempo ? <span className="muted"> · ♩={r.target_tempo}</span> : null}</div>
            {r.note && <div className="memo muted">{r.note}</div>}
            <div className="act">
              <button className="btn sm" onClick={() => done(r)}>{r.is_current ? '완료 처리' : '다시 진행'}</button>
              <button className="btn sm ghost" onClick={() => { if (confirm(`${r.student?.name} 학생의 "${r.score?.title}" 과제를 삭제할까요?`)) remove(r) }}>삭제</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>아직 준 과제가 없어요.</p>}
      </div>
    </Shell>
  )
}
