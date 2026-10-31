import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import StudentPicker from '../components/StudentPicker'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { supabase, type Score, type Student, type Visibility } from '../lib/supabase'
import { MATERIAL_EXT, uploadScore } from '../lib/uploadScore'
import { kindOf, marksToText, parseMarks, parseTags, ytId } from '../lib/materials'

const MB = 1024 * 1024
const LIMIT = 50 * MB

// 자료 올리기 (파일 또는 유튜브 링크) · ?edit=<id> 이면 정보 고치기 · ?req=<id> 이면 자료 요청에 답하기
export default function Upload() {
  const { session, isTeacher, isAdmin, student } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const editId = sp.get('edit')
  const reqId = sp.get('req')
  const [mode, setMode] = useState<'file' | 'yt'>(sp.get('mode') === 'yt' ? 'yt' : 'file')
  const [file, setFile] = useState<File | null>(null)
  const [yt, setYt] = useState(sp.get('yt') ?? '')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<string>(sp.get('mode') === 'yt' ? '시범 영상' : '카피 악보')
  const [areas, setAreas] = useState<string[]>([])
  const [major, setMajor] = useState<string>(student?.class_name && (BRAND.majors as readonly string[]).includes(student.class_name) ? student.class_name : '')
  const [level, setLevel] = useState<string>('')
  const [artist, setArtist] = useState('')
  const [song, setSong] = useState('')
  const [tags, setTags] = useState('')
  const [desc, setDesc] = useState('')
  const [memo, setMemo] = useState('')
  const [marks, setMarks] = useState('')
  const [vis, setVis] = useState<Visibility>('students')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [students, setStudents] = useState<Student[]>([])
  const [viewOnly, setViewOnly] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Score | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 정보 고치기: 기존 값 채우기
  useEffect(() => {
    if (!editId) return
    supabase.from('scores').select('*').eq('id', editId).single().then(async ({ data }) => {
      if (!data) return setErr('자료를 찾지 못했어요.')
      const s = data as Score
      setEditing(s); setTitle(s.title); setKind(kindOf(s)); setAreas(s.areas ?? []); setMajor(s.major ?? ''); setLevel(s.level ?? '')
      setArtist(s.artist ?? s.composer ?? ''); setSong(s.song ?? ''); setTags((s.tags ?? []).join(', ')); setDesc(s.description ?? '')
      setMemo(s.coach_memo ?? ''); setMarks(marksToText(s.yt_marks)); setYt(s.youtube_url ?? ''); setViewOnly(!!s.view_only)
      setVis(s.visibility === 'public' ? 'students' : s.visibility); setAgree(true)
      if (s.visibility === 'selected') {
        const { data: sh } = await supabase.from('score_shares').select('student_id').eq('score_id', s.id)
        setPicked(new Set((sh ?? []).map(r => r.student_id as string)))
      }
    })
  }, [editId])

  useEffect(() => {
    if (!isTeacher) return
    supabase.from('students').select('*').eq('active', true).order('name').then(({ data }) => setStudents((data ?? []) as Student[]))
  }, [isTeacher])

  // 유튜브 주소를 넣으면 제목 채우기 (실패해도 직접 쓰면 됨)
  async function fillFromYt(url: string) {
    if (!ytId(url) || title.trim()) return
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
      if (r.ok) { const j = await r.json(); if (j?.title && !title.trim()) setTitle(String(j.title).slice(0, 120)) }
    } catch { /* 제목은 직접 입력 */ }
  }

  // 연습 플레이어에서 "자료실에 공유하기"로 넘어온 경우 제목 채우기
  useEffect(() => { const u = sp.get('yt'); if (u && !editId) fillFromYt(u) }, [])

  function pickFile(f: File | null) {
    setErr('')
    if (!f) return setFile(null)
    if (!MATERIAL_EXT.test(f.name)) return setErr('올릴 수 있는 파일: PDF · MuseScore · MusicXML · MIDI · Guitar Pro · 음원(mp3·m4a·wav)')
    if (f.size > LIMIT) return setErr(`${Math.round(f.size / MB)}MB예요. 50MB까지 올릴 수 있어요.`)
    setFile(f)
    // 음원 파일이면 형태를 반주·MR로 (가이드 녹음이면 직접 바꾸면 됨)
    if (/\.(mp3|m4a|wav|aac)$/i.test(f.name) && !['반주·MR', '가이드 녹음'].includes(kind)) setKind('반주·MR')
    if (!title.trim()) setTitle(f.name.replace(MATERIAL_EXT, '').replace(/[_]+/g, ' ').trim())
  }

  const isOwner = !!editing && (editing.created_by === session?.user.id || isAdmin)
  const ytOk = !yt.trim() || !!ytId(yt)
  const canSave = !busy && title.trim() && ytOk && (editId ? isOwner : agree && (mode === 'file' ? !!file : !!ytId(yt)))
    && (vis !== 'selected' || picked.size > 0)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true); setErr('')
    const meta = {
      kind, areas, level: level || null, artist: artist.trim() || null, song: song.trim() || null, tags: parseTags(tags),
      view_only: viewOnly, youtube_url: yt.trim() || null, yt_marks: parseMarks(marks),
    }
    try {
      let id = editId
      if (editId && editing) {
        const { error } = await supabase.from('scores').update({
          title: title.trim(), major: major || null, description: desc.trim() || null, composer: artist.trim() || null,
          ...meta, ...(isTeacher ? { coach_memo: memo.trim() || null, visibility: vis } : {}),
        }).eq('id', editId)
        if (error) throw new Error('저장하지 못했어요: ' + error.message)
      } else {
        const r = await uploadScore({
          file: mode === 'file' ? file : null, title, composer: artist, category: kind === '교재' ? '교재' : '연습곡',
          major, visibility: isTeacher ? vis : 'students', description: desc, createdBy: session?.user.id,
          kind, areas, level, artist, song, tags: meta.tags, viewOnly, youtubeUrl: meta.youtube_url, ytMarks: meta.yt_marks,
          coachMemo: isTeacher ? memo : null,
        })
        id = r.id
      }
      // 고른 학생만: 공유 목록 맞추기
      if (isTeacher && id) {
        await supabase.from('score_shares').delete().eq('score_id', id)
        if (vis === 'selected' && picked.size) await supabase.from('score_shares').insert([...picked].map(sid => ({ score_id: id, student_id: sid })))
      }
      if (reqId && id && !editId) await supabase.from('material_requests').update({ done: true, done_score_id: id }).eq('id', reqId)
      nav(`/score/${id}`, { replace: true })
    } catch (x) {
      setErr((x as Error).message); setBusy(false)
    }
  }

  const kinds = BRAND.kinds.filter(k => k !== '교재' || isTeacher)

  if (editId && editing && !isOwner) return <Shell><p className="muted">올린 사람만 고칠 수 있어요.</p></Shell>

  return (
    <Shell>
      <Link to={editId ? `/score/${editId}` : '/board'} className="muted" style={{ fontSize: 14 }}>← {editId ? '자료로 돌아가기' : '자료실'}</Link>
      <h1 className="title">{editId ? '자료 정보 고치기' : '자료 올리기'}</h1>

      <form className="card upl" onSubmit={save}>
        {!editId && (
          <>
            <div className="seg" role="tablist" aria-label="올리는 방법">
              <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'on' : ''} onClick={() => { setMode('file'); if (kind === '시범 영상') setKind('카피 악보') }}>파일 올리기</button>
              <button type="button" role="tab" aria-selected={mode === 'yt'} className={mode === 'yt' ? 'on' : ''} onClick={() => { setMode('yt'); setKind('시범 영상') }}>▶ 유튜브 영상만</button>
            </div>
            {mode === 'file' && (
              <>
                <button type="button" className="drop" onClick={() => fileRef.current?.click()}>
                  <b>{file ? file.name : '파일 고르기'}</b>
                  <span>{file ? `${(file.size / MB).toFixed(1)}MB · 다른 파일로 바꾸려면 누르세요` : 'PDF · MuseScore · MusicXML · MIDI · Guitar Pro · 직접 녹음한 반주·시범(mp3·m4a·wav)'}</span>
                </button>
                <input ref={fileRef} type="file" hidden accept=".pdf,.mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.mp3,.m4a,.wav,.aac,audio/*" onChange={e => pickFile(e.target.files?.[0] ?? null)} />
              </>
            )}
          </>
        )}

        <label className="field">
          <span className="l">{mode === 'yt' && !editId ? '유튜브 영상 주소' : '함께 볼 유튜브 영상'} {!(mode === 'yt' && !editId) && <span className="muted">(선택 · 원곡이나 시범 영상)</span>}</span>
          <input type="url" value={yt} onChange={e => setYt(e.target.value)} onBlur={() => fillFromYt(yt)} placeholder="https://youtu.be/…" />
          {!ytOk && <span className="err">유튜브 주소가 아닌 것 같아요. 영상 페이지 주소를 그대로 붙여 넣어 주세요.</span>}
        </label>

        {(yt.trim() && ytOk) && (
          <label className="field">
            <span className="l">구간 표시 <span className="muted">(선택 · 한 줄에 하나씩)</span></span>
            <textarea rows={3} value={marks} onChange={e => setMarks(e.target.value)} placeholder={'0:42 기타 솔로 시작 (악보 1쪽)\n1:58 옥타브 솔로'} />
          </label>
        )}

        <label className="field">
          <span className="l">제목</span>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="예: Gravity 솔로 카피" required />
        </label>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="l" style={{ marginBottom: 6 }}>종류</legend>
          <div className="chips">
            {kinds.map(k => <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} onClick={() => { setKind(k); if (k === '교재') setViewOnly(true) }}>{k}</button>)}
          </div>
          {BRAND.kindHelp[kind] && <span className="muted" style={{ fontSize: 13 }}>{BRAND.kindHelp[kind]}</span>}
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="l" style={{ marginBottom: 6 }}>무엇을 연습하는 자료인가요? <span className="muted" style={{ fontWeight: 400 }}>(여러 개 골라도 돼요)</span></legend>
          <div className="chips">
            {BRAND.areas.map(a => {
              const on = areas.includes(a)
              return <button key={a} type="button" aria-pressed={on} title={BRAND.areaHelp[a]} className={'chip' + (on ? ' pick' : '')} onClick={() => setAreas(v => on ? v.filter(x => x !== a) : [...v, a])}>{on ? '✓ ' : ''}{a}</button>
            })}
          </div>
          <span className="muted" style={{ fontSize: 12 }}>{BRAND.areas.map(a => `${a}: ${BRAND.areaHelp[a]}`).join(' · ')}</span>
        </fieldset>

        <div className="two">
          <label className="field">
            <span className="l">전공</span>
            <select value={major} onChange={e => setMajor(e.target.value)}>
              <option value="">공통</option>
              {BRAND.majors.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="l">단계</span>
            <select value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">고르지 않음</option>
              {BRAND.levels.map(l => <option key={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="two">
          <label className="field">
            <span className="l">원곡 뮤지션 <span className="muted">(카피일 때)</span></span>
            <input value={artist} onChange={e => setArtist(e.target.value)} maxLength={80} placeholder="예: John Mayer" />
          </label>
          <label className="field">
            <span className="l">원곡 제목</span>
            <input value={song} onChange={e => setSong(e.target.value)} maxLength={80} placeholder="예: Gravity" />
          </label>
        </div>

        <label className="field">
          <span className="l">태그 <span className="muted">(쉼표로 구분)</span></span>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="예: 블루스, 벤딩, 입시 대비" />
        </label>

        <label className="field">
          <span className="l">설명 <span className="muted">(선택)</span></span>
          <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} maxLength={500} placeholder="어떤 부분을 연습하면 좋은지 적어 주세요" />
        </label>

        {isTeacher && (
          <label className="field">
            <span className="l">코치 메모 <span className="muted">(자료 화면에 강조해서 보여요)</span></span>
            <textarea rows={2} value={memo} onChange={e => setMemo(e.target.value)} maxLength={500} placeholder="예: 9마디부터 템포 120에서 시작해 원곡 템포까지 올려 보세요." />
          </label>
        )}

        {isTeacher ? (
          <fieldset className="scope">
            <legend>누구에게 보일까요</legend>
            {([['students', '학원 전체'], ['mine', '내 학생만'], ['selected', '고른 학생만'], ['coaches', '코치끼리만']] as const).map(([v, l]) => (
              <label key={v}><input type="radio" name="scope" checked={vis === v} onChange={() => setVis(v)} /> {l}</label>
            ))}
            {vis === 'selected' && <StudentPicker students={students} picked={picked} onChange={setPicked} />}
          </fieldset>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>학생이 올린 자료는 학원 전체에 바로 보여요. <b>학생 자료</b> 표시가 붙어요.</p>
        )}

        {!(mode === 'yt' && !editId) && !(editing && !editing.file_path) && (
          <label className="check">
            <input type="checkbox" checked={viewOnly} onChange={e => setViewOnly(e.target.checked)} />
            <span><b>보기 전용으로 올리기</b><br /><span className="muted">다운로드·프린트를 막아요. 체크하지 않으면 누구나 받을 수 있어요.</span></span>
          </label>
        )}

        {!editId && (
          <label className="check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span className="muted">학원 안에서 공부용으로만 나누는 자료예요. 카피 악보를 학원 밖으로 퍼뜨리지 않을게요.</span>
          </label>
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn primary wide" disabled={!canSave}>{busy ? (file ? '올리는 중… (창을 닫지 마세요)' : '저장하는 중…') : editId ? '저장하기' : (isTeacher && vis !== 'students') ? '올리기' : '올리기 · 바로 공개돼요'}</button>
        {!editId && isTeacher && <Link to="/teacher/bulk" className="muted hide-m" style={{ fontSize: 13, textAlign: 'center' }}>PC에서 여러 개를 한꺼번에 올리려면 → 여러 개 올리기</Link>}
      </form>
    </Shell>
  )
}
