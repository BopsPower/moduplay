import { useRef, useState, type DragEvent } from 'react'
import { BRAND } from '../lib/brand'
import { MATERIAL_EXT, uploadScore } from '../lib/uploadScore'
import { parseEnsemble, type EnsInfo } from '../lib/ensemble'

const AUDIO = /\.(mp3|m4a|wav|aac)$/i
// 파일 이름 → 제목. 띄어쓰기가 있는 이름의 '_'는 대개 저장할 때 바뀐 문장부호라 되살림
//  Don_t → Don't, Groovin_ High → Groovin' High, Take The _A_ Train → Take The 'A' Train, Miss Jones_ → Miss Jones?
// 띄어쓰기 없는 이름(My_Song_Title)은 예전처럼 '_' → 띄어쓰기
function cleanTitle(stem: string) {
  if (!/ /.test(stem)) return stem.replace(/_+/g, ' ').trim()
  return stem
    .replace(/(^|\s)_([A-Za-z])_(?=\s|$)/g, "$1'$2'")
    .replace(/(?<=[A-Za-z])_(?=[A-Za-z]{1,2}\b|\s)/g, "'")
    .replace(/_$/, '?')
    .replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
}

type Item = { key: string; file: File; title: string; major: string; cat: string; state: 'wait' | 'up' | 'ok' | 'err' | 'skip'; msg?: string; ens?: EnsInfo | null }

const MB = 1024 * 1024
const LIMIT = 50 * MB // 저장소 한 파일 업로드 한도

// PC에서 악보 여러 개를 한꺼번에 올리기: 파일 여러 개·폴더째 끌어다 놓기 → 제목·전공·종류 확인 → 한 번에 올리기
export default function BulkUpload({ createdBy, existingTitles, onDone }: { createdBy?: string | null; existingTitles: string[]; onDone: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [major, setMajor] = useState('')
  const [cat, setCat] = useState<string>('곡 악보') // 종류 (자료실과 같은 이름)
  const [suffix, setSuffix] = useState('') // 제목 뒤에 한꺼번에 붙일 말 (예: _realbook mr)
  const [vis, setVis] = useState<'students' | 'mine' | 'coaches'>('students')
  const [over, setOver] = useState(false)
  const [running, setRunning] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const have = new Set(existingTitles.map(t => t.trim().toLowerCase()))

  function add(files: File[]) {
    const next: Item[] = []
    for (const f of files) {
      if (f.name.startsWith('.') || f.name.startsWith('._')) continue // 맥 숨김 파일
      const ok = MATERIAL_EXT.test(f.name)
      const audio = AUDIO.test(f.name)
      // 앙상블 MR 이름 규칙(59. 뮤지션 - 곡 (No BASS))이면 곡·파트로 정리하고 종류는 앙상블
      const ens = ok ? parseEnsemble(f.name.replace(MATERIAL_EXT, '')) : null
      const title = (ens ? `${ens.no}. ${ens.song} (${ens.part})` : cleanTitle(f.name.replace(MATERIAL_EXT, ''))) + suffix
      const dup = have.has(title.toLowerCase()) || items.some(i => i.title.toLowerCase() === title.toLowerCase())
      next.push({
        key: `${f.name}-${f.size}-${f.lastModified}`, file: f, title, major, ens, cat: ens ? '앙상블' : audio && !['반주·MR', '가이드 녹음'].includes(cat) ? '반주·MR' : cat,
        state: !ok || f.size > LIMIT || dup ? 'skip' : 'wait',
        msg: !ok ? '올릴 수 없는 파일' : f.size > LIMIT ? `${Math.round(f.size / MB)}MB — 50MB 넘어서 못 올림` : dup ? '같은 제목이 이미 있음' : undefined,
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
          const e = it.cat === '앙상블' ? it.ens : null
          await uploadScore({ file: it.file, title: it.title || it.file.name, kind: it.cat,
            ...(e ? { artist: e.artist, song: e.song, tags: [`auto:ens:${e.no}`, `auto:ens-part:${e.part}`] } : {}), category: it.cat === '교재' ? '교재' : it.cat === '기타' ? '기타' : '연습곡', major: it.major, visibility: vis, createdBy })
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
        자료 파일 <b>여러 개</b>나 <b>폴더</b>를 여기에 끌어다 놓으세요<br />
        <span style={{ fontSize: 12 }}>MuseScore · MusicXML · MIDI · Guitar Pro · PDF · 음원 mp3·m4a·wav (한 파일 50MB까지)</span>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>파일 고르기</button>
          <button type="button" className="btn sm" onClick={() => dirRef.current?.click()}>폴더 고르기</button>
        </div>
        <input ref={fileRef} type="file" multiple accept=".mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.pdf,.mp3,.m4a,.wav,.aac,audio/*" style={{ display: 'none' }} onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
        <input ref={dirRef} type="file" multiple {...({ webkitdirectory: '', directory: '' } as any)} style={{ display: 'none' }} onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
      </div>

      {items.length > 0 && (
        <>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <label className="field"><span>전공 (한꺼번에)</span>
              <select value={major} onChange={e => { setMajor(e.target.value); setItems(v => v.map(i => i.state === 'ok' ? i : { ...i, major: e.target.value })) }}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="field"><span>종류 (한꺼번에)</span>
              <select value={cat} onChange={e => { setCat(e.target.value); setItems(v => v.map(i => i.state === 'ok' ? i : { ...i, cat: e.target.value })) }}>{BRAND.kinds.filter(k => k !== '시범 영상').map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}</option>)}</select>
            </label>
            <label className="field"><span>제목 뒤에 붙이기</span>
              <input value={suffix} placeholder="예: _realbook mr" disabled={running} onChange={e => {
                const nx = e.target.value
                setItems(v => v.map(i => {
                  if (i.state === 'ok' || i.state === 'up') return i
                  const title = (suffix && i.title.endsWith(suffix) ? i.title.slice(0, -suffix.length) : i.title) + nx
                  // 제목이 바뀌면 '이미 있음'도 다시 확인 (이미 올린 곡은 건너뜀)
                  const dup = have.has(title.trim().toLowerCase())
                  if (dup && i.state === 'wait') return { ...i, title, state: 'skip', msg: '같은 제목이 이미 있음' }
                  if (!dup && i.state === 'skip' && i.msg === '같은 제목이 이미 있음') return { ...i, title, state: 'wait', msg: undefined }
                  return { ...i, title }
                }))
                setSuffix(nx)
              }} />
            </label>
            <label className="field"><span>어디에</span>
              <select value={vis} onChange={e => setVis(e.target.value as any)}><option value="students">학원 전체</option><option value="mine">내 학생만</option><option value="coaches">코치끼리만</option></select>
            </label>
          </div>

          <div className="bulk-list">
            <div className="bulk-head"><span>제목 (고칠 수 있어요)</span><span>전공</span><span>종류</span><span>상태</span><span /></div>
            {items.map(i => (
              <div key={i.key} className={'bulk-row ' + i.state}>
                <input value={i.title} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { title: e.target.value })} title={i.file.name} />
                <select value={i.major} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { major: e.target.value })}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
                <select value={i.cat} disabled={i.state === 'ok' || i.state === 'up'} onChange={e => set(i.key, { cat: e.target.value })}>{BRAND.kinds.filter(k => k !== '시범 영상').map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}</option>)}</select>
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
              PDF·음원은 바로, 나머지는 서버에서 차례로 준비돼요 (1개에 1~3분).
            </span>
          </div>
        </>
      )}
    </div>
  )
}
