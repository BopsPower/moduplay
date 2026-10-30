import { useRef, useState, type DragEvent } from 'react'
import { BRAND } from '../lib/brand'
import { SCORE_EXT, uploadScore } from '../lib/uploadScore'

type Item = { key: string; file: File; title: string; major: string; cat: string; state: 'wait' | 'up' | 'ok' | 'err' | 'skip'; msg?: string }

const MB = 1024 * 1024
const LIMIT = 50 * MB // 저장소 한 파일 업로드 한도

// PC에서 악보 여러 개를 한꺼번에 올리기: 파일 여러 개·폴더째 끌어다 놓기 → 제목·전공·분류 확인 → 한 번에 올리기
export default function BulkUpload({ createdBy, existingTitles, onDone }: { createdBy?: string | null; existingTitles: string[]; onDone: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [major, setMajor] = useState('')
  const [cat, setCat] = useState<string>(BRAND.categories[0])
  const [vis, setVis] = useState<'students' | 'assigned'>('students')
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const have = new Set(existingTitles.map(t => t.trim().toLowerCase()))

  function add(files: File[]) {
    const next: Item[] = []
    for (const f of files) {
      if (f.name.startsWith('.') || f.name.startsWith('._')) continue // 맥 숨김 파일
      const ok = SCORE_EXT.test(f.name)
      const title = f.name.replace(SCORE_EXT, '').replace(/[_]+/g, ' ').trim()
      const dup = have.has(title.toLowerCase()) || items.some(i => i.title.toLowerCase() === title.toLowerCase())
      next.push({
        key: `${f.name}-${f.size}-${f.lastModified}`, file: f, title, major, cat,
        state: !ok || f.size > LIMIT || dup ? 'skip' : 'wait',
        msg: !ok ? '악보 파일 아님' : f.size > LIMIT ? `${Math.round(f.size / MB)}MB — 50MB 넘어서 못 올림` : dup ? '같은 제목이 이미 있음' : undefined,
      })
    }
    setItems(v => [...v, ...next.filter(n => !v.some(x => x.key === n.key))])
  }
  // 폴더째 끌어다 놓기 (하위 폴더까지)
  async function fromDrop(e: DragEvent) {
    e.preventDefault(); setOver(false)
    const entries = [...e.dataTransfer.items].map(i => (i as any).webkitGetAsEntry?.()).filter(Boolean)
    if (!entries.length) return add([...e.dataTransfer.files])
    const out: File[] = []
    const walk = async (en: any): Promise<void> => {
      if (en.isFile) out.push(await new Promise<File>((res, rej) => en.file(res, rej)))
      else if (en.isDirectory) {
        const rd = en.createReader()
        for (;;) { const batch: any[] = await new Promise((res, rej) => rd.readEntries(res, rej)); if (!batch.length) break; for (const b of batch) await walk(b) }
      }
    }
    for (const en of entries) await walk(en)
    add(out)
  }

  const set = (k: string, p: Partial<Item>) => setItems(v => v.map(i => i.key === k ? { ...i, ...p } : i))
  const todo = items.filter(i => i.state === 'wait' || i.state === 'err')
  const done = items.filter(i => i.state === 'ok').length
  const total = items.filter(i => i.state !== 'skip').length

  async function run() {
    setRunning(true)
    const queue = [...todo]
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        set(it.key, { state: 'up', msg: undefined })
        try {
          await uploadScore({ file: it.file, title: it.title || it.file.name, category: it.cat, major: it.major, visibility: vis, createdBy })
          set(it.key, { state: 'ok' })
        } catch (e) { set(it.key, { state: 'err', msg: (e as Error).message.slice(0, 60) }) }
      }
    }
    await Promise.all([worker(), worker(), worker()]) // 3개씩 동시에
    setRunning(false); onDone()
  }

  return (
    <div className="bulk">
      <div className={'drop' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={fromDrop}
        style={{ border: '2px dashed #cbd5e1', padding: 22, textAlign: 'center', fontSize: 14, color: 'var(--muted)', background: over ? 'var(--accent-soft)' : undefined }}>
        악보 파일 <b>여러 개</b>나 <b>폴더</b>를 여기에 끌어다 놓으세요<br />
        <span style={{ fontSize: 12 }}>MuseScore · MusicXML · MIDI · Guitar Pro · PDF (한 파일 50MB까지)</span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>파일 고르기</button>
          <button type="button" className="btn sm" onClick={() => dirRef.current?.click()}>폴더 고르기</button>
        </div>
        <input ref={fileRef} type="file" multiple accept=".mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.pdf" style={{ display: 'none' }} onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
        <input ref={dirRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as any)} style={{ display: 'none' }} onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <label className="field"><span>전공 (한꺼번에)</span>
              <select value={major} onChange={e => { setMajor(e.target.value); setItems(v => v.map(i => i.state === 'ok' ? i : { ...i, major: e.target.value })) }}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="field"><span>분류 (한꺼번에)</span>
              <select value={cat} onChange={e => { setCat(e.target.value); setItems(v => v.map(i => i.state === 'ok' ? i : { ...i, cat: e.target.value })) }}>{BRAND.categories.map(c => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field"><span>어디에</span>
              <select value={vis} onChange={e => setVis(e.target.value as any)}><option value="students">악보 자료실 (학원생 전체)</option><option value="assigned">과제용 (과제 받은 학생만)</option></select>
            </label>
          </div>

          <div className="bulk-list">
            <div className="bulk-head"><span>제목 (고칠 수 있어요)</span><span>전공</span><span>분류</span><span>상태</span><span /></div>
            {items.map(i => (
              <div key={i.key} className={'bulk-row ' + i.state}>
                <input value={i.title} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { title: e.target.value })} title={i.file.name} />
                <select value={i.major} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { major: e.target.value })}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
                <select value={i.cat} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { cat: e.target.value })}>{BRAND.categories.map(c => <option key={c}>{c}</option>)}</select>
                <span className="st">{i.state === 'ok' ? '✓ 올림' : i.state === 'up' ? '올리는 중…' : i.state === 'err' ? `실패: ${i.msg}` : i.state === 'skip' ? `건너뜀: ${i.msg}` : `${(i.file.size / MB).toFixed(1)}MB`}</span>
                {i.state === 'skip' && i.msg === '같은 제목이 이미 있음'
                  ? <button type="button" className="btn sm ghost" onClick={() => set(i.key, { state: 'wait', msg: undefined })}>그래도 올리기</button>
                  : <button type="button" className="btn sm ghost" disabled={i.state === 'up' || running} onClick={() => setItems(v => v.filter(x => x.key !== i.key))} aria-label="목록에서 빼기">✕</button>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={running || todo.length === 0} onClick={run}>
              {running ? `올리는 중… (${done}/${total})` : `${todo.length}개 올리기`}
            </button>
            {!running && <button type="button" className="btn ghost" onClick={() => setItems([])}>목록 비우기</button>}
            <span className="muted" style={{ fontSize: 13 }}>
              {items.filter(i => i.state === 'skip').length > 0 && `건너뜀 ${items.filter(i => i.state === 'skip').length}개 · `}
              PDF는 바로, 나머지는 서버에서 차례로 준비돼요 (1개에 1~3분).
            </span>
          </div>
        </>
      )}
    </div>
  )
}
