import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { logError } from './errorLog'

// 악보·PDF 위에 쓰기 (원장님 2026-11-14 "pdf 위에 글을 쓰는 기능" → 내 메모(본인만) + 코치가 학생에게 쓰는 표시)
// - 저장: 표 score_marks 한 줄 = 한 사람 · 한 악보 · 한 쪽 · (내 메모 | 어떤 학생에게)
// - 좌표는 쪽 크기 기준 비율(0~1) → 폰·태블릿·PC 어디서 열어도 같은 자리
// - 원본 파일은 건드리지 않음

export type Pen = { k: 'p' | 'h'; c: string; w: number; pts: number[] } // pts = [x, y, 누르는 힘, x, y, 힘, …]
export type Txt = { k: 't'; c: string; s: number; x: number; y: number; v: string }
export type Mark = Pen | Txt
export type Tool = 'pen' | 'hl' | 'eraser' | 'text'

type Row = { page: number; owner_id: string; for_student: string | null; strokes: Mark[]; author_name: string | null }
// 층(layer) 이름: 'me' = 내 메모, 's:<학생id>' = 내가 그 학생에게 쓰는 표시, 'c:<코치 user id>' = 코치가 나에게 쓴 표시(보기만)
export type LayerKey = string
type Pages = Record<number, Mark[]>

export const COLORS = ['#e5322d', '#1f6feb', '#111111', '#16a34a', '#f5c400'] as const
export const PEN_W = 0.0028, HL_W = 0.016, TXT_S = 0.03

type Ctx = {
  enabled: boolean                 // 로그인한 사람만
  drawing: boolean; setDrawing: (v: boolean) => void
  tool: Tool; setTool: (t: Tool) => void
  color: string; setColor: (c: string) => void
  target: LayerKey; setTarget: (k: LayerKey) => void   // 지금 쓰는 층
  show: boolean; setShow: (v: boolean) => void         // 내 메모·내가 쓴 표시 보이기
  showCoach: boolean; setShowCoach: (v: boolean) => void
  penSeen: boolean; notePen: () => void                // 애플펜슬을 한 번이라도 쓰면: 펜슬=쓰기, 손가락=넘기기
  layersFor: (page: number) => { key: LayerKey; marks: Mark[]; editable: boolean }[]
  coachNames: { key: LayerKey; name: string }[]
  setPage: (page: number, marks: Mark[], undoable?: boolean) => void
  undo: () => void; canUndo: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  hasAny: boolean
}
const C = createContext<Ctx | null>(null)
export const useMarks = () => useContext(C)

const keyOf = (r: { owner_id: string; for_student: string | null }, me: string) =>
  r.owner_id === me ? (r.for_student ? 's:' + r.for_student : 'me') : 'c:' + r.owner_id

