import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import StudentPicker from '../components/StudentPicker'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { supabase, type Score, type Student, type Visibility } from '../lib/supabase'
import { MATERIAL_EXT, uploadScore } from '../lib/uploadScore'
import { fixDrumMidi, fixSummary, hasDrumCh, isMidiName, looksRoland, scanMidi } from '../lib/drumMidi'
import { checkBadges } from '../lib/badges'
import { usePractice } from '../lib/practice'
import { kindOf, marksToText, parseMarks, parseTags, ytId } from '../lib/materials'
import { fetchAll } from '../lib/fetchAll'
import { fmtMB, readZipList, ZIP_EXT, ZIP_LIMIT, zipShortName, type ZipInfo } from '../lib/zipBundle'

const MB = 1024 * 1024
const LIMIT = 50 * MB
const ZIP_KIND = '음원 묶음'

// 음원 묶음 → 짝 교재(PDF) 고르기 (교재 이름으로 찾기)
function BookPick({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [books, setBooks] = useState<{ id: string; title: string }[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    fetchAll<{ id: string; title: string }>(() => supabase.from('scores').select('id,title').eq('kind', '교재').order('title').order('id'))
      .then(({ data }) => setBooks(data))
  }, [])
  const key = q.trim().toLowerCase()
  const list = (books ?? []).filter(b => !key || b.title.toLowerCase().includes(key))
  const cur = books?.find(b => b.id === value)
  return (
    <div className="field">
      <span className="l">📕 짝 교재 (PDF) <span className="muted">(선택 · 고르면 교재 화면에 ‘이 교재의 음원’으로 보여요)</span></span>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={books ? `교재 ${books.length}권 중에서 이름으로 찾기` : '교재 목록을 불러오는 중…'} />
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">연결 안 함</option>
        {cur && !list.includes(cur) && <option value={cur.id}>{cur.title}</option>}
        {list.slice(0, 300).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>
      {books && !books.length && <span className="muted" style={{ fontSize: 13 }}>아직 올라온 PDF 교재가 없어요. 교재를 먼저 올리면 고를 수 있어요.</span>}
      {cur && <span className="muted" style={{ fontSize: 13 }}>연결됨: <b>{cur.title}</b></span>}
    </div>
  )
}

// 자료 올리기 (파일 또는 유튜브 링크) · ?edit=<id> 이면 정보 고치기 · ?req=<id> 이면 자료 요청에 답하기
export default function Upload() {
  const practice = usePractice()
  const { session, isTeacher, isAdmin, student } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const editId = sp.get('edit')
  const reqId = sp.get('req')
  const [mode, setMode] = useState<'file' | 'yt'>(sp.get('mode') === 'yt' ? 'yt' : 'file')
  const [file, setFile] = useState<File | null>(null)
  const [yt, setYt] = useState(sp.get('yt') ?? '')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<string>(sp.get('mode') === 'yt' ? '시범 영상' : (BRAND.kinds as readonly string[]).includes(sp.get('kind') ?? '') ? sp.get('kind')! : '카피 악보')
  const fromAdmin = sp.get('back') === 'admin'
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
  const [agree, setAgree] = useState(false)
  const [viewOnly, setViewOnly] = useState(false) // 코치가 고르는 보기 전용 (PDF 교재는 자동)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<Score | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // MIDI 파일: 전자드럼 음 번호 맞추기 (롤랜드 번호가 보이면 처음부터 체크)
  const [drum, setDrum] = useState<{ roland: boolean; drumCh: boolean; summary: string; aux: number; odd: string } | null>(null)
  const [edrum, setEdrum] = useState(false)
  const pickNo = useRef(0)
  // 음원 묶음(ZIP)
  const [zip, setZip] = useState<ZipInfo | null>(null)
  const [linked, setLinked] = useState(sp.get('book') ?? '')
  const [progress, setProgress] = useState<number | null>(null)
  const isZipFile = !!file && ZIP_EXT.test(file.name)

  // 정보 고치기: 기존 값 채우기
  useEffect(() => {
    if (!editId) return
    supabase.from('scores').select('*').eq('id', editId).single().then(async ({ data }) => {
      if (!data) return setErr('자료를 찾지 못했어요.')
      const s = data as Score
      setEditing(s); setTitle(s.title); setKind(kindOf(s)); setAreas(s.areas ?? []); setMajor(s.major ?? ''); setLevel(s.level ?? '')
      setArtist(s.artist ?? s.composer ?? ''); setSong(s.song ?? ''); setTags((s.tags ?? []).join(', ')); setDesc(s.description ?? '')
      setMemo(s.coach_memo ?? ''); setViewOnly(!!s.view_only && !(kindOf(s) === '교재' && /\.pdf$/i.test(s.file_path ?? ''))); setMarks(marksToText(s.yt_marks)); setYt(s.youtube_url ?? '')
      setVis(s.visibility === 'public' ? 'students' : s.visibility); setAgree(true); setLinked(s.linked_score_id ?? '')
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
    const no = ++pickNo.current
    setZip(null)
    // 음원 묶음 ZIP: 코치만 · 300MB까지 · 안에 음원이 있어야 함
    if (ZIP_EXT.test(f.name)) {
      if (!isTeacher) return setErr('ZIP(음원 묶음)은 코치님만 올릴 수 있어요.')
      if (f.size > ZIP_LIMIT) return setErr(`${Math.round(f.size / MB)}MB예요. 음원 묶음 ZIP은 300MB까지 올릴 수 있어요.`)
      setFile(null); setDrum(null); setEdrum(false)
      readZipList(f).then(info => {
        if (no !== pickNo.current) return
        if (!info) return setErr('ZIP 파일을 읽지 못했어요. 다시 압축해서 올려 주세요.')
        if (!info.audio) return setErr('ZIP 안에 음원(mp3·m4a·wav 등)이 없어요. 음원 묶음에는 음원 파일이 들어 있어야 해요.')
        setFile(f); setZip(info); setKind(ZIP_KIND)
        if (!title.trim()) setTitle(f.name.replace(ZIP_EXT, '').replace(/[_]+/g, ' ').trim())
      })
      return
    }
    if (!MATERIAL_EXT.test(f.name)) return setErr('올릴 수 있는 파일: PDF · MuseScore · MusicXML · MIDI · Guitar Pro · 음원(mp3·m4a·wav)' + (isTeacher ? ' · 음원 묶음 ZIP' : ''))
    if (f.size > LIMIT) return setErr(`${Math.round(f.size / MB)}MB예요. 50MB까지 올릴 수 있어요.`)
    setFile(f)
    if (kind === ZIP_KIND) setKind(/\.(mp3|m4a|wav|aac)$/i.test(f.name) ? '반주·MR' : '카피 악보')
    setDrum(null); setEdrum(false)
    if (isMidiName(f.name)) {
      f.arrayBuffer().then(buf => {
        if (no !== pickNo.current) return
        const sc = scanMidi(buf), fx = fixDrumMidi(buf), roland = looksRoland(sc)
        setDrum({ roland, drumCh: hasDrumCh(sc), summary: fixSummary(fx), aux: fx.aux, odd: fx.odd.map(o => `${o.note}번 ${o.count}개`).join(', ') })
        setEdrum(roland)
      }).catch(() => { /* 못 읽으면 그대로 올림 */ })
    }
    // 음원 파일이면 형태를 반주·MR로 (가이드 녹음이면 직접 바꾸면 됨)
    if (/\.(mp3|m4a|wav|aac)$/i.test(f.name) && !['반주·MR', '가이드 녹음'].includes(kind)) setKind('반주·MR')
    if (!title.trim()) setTitle(f.name.replace(MATERIAL_EXT, '').replace(/[_]+/g, ' ').trim())
  }

  const isOwner = !!editing && (editing.created_by === session?.user.id || isAdmin)
  const ytOk = !yt.trim() || !!ytId(yt)
  const canSave = !busy && title.trim() && ytOk && (editId ? isOwner : agree && (mode === 'file' ? !!file : !!ytId(yt)))
    && (vis !== 'selected' || picked.size > 0)
    && (editId || kind !== ZIP_KIND || isZipFile) // 음원 묶음은 ZIP 파일로만

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true); setErr('')
    const meta = {
      kind, areas, level: level || null, artist: artist.trim() || null, song: song.trim() || null, tags: parseTags(tags),
      view_only: kind !== ZIP_KIND && ((kind === '교재' && /\.pdf$/i.test(editing?.file_path ?? file?.name ?? '')) || (isTeacher && viewOnly)), youtube_url: yt.trim() || null, yt_marks: parseMarks(marks),
    }
    try {
      let id = editId
      if (editId && editing) {
        const { error } = await supabase.from('scores').update({
          title: title.trim(), major: major || null, description: desc.trim() || null, composer: artist.trim() || null,
          ...meta, ...(isTeacher ? { coach_memo: memo.trim() || null, visibility: vis } : {}),
          ...(kind === ZIP_KIND ? { linked_score_id: linked || null } : {}),
        }).eq('id', editId)
        if (error) throw new Error('저장하지 못했어요: ' + error.message)
      } else {
        const r = await uploadScore({
          file: mode === 'file' ? file : null, title, composer: artist, category: kind === '교재' ? '교재' : '연습곡',
          major, visibility: isTeacher ? vis : 'students', description: desc, createdBy: session?.user.id,
          kind, areas, level, artist, song, tags: meta.tags, viewOnly: meta.view_only, youtubeUrl: meta.youtube_url, ytMarks: meta.yt_marks,
          coachMemo: isTeacher ? memo : null, edrum: drum ? edrum : 'auto',
          ...(isZipFile ? { zipInfo: zip, linkedScoreId: linked || null, onProgress: setProgress } : {}),
        })
        id = r.id
      }
      // 고른 학생만: 공유 목록 맞추기
      if (isTeacher && id) {
        await supabase.from('score_shares').delete().eq('score_id', id)
        if (vis === 'selected' && picked.size) await supabase.from('score_shares').insert([...picked].map(sid => ({ score_id: id, student_id: sid })))
      }
      if (reqId && id && !editId) await supabase.from('material_requests').update({ done: true, done_score_id: id }).eq('id', reqId)
      if (session && !editId) checkBadges(session.user.id, practice.days)
      nav(`/score/${id}`, { replace: true })
    } catch (x) {
      setErr((x as Error).message); setBusy(false); setProgress(null)
    }
  }

  // 자료실 칸과 같은 순서 · 정리표·가이드 녹음은 뺌 (예전에 그 종류로 올린 자료를 고칠 때만 보임)
  // 음원 묶음은 ZIP 자료끼리만 (다른 자료를 음원 묶음으로 바꾸거나, ZIP을 다른 종류로 바꾸지 않게)
  const editZip = !!editing && ZIP_EXT.test(editing.file_path ?? '')
  const zipLocked = isZipFile || editZip
  const kinds = BRAND.kinds.filter(k => (k === ZIP_KIND ? isTeacher && (!editing || editZip) : (k !== '교재' || isTeacher))
    && (!BRAND.hiddenKinds.includes(k) || k === kind))

  if (editId && editing && !isOwner) return <Shell><p className="muted">올린 사람만 고칠 수 있어요.</p></Shell>

  return (
    <Shell>
      <Link to={editId ? `/score/${editId}` : fromAdmin ? '/admin/scores' : '/board'} className="muted" style={{ fontSize: 14 }}>← {editId ? '자료로 돌아가기' : fromAdmin ? '관리자 › 자료 전체' : '자료실'}</Link>
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
                  <span>{file ? `${(file.size / MB).toFixed(1)}MB · 다른 파일로 바꾸려면 누르세요` : 'PDF · MuseScore · MusicXML · MIDI · Guitar Pro · 직접 녹음한 반주·시범(mp3·m4a·wav)' + (isTeacher ? ' · 📦 음원 묶음 ZIP(300MB까지)' : '')}</span>
                </button>
                <input ref={fileRef} type="file" hidden accept={'.pdf,.mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.mp3,.m4a,.wav,.aac,audio/*' + (isTeacher ? ',.zip,application/zip,application/x-zip-compressed' : '')} onChange={e => pickFile(e.target.files?.[0] ?? null)} />
                {kind === ZIP_KIND && !isZipFile && <p className="muted" style={{ margin: 0, fontSize: 13 }}>📦 음원 묶음은 <b>ZIP 파일</b>을 골라 주세요. 트랙 번호 순서로 이름을 붙이면(예: 01_블루스반주_C.mp3) 목록이 그 순서로 보여요.</p>}
                {isZipFile && zip && (
                  <div className="memo" style={{ margin: 0 }}>
                    <p className="k">📦 ZIP 안의 파일</p>
                    <p className="v" style={{ margin: '0 0 4px' }}>음원 <b>{zip.audio}개</b>{zip.files.length > zip.audio ? ` · 그 밖의 파일 ${zip.files.length - zip.audio}개` : ''} · {fmtMB(zip.size)}</p>
                    <ol className="zip-list">{zip.files.slice(0, 8).map(f => <li key={f.n}>{zipShortName(f.n)} <span className="muted">{fmtMB(f.s)}</span></li>)}</ol>
                    {zip.files.length > 8 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>… 외 {zip.files.length - 8}개</p>}
                  </div>
                )}
                {drum && (drum.roland || drum.drumCh || major === '드럼') && (
                  <label className="check edrum">
                    <input type="checkbox" checked={edrum} onChange={e => setEdrum(e.target.checked)} />
                    <span>
                      <b>🥁 전자드럼(롤랜드)으로 친 드럼 MIDI예요</b>{drum.roland && <span className="muted"> · 롤랜드 음 번호가 보여요</span>}<br />
                      <span className="muted">하이햇·심벌 가장자리와 림을 친 음 번호를 표준 드럼 번호로 맞춰서 올려요. 그래야 악보와 소리가 맞게 나와요.</span>
                      {edrum && <span className="edrum-do">{drum.summary || '바꿀 음이 없어요. 이미 표준 번호예요.'}</span>}
                      {edrum && drum.aux > 0 && <span className="muted edrum-do">보조 패드(AUX) 음 {drum.aux}개는 그대로 뒀어요.</span>}
                      {edrum && drum.odd && <span className="err edrum-do">표준 드럼 번호가 아닌 음: {drum.odd}</span>}
                      {edrum && <span className="muted edrum-do">DAW에서 박 맞추기(퀀타이즈)를 하고 내보내면 악보가 깔끔하게 나와요.</span>}
                    </span>
                  </label>
                )}
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
            {kinds.map(k => <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} disabled={zipLocked && k !== ZIP_KIND} onClick={() => setKind(k)}>{BRAND.kindLabel[k] ?? k}</button>)}
          </div>
          {BRAND.kindHelp[kind] && <span className="muted" style={{ fontSize: 13 }}>{BRAND.kindHelp[kind]}</span>}
        </fieldset>

        {kind === ZIP_KIND && isTeacher && <BookPick value={linked} onChange={setLinked} />}

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
            {([['students', '학원 전체'], ['mine', '내 학생만'], ['selected', '고른 학생만'], ['coaches', '코치끼리만'], ...(isAdmin ? [['admin', '관리자만 (나중에 공개)']] as const : [])] as const).map(([v, l]) => (
              <label key={v}><input type="radio" name="scope" checked={vis === v} onChange={() => setVis(v)} /> {l}</label>
            ))}
            {vis === 'selected' && <StudentPicker students={students} picked={picked} onChange={setPicked} />}
          </fieldset>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>학생이 올린 자료는 학원 전체에 바로 보여요. <b>학생 자료</b> 표시가 붙어요.</p>
        )}

        {kind === ZIP_KIND ? null : kind === '교재' ? (
          <p className="lock-note" style={{ fontSize: 13 }}>🔒 <b>PDF 교재</b>는 자동으로 보기 전용이 돼요. 파일 다운로드는 올린 사람과 관리자만 되고, 다른 사람은 필요한 쪽만 골라 프린트(한 번에 10쪽)할 수 있어요.</p>
        ) : isTeacher && !(mode === 'yt' && !editId) && !(editing && !editing.file_path) && (
          <label className="check">
            <input type="checkbox" checked={viewOnly} onChange={e => setViewOnly(e.target.checked)} />
            <span><b>보기 전용으로 올리기</b> <span className="muted">(코치만)</span><br /><span className="muted">비밀악보처럼 막고 싶을 때 체크하세요. 나(올린 사람)와 관리자만 다운로드·프린트할 수 있어요.</span></span>
          </label>
        )}

        {!editId && (
          <label className="check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span className="muted">{kind === ZIP_KIND
              ? '학원이 직접 만들었거나 학원 안에서 나눠도 되는 음원만 묶었어요. 시판 교재에 딸린 출판사 음원은 올리지 않을게요.'
              : '학원 안에서 공부용으로만 나누는 자료예요. 카피 악보를 학원 밖으로 퍼뜨리지 않을게요.'}</span>
          </label>
        )}

        {err && <p className="err">{err}</p>}
        <button className="btn primary wide" disabled={!canSave}>{busy ? (file ? `올리는 중…${progress != null ? ` ${Math.round(progress * 100)}%` : ''} (창을 닫지 마세요)` : '저장하는 중…') : editId ? '저장하기' : (isTeacher && vis !== 'students') ? '올리기' : '올리기 · 바로 공개돼요'}</button>
        {!editId && isTeacher && <Link to="/teacher/bulk" className="muted hide-m" style={{ fontSize: 13, textAlign: 'center' }}>PC에서 여러 개를 한꺼번에 올리려면 → 여러 개 올리기</Link>}
      </form>
    </Shell>
  )
}
