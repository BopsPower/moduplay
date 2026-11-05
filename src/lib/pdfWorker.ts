// PDF 화면들이 pdf.js 일꾼(Worker) 하나를 같이 씀 (2026-11-05)
// 전에는 PDF를 열 때마다 일꾼을 새로 만들고 닫아서, 아이패드에서 PDF를 왔다갔다 하면 메모리가 크게 출렁였음
// ('Worker was terminated' 오류도 이것). 일꾼을 같이 쓰면 문서만 닫히고 일꾼은 남음
type PdfJs = { PDFWorker: new (o?: { name?: string }) => { destroyed?: boolean } }
let shared: { destroyed?: boolean } | null = null

export function sharedPdfWorker(pdfjs: unknown) {
  try {
    if (!shared || shared.destroyed) shared = new (pdfjs as PdfJs).PDFWorker({ name: 'moduplay-pdf' })
    return shared as never
  } catch { shared = null; return undefined }
}
