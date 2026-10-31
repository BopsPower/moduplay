import { useEffect, useRef, useState } from 'react'
import { supabase, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { kindOf, musicianOf, soundsliceUrl } from '../lib/materials'
import { useAuth } from '../lib/auth'
import { uploadScore } from '../lib/uploadScore'

// 관리자 검수: 앱 안에서 악보(MusicXML)를 바로 그려 보고, 공개·종류·전공을 정한 뒤 다음 악보로.
// 사운드슬라이스 로그인 없이, 화면을 떠나지 않고 볼 수 있음. 악보 그리는 프로그램(OpenSheetMusicDisplay)은 이 창을 열 때만 불러옴.
// coach 모드: 담당 강사가 '학생에게 공개' / '필요 없음' 만 고름 (전공은 못 바꿈)
export default function ReviewModal({ list: initial, all, start, onClose, onVis, onField, mode = 'admin' }: {
  list: Score[]; all: Score[]; start: number; onClose: () => void
  onVis: (sc: Score, v: Score['visibility']) => Promise<void>
  onField: (sc: Score, ch: Partial<Score>) => Promise<void>
  mode?: 'admin' | 'coach'
}) {
  const [i, setI] = useState(start)
  // 연 순간의 목록 순서를 고정 (공개해서 거르기에서 빠져도 순서가 밀리지 않게), 내용은 최신 값으로
  const [naming, setNaming] = useState<{ id: string; title: string; artist: string } | null>(null)
  const [ids] = useState(() => initial.map(x => x.id))
  const list = ids
  const byId = new Map(all.map(x => [x.id, x]))
  const sc = byId.get(ids[i]) ?? initial.find(x => x.id === ids[i])
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState<Record<string, string>>({}) // 이 창에서 처리한 것 (id → 표시)

  // 큰 악보(여러 악기·수백 마디)는 한꺼번에 그리면 화면이 멈춤 → 앞 16마디·한 악기부터 그리고 '더 보기'
  const STEP = 16
  const osmdRef = useRef<any>(null)
  const xmlRef = useRef<string | null>(null) // 파트 나눠 저장할 때 쓰는 원본 글자
  const { session } = useAuth()
  const [split, setSplit] = useState<{ busy: boolean; msg: string; id?: string }>({ busy: false, msg: '' })
  const [upto, setUpto] = useState(STEP)
  const [total, setTotal] = useState(0)
  const [parts, setParts] = useState<string[]>([])
  const [part, setPart] = useState(-1) // -1: 전체
  const [drawing, setDrawing] = useState(false)
  const majorRe: Record<string, RegExp> = { 베이스: /bass|베이스/i, 기타: /guit|기타/i, 드럼: /drum|perc|드럼/i, 피아노: /piano|key|건반|피아노/i, 보컬: /voc|voice|sing|보컬/i }

  useEffect(() => {
    let dead = false
    const el = box.current; if (!el || !sc) return
    el.innerHTML = ''; setState('loading'); setMsg(''); osmdRef.current = null; xmlRef.current = null; setSplit({ busy: false, msg: '' }); setTotal(0); setParts([]); setUpto(STEP)
    ;(async () => {
      try {
        const fp = sc.file_path ?? ''
        if (!/\.(musicxml|mxl|xml)$/i.test(fp)) { setState('err'); setMsg('MusicXML 악보가 아니라 미리 보기를 할 수 없어요. 악보 화면에서 확인해 주세요.'); return }
        const { data } = await supabase.storage.from('scores').download(fp)
        if (!data) throw new Error('파일을 받지 못했어요')
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
        if (dead) return
        const osmd = new OpenSheetMusicDisplay(el, { autoResize: false, drawTitle: false, drawSubtitle: false, drawComposer: false, drawCredits: false, backend: 'svg', drawingParameters: 'compacttight', drawUpToMeasureNumber: STEP })
        const isMxl = /\.mxl$/i.test(fp)
        // 사운드슬라이스 일부 파일은 음이름이 빈 음표(<step> </step>, 고스트·뮤트 음으로 보임)가 있어 악보 그리기가 멈춤
        // → 미리 보기에서만 그 음표를 같은 길이의 쉼표로 바꿔 그림 (원본 파일은 그대로)
        const raw = isMxl ? null : await data.text()
        const text = raw && raw.replace(/<pitch>\s*<step>\s*<\/step>[\s\S]*?<\/pitch>/g, '<rest/>')
        const fixed = !!raw && text !== raw
        xmlRef.current = raw
        if (fixed) setMsg('이 악보에는 음 이름이 비어 있는 음표가 있어서 미리 보기에서는 쉼표로 바꿔 보여 드려요.')
        await osmd.load(isMxl ? (data as Blob) as any : text!)
        if (dead) return
        osmd.zoom = window.innerWidth < 640 ? 0.55 : 0.8
        const inst = (osmd.Sheet?.Instruments ?? []) as { Name?: string; Visible: boolean }[]
        const names = inst.map((x, k) => x.Name || `파트 ${k + 1}`)
        // 여러 악기면 이 곡 전공에 맞는 파트 하나만 먼저
        let pick = -1
        if (inst.length > 1) {
          const re = majorRe[sc.major ?? '']
          // 'Bass'처럼 이름이 딱 맞는 파트 먼저, 없으면 이름에 들어간 파트('Extra bass' 등)
          const exact = re ? names.findIndex(n => re.test(n) && n.trim().split(/\s+/).length === 1) : -1
          pick = Math.max(0, exact >= 0 ? exact : re ? names.findIndex(n => re.test(n)) : 0)
          inst.forEach((x, k) => { x.Visible = k === pick })
        }
        osmdRef.current = osmd
        setParts(names); setPart(pick); setTotal(osmd.Sheet?.SourceMeasures?.length ?? 0)
        await new Promise(r => setTimeout(r, 30))
        if (dead) return
        osmd.render()
        setState('ok')
      } catch (e: any) { if (!dead) { setState('err'); setMsg('악보를 그리지 못했어요: ' + (e?.message ?? e)) } }
    })()
    return () => { dead = true }
  }, [sc?.id])

  // 고른 파트만 남긴 MusicXML을 새 자료로 저장 (관리자만 보기 · 원본은 그대로)
  async function savePart() {
    const xml = xmlRef.current
    if (!sc || part < 0 || !xml) return
    const name = parts[part]
    setSplit({ busy: true, msg: '' })
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      if (doc.getElementsByTagName('parsererror').length) throw new Error('악보 글자를 읽지 못했어요')
      const sps = [...doc.getElementsByTagName('score-part')]
      // 같은 이름 파트(예: Bass 오선 + Bass 타브)는 함께
      const keep = new Set(sps.filter((p, k) => (p.getElementsByTagName('part-name')[0]?.textContent?.trim() || `파트 ${k + 1}`) === name.trim()).map(p => p.getAttribute('id')))
      if (!keep.size) keep.add(sps[part]?.getAttribute('id'))
      sps.forEach(p => { if (!keep.has(p.getAttribute('id'))) p.remove() })
      ;[...doc.getElementsByTagName('part-group')].forEach(g => g.remove())
      ;[...doc.getElementsByTagName('part')].forEach(p => { if (!keep.has(p.getAttribute('id'))) p.remove() })
      const out = new XMLSerializer().serializeToString(doc)
      const label = name.replace(/\s+/g, ' ').trim()
      const r = await uploadScore({
        file: new File([out], `${label}.musicxml`, { type: 'application/xml' }),
        title: `${sc.title} (${label})`.slice(0, 200), category: (sc as any).category ?? '악보', major: sc.major ?? undefined,
        kind: sc.kind ?? undefined, artist: sc.artist, composer: sc.composer ?? undefined, tempo: sc.tempo ?? null,
        visibility: 'admin', createdBy: session?.user.id ?? null,
        tags: [...(sc.tags ?? []).filter(t => !t.startsWith('auto:검수') && !t.startsWith('악기:')), 'auto:파트분리'],
        description: `'${sc.title}'에서 ${label} 파트만 나눠 저장`,
      })
      setSplit({ busy: false, msg: `'${sc.title} (${label})'로 저장했어요 · 관리자만 보기`, id: r.id })
    } catch (e: any) { setSplit({ busy: false, msg: '저장하지 못했어요: ' + (e?.message ?? e) }) }
  }

  async function redraw(nextUpto: number, nextPart: number) {
    const osmd = osmdRef.current; if (!osmd) return
    setDrawing(true); setUpto(nextUpto); setPart(nextPart)
    await new Promise(r => setTimeout(r, 30)) // '그리는 중' 먼저 보이게
    try {
      const inst = (osmd.Sheet?.Instruments ?? []) as { Visible: boolean }[]
      if (inst.length > 1) inst.forEach((x, k) => { x.Visible = nextPart < 0 || k === nextPart })
      osmd.setOptions({ drawUpToMeasureNumber: nextUpto })
      osmd.render()
    } finally { setDrawing(false) }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return
      if (e.key === 'ArrowRight') setI(x => Math.min(list.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1))
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [list.length])

  if (!sc) return null
  const next = () => setI(x => Math.min(list.length - 1, x + 1))
  async function publish(v: Score['visibility'], label: string) {
    const cur = sc!; await onVis(cur, v); setDone(d => ({ ...d, [cur.id]: label })); next()
  }
  const ss = soundsliceUrl(sc.file_path)
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="악보 검수" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 1000, height: 'min(92vh, 1000px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eadfd5', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>{i + 1} / {list.length.toLocaleString()}</span>
            {naming?.id === sc.id ? (
              <form style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }} onSubmit={async e => { e.preventDefault(); const t = naming.title.trim(); if (!t) return; await onField(sc, { title: t.slice(0, 200), artist: naming.artist.trim() || null }); setNaming(null) }}>
                <input autoFocus value={naming.title} onChange={e => setNaming({ ...naming, title: e.target.value })} aria-label="곡 이름" placeholder="곡 이름" style={{ flex: '2 1 180px', padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 14 }} />
                <input value={naming.artist} onChange={e => setNaming({ ...naming, artist: e.target.value })} aria-label="뮤지션" placeholder="뮤지션" style={{ flex: '1 1 120px', padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 14 }} />
                <button type="submit" className="btn sm primary">저장</button>
                <button type="button" className="btn sm ghost" onClick={() => setNaming(null)}>취소</button>
              </form>
            ) : (
              <>
                <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.title}</b>
                <button type="button" className="btn sm ghost" onClick={() => setNaming({ id: sc.id, title: sc.title, artist: sc.artist ?? '' })} title="곡 이름·뮤지션 고치기">✏️ 이름</button>
              </>
            )}
            {done[sc.id] && <span className="b" style={{ fontSize: 12 }}>✓ {done[sc.id]}</span>}
            <button type="button" className="btn sm ghost" onClick={onClose} aria-label="닫기">✕</button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {[musicianOf(sc), sc.major ?? '전공 없음', BRAND.kindShort[kindOf(sc)] ?? kindOf(sc), sc.visibility === 'admin' ? '관리자만(검수 전)' : sc.visibility === 'review' ? '악보 창고' : '학생에게 공개됨'].filter(Boolean).join(' · ')}
            {ss && <> · <a href={ss} target="_blank" rel="noreferrer">사운드슬라이스 원본 ↗</a></>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {mode === 'admin' && <select value={kindOf(sc)} aria-label="종류" onChange={e => onField(sc, { kind: e.target.value })} style={{ padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
              {BRAND.kinds.map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}</option>)}
            </select>}
            {mode === 'admin' && <select value={sc.major ?? ''} aria-label="전공" onChange={e => onField(sc, { major: e.target.value || null })} style={{ padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
              <option value="">전공 없음(공통)</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}
            </select>}
            <span style={{ flex: 1 }} />
            {mode === 'admin' ? <>
              <button type="button" className="btn sm primary" onClick={() => publish('students', '학원 전체 공개')}>학원 전체 공개 → 다음</button>
              <button type="button" className="btn sm" onClick={() => publish('coaches', '코치끼리만')}>코치끼리만 → 다음</button>
            </> : <>
              <button type="button" className="btn primary" disabled={!!done[sc.id] || sc.visibility !== 'review'} onClick={() => publish('students', '꺼내 줌')}>🎁 우리 학생들에게 꺼내 주기</button>
            </>}
            <button type="button" className="btn sm ghost" onClick={next} disabled={i >= list.length - 1}>{mode === 'coach' ? '다음 곡 →' : '건너뛰기 →'}</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#fff', position: 'relative' }}>
          {state !== 'ok' && <p className="muted" style={{ padding: 24, margin: 0 }}>{state === 'loading' ? '악보를 그리는 중… (큰 악보는 몇 초 걸려요)' : msg}</p>}
          {state === 'ok' && msg && <p style={{ margin: '8px 12px 0', fontSize: 12, color: '#8a5a00' }}>⚠️ {msg}</p>}
          {state === 'ok' && parts.length > 1 && (
            <div className="chips" style={{ gap: 6, padding: '10px 12px 0' }}>
              <span className="muted" style={{ fontSize: 12 }}>파트</span>
              {parts.map((n, k) => <button key={k} type="button" className={'chip sm' + (part === k ? ' on' : '')} disabled={drawing} onClick={() => redraw(upto, k)}>{n}</button>)}
              <button type="button" className={'chip sm' + (part < 0 ? ' on' : '')} disabled={drawing} onClick={() => redraw(upto, -1)}>전체 ({parts.length})</button>
              {mode === 'admin' && part >= 0 && xmlRef.current && (
                <button type="button" className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={split.busy} onClick={savePart}
                  title="이 파트만 남긴 악보를 새 자료로 저장 (원본은 그대로)">{split.busy ? '저장 중…' : `✂️ ${parts[part]} 파트만 따로 저장`}</button>
              )}
            </div>
          )}
          {split.msg && (
            <p style={{ margin: '8px 12px 0', fontSize: 13, color: split.id ? '#1b5e20' : '#c62828' }}>
              {split.msg}{split.id && <> · <a href={`/score/${split.id}`} target="_blank" rel="noreferrer">새 창에서 보기 ↗</a></>}
            </p>
          )}
          <div ref={box} style={{ padding: '8px 12px' }} />
          {state === 'ok' && total > upto && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '4px 12px 20px' }}>
              <button type="button" className="btn sm" disabled={drawing} onClick={() => redraw(upto + STEP, part)}>{drawing ? '그리는 중…' : `▼ ${STEP}마디 더 보기 (${upto} / ${total}마디)`}</button>
              {total <= 120 && <button type="button" className="btn sm ghost" disabled={drawing} onClick={() => redraw(total, part)}>끝까지</button>}
            </div>
          )}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #eadfd5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <button type="button" className="btn sm ghost" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}>← 이전</button>
          <span className="muted">{mode === 'coach' ? '꺼내 주면 자료실에 바로 올라가요 · 소리·악보 그림은 몇 분 뒤' : 'PC는 ← → 키로 넘겨요 · 공개하면 소리·악보 그림은 몇 분 뒤 만들어져요'}</span>
          <button type="button" className="btn sm ghost" onClick={next} disabled={i >= list.length - 1}>다음 →</button>
        </div>
      </div>
    </div>
  )
}