export function MarksProvider({ scoreId, children }: { scoreId: string | null | undefined; children: ReactNode }) {
  const { session } = useAuth()
  const me = session?.user.id ?? null
  const enabled = !!(me && scoreId)
  const [layers, setLayers] = useState<Record<LayerKey, Pages>>({})
  const [names, setNames] = useState<Record<LayerKey, string>>({})
  const [drawing, setDrawing] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState<string>(COLORS[0])
  const [target, setTarget] = useState<LayerKey>('me')
  const [show, setShow] = useState(true)
  const [showCoach, setShowCoach] = useState(true)
  const [penSeen, setPenSeen] = useState(false)
  const [status, setStatus] = useState<Ctx['status']>('idle')
  const [ready, setReady] = useState(false) // 표를 읽어 왔을 때만 쓰기 단추를 보임 (표가 아직 없으면 숨김)
  const undoStack = useRef<{ key: LayerKey; page: number; prev: Mark[] }[]>([])
  const [undoN, setUndoN] = useState(0)
  const dirty = useRef(new Map<string, { key: LayerKey; page: number }>())
  const timer = useRef<number | null>(null)
  const layersRef = useRef(layers)
  layersRef.current = layers

  // 불러오기: 내가 쓴 것 전부 + 코치가 나에게 쓴 것 (권한은 DB가 거름)
  useEffect(() => {
    setLayers({}); setNames({}); undoStack.current = []; setUndoN(0); setReady(false)
    if (!enabled) return
    let alive = true
    supabase.from('score_marks').select('page, owner_id, for_student, strokes, author_name').eq('score_id', scoreId!).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (!/score_marks/.test(error.message)) logError('marks load', error.message); return } // 표가 아직 없으면 조용히 (쓰기 단추 숨김)
      setReady(true)
      const L: Record<LayerKey, Pages> = {}, N: Record<LayerKey, string> = {}
      for (const r of (data ?? []) as Row[]) {
        const k = keyOf(r, me!)
        ;(L[k] ??= {})[r.page] = Array.isArray(r.strokes) ? r.strokes : []
        if (k.startsWith('c:')) N[k] = r.author_name || '코치'
      }
      setLayers(L); setNames(N)
    })
    return () => { alive = false }
  }, [enabled, scoreId, me])

  const flush = useCallback(async () => {
    if (!enabled || !dirty.current.size) return
    const items = [...dirty.current.values()]; dirty.current.clear()
    setStatus('saving')
    const rows = items.map(({ key, page }) => ({
      score_id: scoreId!, page, owner_id: me!,
      for_student: key.startsWith('s:') ? key.slice(2) : null,
      strokes: layersRef.current[key]?.[page] ?? [],
    }))
    const { error } = await supabase.from('score_marks').upsert(rows, { onConflict: 'score_id,page,owner_id,for_student' })
    if (error) {
      for (const it of items) dirty.current.set(it.key + '|' + it.page, it) // 다음에 다시
      setStatus('error'); logError('marks save', error.message)
    } else setStatus(dirty.current.size ? 'saving' : 'saved')
  }, [enabled, scoreId, me])

  // 화면을 떠나거나 앱을 내릴 때 남은 것 저장
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'hidden') void flush() }
    document.addEventListener('visibilitychange', f)
    return () => { document.removeEventListener('visibilitychange', f); void flush() }
  }, [flush])

  const setPage = useCallback((page: number, marks: Mark[], undoable = true) => {
    const key = target
    if (key.startsWith('c:')) return // 코치 표시는 보기만
    const prev = layersRef.current[key]?.[page] ?? []
    if (undoable) { undoStack.current.push({ key, page, prev }); if (undoStack.current.length > 60) undoStack.current.shift(); setUndoN(undoStack.current.length) }
    setLayers(L => ({ ...L, [key]: { ...(L[key] ?? {}), [page]: marks } }))
    dirty.current.set(key + '|' + page, { key, page })
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void flush() }, 900)
  }, [target, flush])

  const undo = useCallback(() => {
    const u = undoStack.current.pop(); setUndoN(undoStack.current.length)
    if (!u) return
    setLayers(L => ({ ...L, [u.key]: { ...(L[u.key] ?? {}), [u.page]: u.prev } }))
    dirty.current.set(u.key + '|' + u.page, { key: u.key, page: u.page })
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void flush() }, 600)
  }, [flush])

  const layersFor = useCallback((page: number) => {
    const out: { key: LayerKey; marks: Mark[]; editable: boolean }[] = []
    if (showCoach) for (const k of Object.keys(layers)) if (k.startsWith('c:') && layers[k][page]?.length) out.push({ key: k, marks: layers[k][page], editable: false })
    if (show || drawing) out.push({ key: target, marks: layers[target]?.[page] ?? [], editable: true })
    return out
  }, [layers, show, showCoach, target, drawing])

  const value = useMemo<Ctx>(() => ({
    enabled: enabled && ready, drawing, setDrawing: (v: boolean) => { setDrawing(v); if (!v) void flush() },
    tool, setTool, color, setColor,
    target, setTarget: (k: LayerKey) => { void flush(); setTarget(k); undoStack.current = []; setUndoN(0) },
    show, setShow, showCoach, setShowCoach,
    penSeen, notePen: () => setPenSeen(true),
    layersFor,
    coachNames: Object.entries(names).map(([key, name]) => ({ key, name })),
    setPage, undo, canUndo: undoN > 0, status,
    hasAny: Object.values(layers).some(p => Object.values(p).some(m => m.length)),
  }), [enabled, ready, drawing, tool, color, target, show, showCoach, penSeen, layersFor, names, setPage, undo, undoN, status, layers, flush])

  return <C.Provider value={value}>{children}</C.Provider>
}

