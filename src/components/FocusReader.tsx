import { useCallback, useEffect, useRef, useState } from 'react'

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> }

// 악보만 크게 보기: 화면 가득 한 쪽씩 (가로로 넓은 화면은 두 쪽 펼침, 보면대처럼)
// - ◀ ▶ 버튼, 키보드 ←/→·PageUp/PageDown·스페이스, 화면 좌우 터치, 손가락으로 밀기
// - 페달식 넘김기(블루투스 페이지 터너)도 대부분 ←/→ 또는 PageUp/PageDown 키라 그대로 동작
export default function FocusReader({ images, pdfUrl, title, onClose }: { images?: string[]; pdfUrl?: string | null; title: string; onClose: () => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null)
  const [count, setCount] = useState(images?.length ?? 0)
  const [page, setPage] = useState(1) // 왼쪽(또는 한 쪽) 페이지 번호
  const [wide, setWide] = useState(false)
  const [short, setShort] = useState(false) // 휴대폰 가로: 화면 높이가 낮아 한 쪽 전체를 넣으면 너무 작음 → 폭에 맞추고 위아래로 스크롤
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const [err, setErr] = useState('')
  const boxRef = useRef<HTMLDivElement | null>(null)
  const touchX = useRef<number | null>(null)

  // 가로가 충분히 넓으면 두 쪽 펼침
  useEffect(() => {
    const f = () => {
      const w = window.innerWidth, h = window.innerHeight
      setShort(h < 520 && w > h)
      setWide(w > h * 1.15 && w >= 900 && h >= 600) // 두 쪽 펼침은 높이가 충분할 때만 (아이패드 가로)
    }
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f)
  }, [])
  const step = wide ? 2 : 1

  // PDF는 pdf.js로 (필요할 때만 불러옴)
  useEffect(() => {
    if (images || !pdfUrl) return
    let alive = true
    let task: any
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        task = pdfjs.getDocument({ url: pdfUrl, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
        const d = await task.promise
        if (alive) { setDoc(d); setCount(d.numPages) }
      } catch { if (alive) setErr('악보를 열지 못했어요.') }
    })()
    return () => { alive = false; task?.destroy?.() }
  }, [pdfUrl, images])

  const go = useCallback((d: number) => setPage(p => Math.min(Math.max(1, p + d * step), Math.max(1, count - (step - 1)))), [step, count])

  // 키보드
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(1) }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'Home') setPage(1)
      else if (e.key === 'End') setPage(Math.max(1, count - (step - 1)))
    }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [go, onClose, count, step])

  // 전체 화면 (되는 기기만)
  useEffect(() => {
    const el = boxRef.current as any
    try { el?.requestFullscreen?.().catch(() => {}) } catch { /* 안 되면 창 안에서 크게 */ }
    return () => { try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) } catch { /* 무시 */ } }
  }, [])

  const shown = [page, ...(wide && page + 1 <= count ? [page + 1] : [])]
  // 폭 맞춤(휴대폰 가로)에서 쪽을 넘기면 그 쪽 맨 위부터
  useEffect(() => { if (short) pagesRef.current?.scrollTo({ top: 0 }) }, [page, short])

  return (
    <div ref={boxRef} className={'focus' + (short ? ' short' : '')} role="dialog" aria-label={`${title} 악보 크게 보기`}
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) }}>
      <div className="focus-bar">
        <span className="t">{title}</span>
        <span className="n">{count ? `${shown.join('–')} / ${count}쪽` : '불러오는 중…'}</span>
        <button type="button" className="x" onClick={onClose} aria-label="닫기">✕ 닫기</button>
      </div>
      <div className="focus-pages" ref={pagesRef}>
        {err ? <p style={{ color: '#fff' }}>{err}</p> : shown.map(n => (
          <div key={n} className="focus-page">
            {images ? <img src={images[n - 1]} alt={`${title} ${n}쪽`} /> : doc ? <PdfCanvas key={short ? 'w' : 'f'} doc={doc} n={n} title={title} fitWidth={short} /> : null}
          </div>
        ))}
        {/* 화면 왼쪽/오른쪽 끝을 누르면 넘김 */}
        {!short && <>
          <button type="button" className="focus-tap l" aria-label="이전 쪽" onClick={() => go(-1)} disabled={page <= 1} />
          <button type="button" className="focus-tap r" aria-label="다음 쪽" onClick={() => go(1)} disabled={page + step > count} />
        </>}
      </div>
      <div className="focus-nav">
        <button type="button" onClick={() => go(-1)} disabled={page <= 1}>◀ 이전</button>
        <input type="range" min={1} max={Math.max(1, count)} value={page} onChange={e => setPage(Number(e.target.value))} aria-label="쪽 이동" />
        <button type="button" onClick={() => go(1)} disabled={page + step > count}>다음 ▶</button>
      </div>
    </div>
  )
}

// PDF 한 쪽을 화면 크기에 맞춰 그림
function PdfCanvas({ doc, n, title, fitWidth }: { doc: PdfDoc; n: number; title: string; fitWidth?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let alive = true, task: any
    doc.getPage(n).then((pg: any) => {
      const c = ref.current
      if (!alive || !c || !c.parentElement) return
      const box = c.parentElement.getBoundingClientRect()
      const base = pg.getViewport({ scale: 1 })
      const fit = fitWidth ? box.width / base.width : Math.min(box.width / base.width, box.height / base.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vp = pg.getViewport({ scale: fit * dpr })
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      c.style.width = `${Math.floor(vp.width / dpr)}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`
      task = pg.render({ canvasContext: c.getContext('2d'), viewport: vp })
      task.promise.catch(() => {})
    })
    return () => { alive = false; task?.cancel?.() }
  }, [doc, n, fitWidth])
  return <canvas ref={ref} role="img" aria-label={`${title} ${n}쪽`} />
}
