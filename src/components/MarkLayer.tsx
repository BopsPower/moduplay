import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMarks, drawMarks, hitTest, HL_W, PEN_W, TXT_S, type Mark, type Pen } from '../lib/marks'

// 악보 한 쪽 위에 얹는 투명한 메모 층 (원장님 2026-11-14 "pdf 위에 글을 쓰는 기능")
// - 같은 칸 안의 그림(img/canvas)에 크기·위치를 맞춰 겹침 → 화면 크기가 달라도 같은 자리
// - 쓰기 끔: 눌러도 아래(마디·쪽 넘기기)로 그대로 통과
// - 쓰기 켬: 펜·형광펜·지우개·글자. 애플펜슬을 한 번 쓰면 펜슬=쓰기, 손가락=넘기기
// - 쪽이 화면에서 멀면 그림판을 비워 메모리를 아낌 (500쪽 교재)
export default function MarkLayer({ page }: { page: number }) {
  const mk = useMarks()
  const cv = useRef<HTMLCanvasElement | null>(null)
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null)
  const [near, setNear] = useState(false)
  const live = useRef<Pen | null>(null)
  const erasing = useRef<{ first: boolean } | null>(null)
  const pan = useRef<{ id: number; y: number; x: number } | null>(null)
  const raf = useRef(0)
  const [txt, setTxt] = useState<{ x: number; y: number; v: string } | null>(null)

  const layers = mk?.enabled ? mk.layersFor(page) : []
  const any = layers.some(l => l.marks.length)
  const active = !!mk?.enabled && (any || mk.drawing)

  // 같은 칸의 악보 그림에 맞춰 위치·크기
  useLayoutEffect(() => {
    if (!active) return
    const me = cv.current?.parentElement ?? null
    const host = me?.parentElement
    if (!host) return
    const find = () => [...host.children].find(e => (e.tagName === 'IMG' || e.tagName === 'CANVAS') && !e.classList.contains('mark-cv')) as HTMLElement | undefined
    const fit = () => {
      const t = find(); if (!t) return
      setBox(b => (b && b.l === t.offsetLeft && b.t === t.offsetTop && b.w === t.offsetWidth && b.h === t.offsetHeight) ? b : { l: t.offsetLeft, t: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host); const t = find(); if (t) ro.observe(t)
    const mo = new MutationObserver(() => { fit(); const t2 = find(); if (t2) ro.observe(t2) })
    mo.observe(host, { childList: true, attributes: true, subtree: false })
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '800px 0px' })
    io.observe(host)
    window.addEventListener('resize', fit)
    host.addEventListener('load', fit, true) // 악보 그림이 다 받아지면 크기 다시 (관찰자가 늦을 때 대비)
    return () => { ro.disconnect(); mo.disconnect(); io.disconnect(); window.removeEventListener('resize', fit); host.removeEventListener('load', fit, true) }
  }, [active])

  // 그리기
  const paint = () => {
    const c = cv.current
    if (!c || !box) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.round(box.w * dpr), H = Math.round(box.h * dpr)
    if (!near) { if (c.width) { c.width = 0; c.height = 0 } return }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const ctx = c.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    for (const l of layers) drawMarks(ctx, l.marks, W, H)
    if (live.current) drawMarks(ctx, [live.current], W, H)
  }
  useEffect(paint)

  if (!mk || !active) return null
  const edit = layers.find(l => l.editable)
  const drawing = mk.drawing && !!edit

  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), ratio: r.height / r.width }
  }
  const scrollParent = (el: HTMLElement | null): HTMLElement | Window => {
    for (let p = el?.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p
    }
    return window
  }
  const later = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(paint) }
  const eraseAt = (x: number, y: number, ratio: number) => {
    if (!edit) return
    const hits = hitTest(edit.marks, x, y, ratio)
    if (!hits.length) return
    mk.setPage(page, edit.marks.filter((_, i) => !hits.includes(i)), !!erasing.current?.first)
    if (erasing.current) erasing.current.first = false
  }

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || txt) return
    if (e.pointerType === 'pen') mk.notePen()
    // 펜슬을 쓰는 기기: 손가락은 넘기기 (보면대 화면은 쪽 넘김 손짓에 맡김)
    // 두 번째 손가락이 닿으면: 쓰던 선을 취소하고 두 손가락으로 화면 밀기
    if (e.pointerType === 'touch' && (mk.penSeen || live.current || erasing.current)) {
      if (live.current) { live.current = null; later() }
      erasing.current = null
      pan.current = { id: e.pointerId, y: e.clientY, x: e.clientX }
      return
    }
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 이미 끝난 포인터 */ }
    const { x, y, ratio } = pos(e)
    if (mk.tool === 'eraser') { erasing.current = { first: true }; eraseAt(x, y, ratio); return }
    if (mk.tool === 'text') return // 손을 뗄 때 글자 칸
    const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5
    live.current = { k: mk.tool === 'hl' ? 'h' : 'p', c: mk.color, w: mk.tool === 'hl' ? HL_W : PEN_W, pts: [r4(x), r4(y), r2(pr)] }
    later()
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current && e.pointerId === pan.current.id) {
      const dy = e.clientY - pan.current.y
      pan.current.y = e.clientY
      if (!e.currentTarget.closest('.focus')) { const sp = scrollParent(e.currentTarget); sp.scrollBy(0, -dy) }
      else { const sp = scrollParent(e.currentTarget); if (sp !== window) sp.scrollBy(0, -dy) }
      return
    }
    if (!drawing) return
    if (erasing.current) { const { x, y, ratio } = pos(e); eraseAt(x, y, ratio); return }
    const s = live.current; if (!s) return
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    const r = cv.current!.getBoundingClientRect()
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
      const n = s.pts.length
      const dx = x - s.pts[n - 3], dy = (y - s.pts[n - 2]) * (r.height / r.width)
      if (dx * dx + dy * dy < 0.0012 * 0.0012) continue // 너무 촘촘한 점은 건너뜀 (저장 크기)
      s.pts.push(r4(x), r4(y), r2(ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5))
    }
    later()
  }
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pan.current && e.pointerId === pan.current.id) { pan.current = null; return }
    if (!drawing) return
    if (erasing.current) { erasing.current = null; return }
    if (mk.tool === 'text' && e.type === 'pointerup') { const { x, y } = pos(e); setTxt({ x, y, v: '' }); return }
    const s = live.current; live.current = null
    if (s && edit) mk.setPage(page, [...edit.marks, s])
    later()
  }
  const commitText = () => {
    const t = txt; setTxt(null)
    if (!t || !t.v.trim() || !edit) return
    const m: Mark = { k: 't', c: mk.color, s: TXT_S, x: r4(t.x), y: r4(t.y), v: t.v.trim().slice(0, 200) }
    mk.setPage(page, [...edit.marks, m])
  }

  return (
    <div className="mark-wrap" style={box ? { left: box.l, top: box.t, width: box.w, height: box.h } : { display: 'none' }}>
      <canvas ref={cv} className={'mark-cv' + (drawing ? ' on' : '') + (drawing && mk.tool === 'eraser' ? ' erase' : '')}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        aria-hidden="true" />
      {txt && (
        <input className="mark-txt" autoFocus value={txt.v} placeholder="글자 쓰기"
          style={{ left: `${txt.x * 100}%`, top: `${txt.y * 100}%`, color: mk.color, fontSize: Math.max(12, TXT_S * (box?.w ?? 600)) }}
          onChange={e => setTxt(t => t && { ...t, v: e.target.value })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitText() } else if (e.key === 'Escape') setTxt(null) }}
          onBlur={commitText} />
      )}
    </div>
  )
}

const r4 = (v: number) => Math.round(v * 10000) / 10000
const r2 = (v: number) => Math.round(v * 100) / 100
