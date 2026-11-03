import { useEffect, useRef, useState } from 'react'
import MusicLoader from './MusicLoader'
import ToTop from './ToTop'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type PDFDocumentProxy = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
type RenderTask = { cancel(): void; promise: Promise<unknown> }

// PDF 악보를 브라우저에서 바로 보여줌.
// - 서버에서 페이지 그림을 미리 만들지 않음 → 올리자마자 볼 수 있음
// - 파일 전체를 받지 않고, 지금 보는 쪽 근처만 조금씩 받아서 그림 (500쪽 책도 첫 화면이 빠름)
// - 화면에서 멀어진 쪽은 그림을 지워 휴대폰 메모리를 아낌
export default function PdfPages({ url, title }: { url: string; title: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [ratio, setRatio] = useState(1.414)
  const [err, setErr] = useState('')
  const [jump, setJump] = useState('')

  useEffect(() => {
    setDoc(null); setErr('')
    const task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
    let alive = true
    task.promise.then(async d => {
      const v = (await d.getPage(1)).getViewport({ scale: 1 })
      if (!alive) return
      setRatio(v.height / v.width); setDoc(d)
    }).catch(() => alive && setErr('PDF를 열지 못했어요. 다운로드해서 열어 주세요.'))
    return () => { alive = false; task.destroy() }
  }, [url])

  function go(e?: React.FormEvent) {
    e?.preventDefault()
    const n = Math.max(1, Math.min(doc?.numPages ?? 1, Number(jump) || 1))
    jumpTo(n)
  }

  if (err) return <div className="loading">{err}</div>
  if (!doc) return <MusicLoader label="PDF를 여는 중" />

  return (
    <>
      {doc.numPages > 3 && (
        <form onSubmit={go} className="pdf-jump">
          <span className="muted">전체 {doc.numPages}쪽</span>
          <input type="number" min={1} max={doc.numPages} inputMode="numeric" value={jump} onChange={e => setJump(e.target.value)} placeholder="쪽" aria-label="이동할 쪽" />
          <button className="btn sm">이동</button>
        </form>
      )}
      {Array.from({ length: doc.numPages }, (_, i) => <PdfPage key={i} doc={doc} n={i + 1} ratio={ratio} total={doc.numPages} title={title} />)}
      {doc.numPages > 3 && <Scrubber total={doc.numPages} />}
      <ToTop after={1200} />
    </>
  )
}

// n쪽으로 바로 이동 (위쪽에 붙어 있는 '쪽 이동' 막대에 가리지 않게 조금 띄움)
function jumpTo(n: number) {
  const el = document.getElementById(`pdfp-${n}`)
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: 'auto' })
}

// 오른쪽 손잡이: PDF를 보는 동안 늘 보임(가만히 있으면 흐리게), 손가락으로 위아래로 끌면 그 쪽으로 바로 감 (긴 교재에서 빠르게)
function Scrubber({ total }: { total: number }) {
  const [cur, setCur] = useState(1)
  const [show, setShow] = useState(false) // PDF 쪽들이 화면에 있음
  const [act, setAct] = useState(false) // 방금 스크롤함 → 진하게
  const [drag, setDrag] = useState(false)
  const rail = useRef<HTMLDivElement | null>(null)
  const hideT = useRef(0)
  const raf = useRef(0)
  const dragging = useRef(false)

  // 지금 보는 쪽: 화면 위쪽 30% 지점에 걸친 쪽 (쪽이 많아도 빠르게 반씩 나눠 찾음)
  const findCur = () => {
    const y = innerHeight * 0.3
    let lo = 1, hi = total, ans = 1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      const el = document.getElementById(`pdfp-${m}`)
      if (!el) break
      if (el.getBoundingClientRect().top <= y) { ans = m; lo = m + 1 } else hi = m - 1
    }
    return ans
  }
  // PDF 쪽들이 화면에 있을 때만
  const inView = () => {
    const a = document.getElementById('pdfp-1'), b = document.getElementById(`pdfp-${total}`)
    if (!a || !b) return false
    return a.getBoundingClientRect().top < innerHeight * 0.6 && b.getBoundingClientRect().bottom > innerHeight * 0.4
  }

  useEffect(() => {
    const on = () => {
      if (raf.current) return
      raf.current = requestAnimationFrame(() => {
        raf.current = 0
        const v = inView()
        setShow(v || dragging.current)
        if (v && !dragging.current) setCur(findCur())
        setAct(true)
        clearTimeout(hideT.current)
        if (!dragging.current) hideT.current = window.setTimeout(() => setAct(false), 2000)
      })
    }
    on()
    addEventListener('scroll', on, { passive: true })
    return () => { removeEventListener('scroll', on); clearTimeout(hideT.current); cancelAnimationFrame(raf.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  const pageAt = (clientY: number) => {
    const r = rail.current?.getBoundingClientRect()
    if (!r) return cur
    const f = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    return Math.round(f * (total - 1)) + 1
  }
  const move = (clientY: number) => {
    const n = pageAt(clientY)
    setCur(n); jumpTo(n)
  }

  const f = total > 1 ? (cur - 1) / (total - 1) : 0
  return (
    <div ref={rail} className={'pdf-scrub' + (show || drag ? ' on' : '') + (act || drag ? ' act' : '')} aria-hidden={!(show || drag)}>
      <div
        className={'pdf-scrub-thumb' + (drag ? ' drag' : '')}
        style={{ top: `calc(${f * 100}% - ${f * 44}px)` }}
        role="slider" aria-label="쪽 빠르게 넘기기" aria-valuemin={1} aria-valuemax={total} aria-valuenow={cur}
        onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); dragging.current = true; setDrag(true); clearTimeout(hideT.current) }}
        onPointerMove={e => { if (dragging.current) move(e.clientY) }}
        onPointerUp={e => { dragging.current = false; setDrag(false); e.currentTarget.releasePointerCapture?.(e.pointerId); hideT.current = window.setTimeout(() => setAct(false), 2000) }}
        onPointerCancel={() => { dragging.current = false; setDrag(false) }}
      >
        <span className="pdf-scrub-n">{cur}<small> / {total}쪽</small></span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
      </div>
    </div>
  )
}

function PdfPage({ doc, n, ratio, total, title }: { doc: PDFDocumentProxy; n: number; ratio: number; total: number; title: string }) {
  const box = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const [near, setNear] = useState(false)
  const [r, setR] = useState(ratio)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!near || !c || !box.current) {
      if (c) { c.width = 0; c.height = 0 } // 멀어진 쪽은 비움
      return
    }
    let task: RenderTask | null = null
    let alive = true
    doc.getPage(n).then(page => {
      if (!alive || !box.current) return
      const base = page.getViewport({ scale: 1 })
      setR(base.height / base.width)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (box.current.clientWidth * dpr) / base.width
      const vp = page.getViewport({ scale })
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp })
      task.promise.catch(() => {})
    })
    return () => { alive = false; task?.cancel() }
  }, [near, doc, n])

  return (
    <div id={`pdfp-${n}`} ref={box} className="page" style={{ position: 'relative', aspectRatio: `1 / ${r}`, background: '#fff', border: '1px solid var(--line)' }}>
      <canvas ref={canvas} role="img" aria-label={`${title} ${n}쪽`} style={{ width: '100%', height: '100%', display: 'block' }} />
      <span className="muted" style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 11 }}>{n} / {total}</span>
    </div>
  )
}
