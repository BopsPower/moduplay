import { useEffect, useState } from 'react'

// 교재 '쪽 골라 프린트': PDF 파일은 주지 않고, 고른 쪽만 그림으로 그려 프린트 창에 넘김
// - 한 번에 최대 MAX쪽
// - 쪽 아래에 '모두의음악 수업용 · 이름 · 날짜'를 작게 찍음
// - 프린트하는 동안에만 #mp-print-area 를 보이고 나머지 화면은 숨김 (휴대폰 브라우저도 됨)
export const PRINT_MAX = 10

// 화면에서 지금 보고 있는 PDF 쪽 번호 (PdfPages의 #pdfp-N 중 화면 위쪽에 걸친 것)
export function currentPdfPage(): number {
  const els = [...document.querySelectorAll<HTMLElement>('[id^="pdfp-"]')]
  let best = 1
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.top <= innerHeight * 0.4) best = Number(el.id.slice(5)) || best
    else break
  }
  return best
}

async function render(url: string, from: number, to: number, onStep: (n: number) => void) {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
  const urls: string[] = []
  try {
    const d = await task.promise
    for (let n = from; n <= Math.min(to, d.numPages); n++) {
      onStep(n)
      const page = await d.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: Math.min(3, 1500 / v1.width) }) // 폭 1500px 안팎 ≈ A4 180dpi
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width); c.height = Math.round(vp.height)
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      const b = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.9))
      c.width = c.height = 0
      if (b) urls.push(URL.createObjectURL(b))
      page.cleanup()
    }
    return { urls, total: d.numPages }
  } finally { task.destroy() }
}

function printImages(urls: string[], foot: string) {
  document.getElementById('mp-print-area')?.remove()
  const area = document.createElement('div')
  area.id = 'mp-print-area'
  for (const u of urls) {
    const pg = document.createElement('div'); pg.className = 'pp-page'
    const img = document.createElement('img'); img.src = u; img.alt = ''
    const f = document.createElement('div'); f.className = 'pp-foot'; f.textContent = foot
    pg.append(img, f); area.append(pg)
  }
  document.body.append(area)
  document.body.classList.add('mp-printing')
  const done = () => {
    document.body.classList.remove('mp-printing')
    area.remove(); urls.forEach(u => URL.revokeObjectURL(u))
    removeEventListener('afterprint', done)
  }
  addEventListener('afterprint', done)
  Promise.all([...area.querySelectorAll('img')].map(i => i.decode().catch(() => null))).then(() => {
    window.print()
    // afterprint가 안 오는 브라우저 대비: 1분 뒤 정리
    setTimeout(() => { if (document.body.contains(area)) done() }, 60_000)
  })
}

export default function PrintPages({ url, who, onClose }: { url: string; who: string; onClose: () => void }) {
  const [from, setFrom] = useState(() => currentPdfPage())
  const [to, setTo] = useState(() => currentPdfPage())
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const count = to - from + 1
  const bad = !from || !to || from < 1 || to < from || (total != null && to > total)
  const tooMany = count > PRINT_MAX

  useEffect(() => {
    // 전체 쪽 수만 먼저 (파일 전체는 안 받음)
    let live = true
    ;(async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = worker
      const t = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
      try { const d = await t.promise; if (live) setTotal(d.numPages) } catch { /* 몰라도 됨 */ } finally { t.destroy() }
    })()
    return () => { live = false }
  }, [url])

  async function go() {
    if (bad || tooMany) return
    setErr(''); setBusy(from)
    try {
      const { urls } = await render(url, from, to, n => setBusy(n))
      if (!urls.length) throw new Error('empty')
      const d = new Date()
      const date = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
      printImages(urls, ['모두의음악 수업용', who, date].filter(Boolean).join(' · '))
      onClose()
    } catch {
      setErr('프린트할 쪽을 만들지 못했어요. 잠시 뒤 다시 해 주세요.')
    } finally { setBusy(null) }
  }

  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget && busy == null) onClose() }}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="쪽 골라 프린트">
        <b style={{ fontSize: 17 }}>🖨️ 쪽 골라 프린트</b>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>교재는 파일 다운로드가 안 되는 대신, 필요한 쪽만 골라 프린트할 수 있어요. 한 번에 <b>{PRINT_MAX}쪽</b>까지예요.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="number" inputMode="numeric" min={1} max={total ?? undefined} value={from || ''} onChange={e => { const v = num(e.target.value); setFrom(v); if (v > to) setTo(v) }} aria-label="시작 쪽" style={{ width: 80 }} />
          <span>쪽부터</span>
          <input type="number" inputMode="numeric" min={from || 1} max={total ?? undefined} value={to || ''} onChange={e => setTo(num(e.target.value))} aria-label="끝 쪽" style={{ width: 80 }} />
          <span>쪽까지</span>
          {total != null && <span className="muted" style={{ fontSize: 13 }}>(전체 {total}쪽)</span>}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>쪽 번호는 앱 화면 기준이에요 (책에 인쇄된 쪽 번호와 다를 수 있어요). 지금 보고 있던 쪽이 먼저 들어가 있어요.</p>
        {tooMany && <p style={{ margin: 0, fontSize: 13, color: '#b42318' }}>한 번에 {PRINT_MAX}쪽까지 프린트할 수 있어요. 지금 {count}쪽이에요.</p>}
        {err && <p style={{ margin: 0, fontSize: 13, color: '#b42318' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy != null}>닫기</button>
          <button type="button" className="btn primary" onClick={go} disabled={bad || tooMany || busy != null}>
            {busy != null ? `준비 중… ${busy - from + 1}/${count}` : `${bad ? '' : count + '쪽 '}프린트`}
          </button>
        </div>
      </div>
    </div>
  )
}
