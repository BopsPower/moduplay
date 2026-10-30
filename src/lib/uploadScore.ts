import { supabase } from './supabase'

export const SCORE_EXT = /\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/i

export type NewScore = {
  file: File; title: string; composer?: string; category: string; major?: string; tempo?: number | null
  visibility: 'students' | 'assigned' | 'public'; description?: string; createdBy?: string | null
}

// 악보 파일 올리기 → scores 행 만들기. PDF는 서버 변환 없이 바로 '완료'(브라우저에서 바로 보여줌)
export async function uploadScore(n: NewScore): Promise<{ id: string; isPdf: boolean; pages: number | null }> {
  const id = crypto.randomUUID()
  const ext = n.file.name.toLowerCase().match(SCORE_EXT)?.[1] ?? 'mscz'
  const path = `${id}.${ext}`
  const isPdf = ext === 'pdf'
  const up = await supabase.storage.from('scores').upload(path, n.file, { contentType: isPdf ? 'application/pdf' : 'application/octet-stream' })
  if (up.error) throw new Error('파일 업로드에 실패했어요: ' + up.error.message)
  let pages: number | null = null
  if (isPdf) {
    try {
      const pdfjs = await import('pdfjs-dist')
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = worker
      const d = await pdfjs.getDocument({ data: new Uint8Array(await n.file.arrayBuffer()) }).promise
      pages = d.numPages; d.destroy()
    } catch { /* 쪽수는 몰라도 보기는 됨 */ }
  }
  const { error } = await supabase.from('scores').insert({
    id, title: n.title.trim(), composer: n.composer?.trim() || null, category: n.category, major: n.major || null,
    tempo: n.tempo ?? null, file_path: path, visibility: n.visibility, description: n.description?.trim() || null,
    created_by: n.createdBy ?? null,
    ...(isPdf ? { convert_status: 'done', pdf_path: path, page_count: pages, converted_at: new Date().toISOString(),
      convert_error: 'PDF 원본: 보기·인쇄만 가능 (재생·마디 이동·MIDI 변환 없음)' } : {}),
  })
  if (error) { await supabase.storage.from('scores').remove([path]); throw new Error('저장하지 못했어요: ' + error.message) }
  return { id, isPdf, pages }
}
