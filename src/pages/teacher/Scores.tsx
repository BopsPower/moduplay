import { useEffect, useRef, useState, type DragEvent } from 'react'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import { supabase, type Score } from '../../lib/supabase'

const CATS = BRAND.categories
const VIS = [['students', '학원생 전체 (악보 자료실에 보임)'], ['assigned', '과제 받은 학생만'], ['public', '외부 공개 (로그인 없이 보임)']] as const

// 제목·작곡가는 변환 서버가 파일에서 읽어 비어 있으면 자동으로 채웁니다.
async function readMeta(_file: File): Promise<{ title?: string; composer?: string }> { return {} }

export default function Scores() {
  const [rows, setRows] = useState<Score[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [cat, setCat] = useState<string>(CATS[0])
  const [major, setMajor] = useState('')
  const [tempo, setTempo] = useState('')
  const [vis, setVis] = useState<'students' | 'assigned' | 'public'>('students')
  const [desc, setDesc] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('scores').select('*').order('created_at', { ascending: false })
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function pick(f: File | undefined) {
    if (!f) return
    if (!/\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/i.test(f.name)) return setErr('MuseScore(.mscz), MusicXML(.musicxml/.mxl), MIDI(.mid), Guitar Pro(.gp), PDF 파일만 올릴 수 있어요.')
    setErr(''); setFile(f)
    setTitle(f.name.replace(/\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/i, ''))
    const m = await readMeta(f)
    if (m.title) setTitle(m.title)
    if (m.composer) setComposer(m.composer)
  }

  function onDrop(e: DragEvent) { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }

  async function upload() {
    if (!file) return setErr('악보 파일을 먼저 선택해 주세요.')
    if (!title.trim()) return setErr('제목을 입력해 주세요.')
    setBusy(true); setErr(''); setMsg('')
    const id = crypto.randomUUID()
    const ext = file.name.toLowerCase().match(/\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/)?.[1] ?? 'mscz'
    const path = `${id}.${ext}`
    const isPdf = ext === 'pdf'
    const up = await supabase.storage.from('scores').upload(path, file, { contentType: isPdf ? 'application/pdf' : 'application/octet-stream' })
    if (up.error) { setBusy(false); return setErr('파일 업로드에 실패했어요: ' + up.error.message) }
    // PDF는 서버 변환을 건너뜀: 브라우저에서 바로 보여주므로 올리자마자 공개 (500쪽 책도 기다림 없음)
    let pages: number | null = null
    if (isPdf) {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const d = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        pages = d.numPages; d.destroy()
      } catch { /* 쪽수는 몰라도 보기는 됨 */ }
    }
    const { error } = await supabase.from('scores').insert({
      id, title: title.trim(), composer: composer.trim() || null, category: cat, major: major || null,
      tempo: tempo ? Number(tempo) : null, file_path: path, visibility: vis, description: desc.trim() || null,
      ...(isPdf ? { convert_status: 'done', pdf_path: path, page_count: pages, converted_at: new Date().toISOString(),
        convert_error: 'PDF 원본: 보기·인쇄만 가능 (재생·마디 이동·MIDI 변환 없음)' } : {}),
    })
    setBusy(false)
    if (error) return setErr('저장하지 못했어요: ' + error.message)
    setMsg(isPdf ? `"${title.trim()}" PDF를 올렸어요${pages ? ` (${pages}쪽)` : ''}. 학생이 바로 볼 수 있어요.` : `"${title.trim()}" 악보를 올렸어요. 1~3분 뒤 준비가 끝나면 학생이 볼 수 있어요.`)
    setFile(null); setTitle(''); setComposer(''); setTempo(''); setDesc('')
    if (inputRef.current) inputRef.current.value = ''
    load()
  }

  async function remove(s: Score) {
    if (!confirm(`"${s.title}" 악보를 삭제할까요? 학생 과제에서도 사라져요.`)) return
    await supabase.storage.from('scores').remove([s.file_path])
    await supabase.from('scores').delete().eq('id', s.id)
    load()
  }

  return (
    <Shell teacher>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치 화면</p>
        <h1 className="title">악보 업로드</h1>
      </div>

      <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>악보 올리기</p>
        <div className={'drop' + (over ? ' over' : '')}
          onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          onClick={() => inputRef.current?.click()} role="button" tabIndex={0}>
          {file ? <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{file.name}</span> : <>MuseScore(.mscz) · MusicXML(.musicxml/.mxl) · MIDI(.mid) · Guitar Pro(.gp) · PDF(보기 전용) 파일을 여기에 끌어다 놓거나 <u>클릭해서 선택</u></>}
          <input ref={inputRef} type="file" accept=".mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.pdf" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: '2 1 240px' }}><span>제목 <em className="req">필수</em></span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="field"><span>작곡가 <em className="opt">선택</em></span><input value={composer} onChange={e => setComposer(e.target.value)} /></label>
          <label className="field"><span>전공</span>
            <select value={major} onChange={e => setMajor(e.target.value)}><option value="">공통</option>{BRAND.majors.map(m => <option key={m} value={m}>{m}</option>)}</select>
          </label>
          <label className="field"><span>분류</span>
            <select value={cat} onChange={e => setCat(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
          </label>
          <label className="field" style={{ flex: '0 1 150px' }}><span>기본 빠르기(BPM) <em className="opt">선택</em></span><input type="number" min={20} max={300} value={tempo} onChange={e => setTempo(e.target.value)} placeholder="비우면 100" /></label>
        </div>
        <div className="form-row">
          <label className="field" style={{ flex: '1 1 260px' }}><span>공개 범위</span>
            <select value={vis} onChange={e => setVis(e.target.value as any)}>{VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="field" style={{ flex: '2 1 300px' }}><span>한 줄 소개 <em className="opt">선택 · 자료실에 보여요</em></span><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="예) 왼손 화음 연습용" /></label>
          <button className="btn primary" onClick={upload} disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
        </div>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </div>

      <div className="chips" style={{ justifyContent: 'flex-end' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="muted">
          검색
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="곡 이름, 작곡가, 전공 (일부만 입력해도 돼요)"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', width: 240 }} />
        </label>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>제목</th><th>작곡가</th><th>전공</th><th>분류</th><th>공개</th><th>준비</th><th>빠르기</th><th>올린 날</th><th></th></tr></thead>
          <tbody>
            {rows.filter(s => matches(q, s.title, s.composer, s.major, s.category)).map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 700 }}>{s.title}</td>
                <td className="muted">{s.composer ?? '-'}</td>
                <td>{s.major ?? <span className="muted">공통</span>}</td>
                <td><span className="pill">{s.category}</span></td>
                <td>{s.visibility === 'public' ? <span className="pill on">외부 공개</span> : s.visibility === 'assigned' ? <span className="pill">과제만</span> : <span className="pill acc">학원생</span>}</td>
                <td>{s.convert_status === 'done' ? <span className="pill on">완료</span> : s.convert_status === 'failed' ? <span className="pill off" title={s.convert_error ?? ''}>실패</span> : <span className="pill">변환 중</span>}</td>
                <td>{s.tempo ? `♩=${s.tempo}` : '-'}</td>
                <td className="muted">{(s as any).created_at?.slice(0, 10)}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={() => remove(s)}>삭제</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 32 }}>아직 올린 악보가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}
