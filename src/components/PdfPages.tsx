import { useEffect, useRef, useState } from 'react'
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
    document.getElementById(`pdfp-${n}`)?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }

  if (err) return <div className="loading">{err}</div>
  if (!doc) return <div className="loading">PDF를 여는 중…</div>

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
    </>
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
