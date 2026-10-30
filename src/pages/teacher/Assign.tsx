import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import Shell from '../../components/Shell'
import StudentPicker from '../../components/StudentPicker'
import { BRAND } from '../../lib/brand'
import { useAuth } from '../../lib/auth'
import { matches } from '../../lib/search'
import { supabase, type Assignment, type Score, type Student } from '../../lib/supabase'
import { SCORE_EXT, uploadScore } from '../../lib/uploadScore'

type Row = Assignment & { student: Pick<Student, 'name' | 'class_name' | 'teacher_id'>; score: Pick<Score, 'title'> }
const CATS = BRAND.categories

// 과제·악보: 악보를 올리거나 고른 뒤 → 자료실에 올릴지 / 내 학생에게 과제로 줄지 고름
export default function Assign() {
  const { teacherId, session } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [rows, setRows] = useState<Row[]>([])

  // 1. 악보
  const [mode, setMode] = useState<'new' | 'pick'>('new')
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [major, setMajor] = useState('')
  const [cat, setCat] = useState<string>(CATS[0])
  const [baseTempo, setBaseTempo] = useState('')
  const [scoreQ, setScoreQ] = useState('')
  const [scoreId, setScoreId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 2. 어디에
  const [toLibrary, setToLibrary] = useState(true)
  const [desc, setDesc] = useState('')
  const [toStudents, setToStudents] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [tempo, setTempo] = useState('')
  const [note, setNote] = useState('')

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [rowQ, setRowQ] = useState('')

  async function load() {
    const [s, sc, a] = await Promise.all([
      supabase.from('students').select('*').eq('active', true).order('name'),
      supabase.from('scores').select('*').order('created_at', { ascending: false }),
      supabase.from('assignments').select('*, student:students(name, class_name, teacher_id), score:scores(title)').order('created_at', { ascending: false }),
    ])
    setStudents(((s.data ?? []) as Student[]).filter(x => !x.staff_preview && x.user_id !== session?.user.id))
    setScores(sc.data ?? []); setRows((a.data ?? []) as Row[])
  }
  useEffect(() => { load() }, [])

  // 내가 줄 수 있는 학생: 내 담당만 (관리자는 '모든 학생' 켜면 전체)
  const mine = useMemo(() => students.filter(s => s.teacher_id === teacherId), [students, teacherId])
  const mineIds = useMemo(() => new Set(mine.map(s => s.id)), [mine])

  function pickFile(f: File | undefined) {
    if (!f) return
    if (!SCORE_EXT.test(f.name)) return setErr('MuseScore(.mscz), MusicXML(.musicxml/.mxl), MIDI(.mid), Guitar Pro(.gp), PDF 파일만 올릴 수 있어요.')
    setErr(''); setFile(f); setTitle(f.name.replace(SCORE_EXT, ''))
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files[0]) }

  const giving = mode === 'pick' || toStudents
  const n = picked.size
  const label = busy ? '저장 중…'
    : mode === 'pick' ? `${n || ''}${n ? '명에게 ' : ''}과제 주기`
    : toLibrary && giving ? `올리고 ${n ? n + '명에게 ' : ''}과제 주기`
    : toLibrary ? '악보 자료실에 올리기'
    : `올리고 ${n ? n + '명에게 ' : ''}과제 주기`

  async function submit() {
    setErr(''); setMsg('')
    if (mode === 'new') {
      if (!file) return setErr('악보 파일을 먼저 선택해 주세요.')
      if (!title.trim()) return setErr('제목을 입력해 주세요.')
      if (!toLibrary && !toStudents) return setErr('"악보 자료실에 올리기"나 "학생에게 과제로 주기" 중 하나는 골라 주세요.')
    } else if (!scoreId) return setErr('과제로 줄 악보를 골라 주세요.')
    if (giving && n === 0) return setErr('과제를 줄 학생을 한 명 이상 골라 주세요.')

    setBusy(true)
    try {
      let sid = scoreId, done = ''
      if (mode === 'new') {
        const r = await uploadScore({
          file: file!, title, composer, category: cat, major, tempo: baseTempo ? Number(baseTempo) : null,
          visibility: toLibrary ? 'students' : 'assigned', description: toLibrary ? desc : '', createdBy: session?.user.id,
        })
        sid = r.id
        done = `"${title.trim()}"을(를) ${toLibrary ? '악보 자료실에 ' : ''}올렸어요${r.isPdf ? '' : ' (1~3분 뒤 준비 완료)'}`
      }
      if (giving) {
        const payload = [...picked].filter(id => mineIds.has(id)).map(student_id => ({
          student_id, score_id: sid, note: note.trim() || null, target_tempo: tempo ? Number(tempo) : null, is_current: true,
        }))
        const { error } = await supabase.from('assignments').upsert(payload, { onConflict: 'student_id,score_id' })
        if (error) throw new Error('과제를 저장하지 못했어요: ' + error.message)
        const t = mode === 'new' ? title.trim() : scores.find(s => s.id === sid)?.title
        done = (done ? done + ' · ' : '') + `${payload.length}명에게 "${t}" 과제를 줬어요.`
      }
      setMsg(done)
      setFile(null); setTitle(''); setComposer(''); setBaseTempo(''); setDesc(''); setPicked(new Set()); setTempo(''); setNote(''); setScoreId('')
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function toggleDone(r: Row) { await supabase.from('assignments').update({ is_current: !r.is_current }).eq('id', r.id); load() }
  async function removeRow(r: Row) {
    if (!confirm(`${r.student?.name} 학생의 "${r.score?.title}" 과제를 삭제할까요?`)) return
    await supabase.from('assignments').delete().eq('id', r.id); load()
  }
  async function removeScore(s: Score) {
    if (!confirm(`"${s.title}" 악보를 삭제할까요? 이 악보로 준 과제도 모두 사라져요.`)) return
    await supabase.storage.from('scores').remove([s.file_path])
    await supabase.from('scores').delete().eq('id', s.id); load()
  }

  const shownRows = rows.filter(r => r.student?.teacher_id === teacherId && matches(rowQ, r.student?.name, r.score?.title))
  const myScores = scores.filter(s => s.created_by === session?.user.id) // 코치 화면에선 관리자도 내 것만 (전체 관리는 관리자 화면)
  const pickList = scores.filter(s => s.convert_status !== 'failed' && matches(scoreQ, s.title, s.composer, s.major, s.category))

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치 화면</p>
        <h1 className="title">과제·악보</h1>
      </div>

      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 1. 악보 */}
        <section className="step">
          <p className="step-t">1. 악보</p>
          <div className="seg" role="tablist">
            <button type="button" className={'btn' + (mode === 'new' ? ' primary' : '')} onClick={() => setMode('new')}>새 악보 올리기</button>
            <button type="button" className={'btn' + (mode === 'pick' ? ' primary' : '')} onClick={() => setMode('pick')}>올라온 악보에서 고르기</button>
          </div>
          {mode === 'new' ? (
            <>
              <div className={'drop' + (over ? ' over' : '')} style={{ border: '2px dashed #cbd5e1', padding: 18, textAlign: 'center', cursor: 'pointer', fontSize: 14, color: 'var(--muted)', background: over ? 'var(--accent-soft)' : undefined }}
                onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
                onClick={() => inputRef.current?.click()} role="button" tabIndex={0}>
                {file ? <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{file.name}</span> : <>악보 파일을 끌어다 놓거나 <u>눌러서 선택</u><br /><span style={{ fontSize: 12 }}>MuseScore · MusicXML · MIDI · Guitar Pro · PDF(보기 전용)</span></>}
                <input ref={inputRef} type="file" accept=".mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.pdf" style={{ display: 'none' }} onChange={e => pickFile(e.target.files?.[0])} />
              </div>
              <div className="form-row">
                <label className="field" style={{ flex: '2 1 220px' }}><span>제목 <em className="req">필수</em></span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
                <label className="field" style={{ flex: '1 1 160px' }}><span>작곡가 <em className="opt">선택</em></span><input value={composer} onChange={e => setComposer(e.target.value)} /></label>
              </div>
              <div className="form-row">
                <label className="field"><span>전공</span>
                  <select value={major} onChange={e => setMajor(e.target.value)}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
                </label>
                <label className="field"><span>분류</span>
                  <select value={cat} onChange={e => setCat(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
                </label>
                <label className="field" style={{ flex: '0 1 150px' }}><span>기본 빠르기(BPM) <em className="opt">선택</em></span><input type="number" min={20} max={300} value={baseTempo} onChange={e => setBaseTempo(e.target.value)} placeholder="비우면 100" /></label>
              </div>
            </>
          ) : (
            <>
              <input type="search" value={scoreQ} onChange={e => setScoreQ(e.target.value)} placeholder="곡 이름·작곡가 검색 (초성도 돼요)" aria-label="악보 검색" />
              <ul className="rows pick-scores">
                {pickList.map(s => (
                  <li key={s.id}>
                    <label>
                      <input type="radio" name="score" checked={scoreId === s.id} onChange={() => setScoreId(s.id)} />
                      <b>{s.title}</b><span className="muted">{[s.composer, s.major ?? '공통', s.visibility === 'assigned' ? '과제용' : '자료실'].filter(Boolean).join(' · ')}</span>
                    </label>
                  </li>
                ))}
                {pickList.length === 0 && <li className="muted" style={{ padding: 12 }}>찾는 악보가 없어요.</li>}
              </ul>
            </>
          )}
        </section>

        {/* 2. 어디에 */}
        <section className="step">
          <p className="step-t">2. 어디에 줄까요?</p>
          {mode === 'new' && (
            <label className="opt-row">
              <input type="checkbox" checked={toLibrary} onChange={e => setToLibrary(e.target.checked)} />
              <span><b>악보 자료실에 올리기</b><br /><span className="muted">학원생 모두가 자료실에서 볼 수 있어요. 끄면 과제 받은 학생만 봐요.</span></span>
            </label>
          )}
          {mode === 'new' && toLibrary && (
            <label className="field"><span>한 줄 소개 <em className="opt">선택 · 자료실에 보여요</em></span><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="예) 왼손 화음 연습용" /></label>
          )}
          {mode === 'new' && (
            <label className="opt-row">
              <input type="checkbox" checked={toStudents} onChange={e => setToStudents(e.target.checked)} />
              <span><b>내 학생에게 과제로 주기</b><br /><span className="muted">고른 학생의 [내 과제]에 바로 올라가요.</span></span>
            </label>
          )}
          {giving && (
            <>
              <StudentPicker students={mine} picked={picked} onChange={setPicked} />
              <div className="form-row">
                <label className="field" style={{ flex: '0 1 150px' }}><span>목표 빠르기(BPM) <em className="opt">선택</em></span><input type="number" min={20} max={300} value={tempo} onChange={e => setTempo(e.target.value)} /></label>
                <label className="field" style={{ flex: '3 1 260px' }}><span>메모 <em className="opt">선택 · 학생에게 보여요</em></span><input value={note} onChange={e => setNote(e.target.value)} placeholder="예) 오른손 먼저 천천히, 3마디 왼손 화음 10번" /></label>
              </div>
            </>
          )}
        </section>

        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <div><button className="btn primary" onClick={submit} disabled={busy}>{label}</button></div>
      </div>

      {/* 준 과제 */}
      <div className="chips" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>준 과제 <span className="muted" style={{ fontWeight: 400 }}>{shownRows.length}</span></p>
        <input type="search" value={rowQ} onChange={e => setRowQ(e.target.value)} placeholder="학생·곡 이름 검색" aria-label="과제 검색" style={{ padding: '8px 12px', border: '1px solid #d1d5db', width: 200 }} />
      </div>
      <div className="card hide-m" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>학생</th><th>악보</th><th>목표</th><th>메모</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {shownRows.map(r => (
              <tr key={r.id} style={{ opacity: r.is_current ? 1 : .55 }}>
                <td style={{ fontWeight: 700 }}>{r.student?.name}</td>
                <td>{r.score?.title}</td>
                <td>{r.target_tempo ? `♩=${r.target_tempo}` : '-'}</td>
                <td className="muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note ?? ''}</td>
                <td>{r.is_current ? <span className="pill acc">진행 중</span> : <span className="pill">완료</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  <button className="btn sm ghost" onClick={() => toggleDone(r)}>{r.is_current ? '완료 처리' : '다시 진행'}</button>{' '}
                  <button className="btn sm ghost" onClick={() => removeRow(r)}>삭제</button>
                </td>
              </tr>
            ))}
            {shownRows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>아직 준 과제가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="asg-cards">
        {shownRows.map(r => (
          <div key={r.id} className="card asg-card" style={{ opacity: r.is_current ? 1 : .6 }}>
            <div className="top">
              <b>{r.student?.name}</b>
              {r.is_current ? <span className="pill acc">진행 중</span> : <span className="pill">완료</span>}
            </div>
            <div className="ttl">{r.score?.title}{r.target_tempo ? <span className="muted"> · ♩={r.target_tempo}</span> : null}</div>
            {r.note && <div className="memo muted">{r.note}</div>}
            <div className="act">
              <button className="btn sm" onClick={() => toggleDone(r)}>{r.is_current ? '완료 처리' : '다시 진행'}</button>
              <button className="btn sm ghost" onClick={() => removeRow(r)}>삭제</button>
            </div>
          </div>
        ))}
        {shownRows.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>아직 준 과제가 없어요.</p>}
      </div>

      {/* 내가 올린 악보 */}
      <details className="card" style={{ padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>내가 올린 악보 <span className="muted" style={{ fontWeight: 400 }}>{myScores.length}</span></summary>
        <ul className="rows" style={{ marginTop: 10, maxHeight: 'none' }}>
          {myScores.map(s => (
            <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, padding: '8px 4px' }}>
                <b>{s.title}</b>{' '}
                <span className="muted" style={{ fontSize: 12 }}>
                  {[s.composer, s.major ?? '공통', s.visibility === 'assigned' ? '과제용' : s.visibility === 'public' ? '외부 공개' : '자료실',
                    s.convert_status === 'done' ? '' : s.convert_status === 'failed' ? '준비 실패' : '준비 중'].filter(Boolean).join(' · ')}
                </span>
              </div>
              <button className="btn sm ghost" onClick={() => removeScore(s)}>삭제</button>
            </li>
          ))}
          {myScores.length === 0 && <li className="muted" style={{ padding: 12 }}>아직 올린 악보가 없어요.</li>}
        </ul>
      </details>
    </Shell>
  )
}
