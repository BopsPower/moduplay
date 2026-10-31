import { supabase, type Visibility } from './supabase'

export const SCORE_EXT = /\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/i
// 자료로 올릴 수 있는 파일: 악보 + 직접 녹음한 반주·시범 음원
export const MATERIAL_EXT = /\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf|mp3|m4a|wav|aac)$/i
const AUDIO_EXT = /\.(mp3|m4a|wav|aac)$/i
const AUDIO_TYPE: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac' }

export type NewScore = {
  file?: File | null; title: string; composer?: string; category: string; major?: string; tempo?: number | null
  visibility: Visibility; description?: string; createdBy?: string | null
  // 자료 공유
  kind?: string; level?: string | null; artist?: string | null; song?: string | null; tags?: string[]
  viewOnly?: boolean; youtubeUrl?: string | null; ytMarks?: { t: number; label: string }[]; coachMemo?: string | null
}

const kindFromCategory = (c: string) => c === '과제곡' ? '연습곡' : c

// 자료 올리기 → scores 행 만들기.
// PDF·음원은 서버 변환 없이 바로 '완료', 영상만 있는 자료는 파일 없이 저장
export async function uploadScore(n: NewScore): Promise<{ id: string; isPdf: boolean; pages: number | null }> {
  const id = crypto.randomUUID()
  const file = n.file ?? null
  const ext = file ? (file.name.toLowerCase().match(MATERIAL_EXT)?.[1] ?? 'mscz') : null
  const path = file ? `${id}.${ext}` : null
  const isPdf = ext === 'pdf'
  const isAudio = !!file && AUDIO_EXT.test(file.name)
  if (file && path) {
    const up = await supabase.storage.from('scores').upload(path, file, {
      contentType: isPdf ? 'application/pdf' : isAudio ? AUDIO_TYPE[ext!] : 'application/octet-stream',
    })
    if (up.error) throw new Error('파일 업로드에 실패했어요: ' + up.error.message)
  }
  let pages: number | null = null
  if (file && isPdf) {
    try {
      const pdfjs = await import('pdfjs-dist')
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = worker
      const d = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      pages = d.numPages; d.destroy()
    } catch { /* 쪽수는 몰라도 보기는 됨 */ }
  }
  const now = new Date().toISOString()
  const ready = !file ? { convert_status: 'done', converted_at: now, convert_error: '영상 자료' }
    : isPdf ? { convert_status: 'done', pdf_path: path, page_count: pages, converted_at: now, convert_error: 'PDF 원본: 보기·인쇄만 가능 (재생·마디 이동·MIDI 변환 없음)' }
    : isAudio ? { convert_status: 'done', mp3_path: path, converted_at: now, convert_error: '음원 자료' }
    : {}
  const { error } = await supabase.from('scores').insert({
    id, title: n.title.trim(), composer: n.composer?.trim() || null, category: n.category, major: n.major || null,
    tempo: n.tempo ?? null, file_path: path, visibility: n.visibility, description: n.description?.trim() || null,
    created_by: n.createdBy ?? null,
    kind: n.kind ?? kindFromCategory(n.category), level: n.level || null,
    artist: n.artist?.trim() || null, song: n.song?.trim() || null, tags: n.tags ?? [],
    view_only: n.viewOnly ?? n.category === '교재', youtube_url: n.youtubeUrl?.trim() || null,
    yt_marks: n.ytMarks ?? [], coach_memo: n.coachMemo?.trim() || null,
    ...ready,
  })
  if (error) {
    if (path) await supabase.storage.from('scores').remove([path])
    throw new Error('저장하지 못했어요: ' + error.message)
  }
  return { id, isPdf, pages }
}
