import { useEffect, useState } from 'react'
import { supabase, type Score } from '../lib/supabase'
import { cacheGet, cacheSet } from '../lib/idbCache'
import { isPdfFile, ytId } from '../lib/materials'

// 자료 표지 그림 (필수 자료 카드)
// - PDF: 첫 쪽을 작게 그려서 씀. 파일 전체를 받지 않고 첫 쪽에 필요한 부분만 받음
// - 한 번 그린 표지는 이 기기에 기억해 두고(다시 안 그림), 관리자가 처음 보면 서버(out/<id>/cover.jpg)에도 올려 둠
//   → 학생들은 작은 그림 파일만 받음
// - 유튜브 자료: 유튜브 미리보기 그림
// - 그 밖의 자료나 실패하면 null → 카드가 기본 표지를 보여 줌

const W = 360 // 그리는 폭(px). 화면에는 110~180px로 보임 → 선명
const mem = new Map<string, string | null>()
let queue: Promise<unknown> = Promise.resolve()
// 휴대폰 메모리를 아끼려고 PDF 표지는 하나씩 차례로 그림
const inTurn = <T,>(job: () => Promise<T>): Promise<T> => { const p = queue.then(job, job); queue = p.catch(() => null); return p }

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b) })

async function drawFirstPage(url: string): Promise<Blob | null> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 256 * 1024 })
  try {
    const d = await task.promise
    const page = await d.getPage(1)
    const v1 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: W / v1.width })
    const c = document.createElement('canvas')
    c.width = Math.round(vp.width); c.height = Math.round(vp.height)
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    return await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.82))
  } finally { task.destroy() }
}

async function loadCover(s: Score, canSave: boolean): Promise<string | null> {
  const yt = !s.file_path ? ytId(s.youtube_url) : null
  if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
  const src = s.pdf_path ?? (isPdfFile(s.file_path) ? s.file_path : null)
  if (!src) return null
  const key = `cover:${s.id}:${src}`
  const kept = await cacheGet<string>(key)
  if (kept) return kept
  // 서버에 올려 둔 표지가 있으면 그걸 받음 (작은 그림 하나)
  if (s.thumb_path) {
    const { data } = await supabase.storage.from('scores').download(s.thumb_path)
    if (data && data.size > 0) { const u = await toDataUrl(data); cacheSet(key, u); return u }
  }
  return inTurn(async () => {
    const { data: sg } = await supabase.storage.from('scores').createSignedUrl(src, 600)
    if (!sg?.signedUrl) return null
    const blob = await drawFirstPage(sg.signedUrl)
    if (!blob) return null
    const u = await toDataUrl(blob)
    cacheSet(key, u)
    if (canSave) {
      // 관리자·올린 사람이 처음 볼 때 한 번만 서버에 올려 둠 (실패해도 화면은 그대로)
      const path = `out/${s.id}/cover.jpg`
      const up = await supabase.storage.from('scores').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!up.error) await supabase.from('scores').update({ thumb_path: path }).eq('id', s.id)
    }
    return u
  })
}

export function useCover(s: Score, canSave: boolean): string | null | undefined {
  const k = s.id + ':' + (s.pdf_path ?? s.file_path ?? s.youtube_url ?? '')
  const [url, setUrl] = useState<string | null | undefined>(() => mem.get(k))
  useEffect(() => {
    if (mem.has(k)) { setUrl(mem.get(k)); return }
    let live = true
    loadCover(s, canSave)
      .catch(() => null)
      .then(u => { mem.set(k, u); if (live) setUrl(u) })
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])
  return url // undefined = 불러오는 중, null = 표지 없음
}