// ── 그리기 도우미 ──
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], W: number, H: number) {
  // 형광펜 먼저(아래), 그다음 펜, 글자
  for (const m of marks) if (m.k === 'h') strokePen(ctx, m, W, H)
  for (const m of marks) if (m.k === 'p') strokePen(ctx, m, W, H)
  for (const m of marks) if (m.k === 't') drawText(ctx, m, W, H)
}

export function strokePen(ctx: CanvasRenderingContext2D, m: Pen, W: number, H: number, from = 0) {
  const p = m.pts, n = p.length / 3
  ctx.save()
  ctx.strokeStyle = m.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (m.k === 'h') {
    ctx.globalAlpha = 0.32
    ctx.lineWidth = m.w * W
    ctx.beginPath()
    for (let i = 0; i < n; i++) { const x = p[i * 3] * W, y = p[i * 3 + 1] * H; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
    if (n === 1) ctx.lineTo(p[0] * W + 0.1, p[1] * H)
    ctx.stroke()
  } else {
    // 누르는 힘에 따라 굵기를 조금씩 (애플펜슬)
    if (n === 1) { ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, m.w * W * (0.5 + p[2] * 0.6), 0, Math.PI * 2); ctx.fill() }
    for (let i = Math.max(1, from); i < n; i++) {
      ctx.lineWidth = m.w * W * (0.55 + 0.9 * ((p[i * 3 - 1] + p[i * 3 + 2]) / 2))
      ctx.beginPath(); ctx.moveTo(p[i * 3 - 3] * W, p[i * 3 - 2] * H); ctx.lineTo(p[i * 3] * W, p[i * 3 + 1] * H); ctx.stroke()
    }
  }
  ctx.restore()
}

export function drawText(ctx: CanvasRenderingContext2D, m: Txt, W: number, H: number) {
  ctx.save()
  ctx.fillStyle = m.c
  ctx.font = `700 ${Math.max(9, m.s * W)}px Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`
  ctx.textBaseline = 'top'
  m.v.split('\n').forEach((line, i) => ctx.fillText(line, m.x * W, m.y * H + i * m.s * W * 1.2))
  ctx.restore()
}

// 지우개: 그 자리를 지나는 선·글자를 통째로 지움
export function hitTest(marks: Mark[], x: number, y: number, ratio: number, r = 0.014): number[] {
  const hits: number[] = []
  const ry = r / ratio // 세로 좌표는 쪽 높이 기준이라 같은 거리로 맞춤
  marks.forEach((m, i) => {
    if (m.k === 't') {
      const lines = m.v.split('\n'), w = Math.max(...lines.map(l => l.length)) * m.s * 0.9, h = lines.length * m.s * 1.2 / ratio
      if (x >= m.x - r && x <= m.x + w + r && y >= m.y - ry && y <= m.y + h + ry) hits.push(i)
      return
    }
    // 점 사이 선분까지의 거리로 판단 (점이 듬성듬성해도 잘 지워지게)
    const p = m.pts, rr = r + m.w / 2, py = y * ratio
    for (let j = 0; j < p.length; j += 3) {
      const ax = p[j], ay = p[j + 1] * ratio
      const bx = j + 3 < p.length ? p[j + 3] : ax, by = j + 3 < p.length ? p[j + 4] * ratio : ay
      const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (py - ay) * vy) / L)) : 0
      const dx = ax + t * vx - x, dy = ay + t * vy - py
      if (dx * dx + dy * dy <= rr * rr) { hits.push(i); return }
    }
  })
  return hits
}
