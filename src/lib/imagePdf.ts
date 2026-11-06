// 사진(손으로 딴 카피 악보 등) 여러 장 → PDF 한 개 (쪽마다 사진 한 장)
// 자료 화면은 PDF를 바로 그려 주므로, 사진은 PDF로 바꿔서 올림. 서버·추가 라이브러리 없이 브라우저에서 만듦
// 사진은 긴 쪽 2000px 이하로 줄이고 JPEG로 (휴대폰 사진 그대로면 너무 큼)

export const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp)$/i
export const isImageFile = (f: File) => /^image\//.test(f.type) || IMAGE_EXT.test(f.name)

const MAX_SIDE = 2000
const PAGE_W = 595 // A4 너비(pt). 높이는 사진 비율대로

async function toJpeg(f: File): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  let src: ImageBitmap | HTMLImageElement
  try { src = await createImageBitmap(f) } catch {
    // 오래된 사파리: createImageBitmap이 안 되면 <img>로
    src = await new Promise<HTMLImageElement>((ok, no) => {
      const img = new Image(); const u = URL.createObjectURL(f)
      img.onload = () => { URL.revokeObjectURL(u); ok(img) }
      img.onerror = () => { URL.revokeObjectURL(u); no(new Error('사진을 열지 못했어요: ' + f.name)) }
      img.src = u
    })
  }
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width, sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  if (!sw || !sh) throw new Error('사진을 열지 못했어요: ' + f.name)
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h) // 투명 PNG는 흰 바탕으로
  g.drawImage(src, 0, 0, w, h)
  if ('close' in src) src.close()
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('사진을 바꾸지 못했어요: ' + f.name)
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h }
}

export async function imagesToPdf(files: File[], name: string): Promise<File> {
  const pics = []
  for (const f of files) pics.push(await toJpeg(f))
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const put = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length }
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = len
    put(`${n} 0 obj\n`)
    if (typeof body === 'string') put(body); else body()
    put('\nendobj\n')
  }
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  // 객체 번호: 1 카탈로그, 2 쪽 묶음, 그다음 쪽마다 [쪽, 사진, 그리기] 3개
  const pageNo = (i: number) => 3 + i * 3
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pics.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] /Count ${pics.length} >>`)
  pics.forEach((p, i) => {
    const pw = PAGE_W, ph = Math.round(PAGE_W * p.h / p.w)
    const n = pageNo(i)
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`)
    obj(n + 1, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`)
      put(p.bytes)
      put('\nendstream')
    })
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`
    obj(n + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
  })
  const total = 3 + pics.length * 3
  const xref = len
  put(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let n = 1; n < total; n++) put(String(offsets[n]).padStart(10, '0') + ' 00000 n \n')
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new File(parts as BlobPart[], name.replace(/\.[^.]+$/, '') + '.pdf', { type: 'application/pdf' })
}
