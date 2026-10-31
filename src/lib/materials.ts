// 자료 공유 공통 도우미
import { supabase, type Score } from './supabase'

// 예전 자료(종류 칸이 비어 있음)는 악보 분류로 종류를 정함
const LEGACY_KIND: Record<string, string> = {
  '카피': '카피 악보', '릭': '연습 악보', '리듬': '연습 악보', '초견': '연습 악보', '보이싱·이론': '정리표',
  '편곡': '곡 악보', '연습곡': '곡 악보', '과제곡': '곡 악보',
}
export function kindOf(s: Pick<Score, 'kind' | 'category'> & Partial<Pick<Score, 'file_path' | 'youtube_url'>>): string {
  if (!s.kind && s.file_path === null && s.youtube_url) return '시범 영상'
  const k = s.kind || s.category || '기타'
  return LEGACY_KIND[k] ?? k
}

export const isVideoOnly = (s: Pick<Score, 'file_path' | 'youtube_url'>) => !s.file_path && !!s.youtube_url
export const isAudioFile = (p?: string | null) => !!p && /\.(mp3|m4a|wav|aac|ogg)$/i.test(p)
export const isPdfFile = (p?: string | null) => !!p && /\.pdf$/i.test(p)

/** 코치 이름 표시: 이름만 있으면 "○○ 코치", 이미 직함·센터명이면 그대로 */
export function coachLabel(name?: string | null) {
  const n = (name ?? '').trim()
  if (!n) return '코치'
  return /(코치|원장|선생님|쌤|피디|PD|센터|음악|학원)$/i.test(n) ? n : `${n} 코치`
}
/** 올린 사람 표시: "정한결 코치" / "김○○" */
export function uploaderLabel(s: Pick<Score, 'uploader_role' | 'uploader_name'>) {
  if (s.uploader_role === 'student') return s.uploader_name || '학생'
  return coachLabel(s.uploader_name)
}

export const VIS_LABEL: Record<string, string> = {
  students: '학원 전체', public: '학원 전체', mine: '내 학생만', selected: '고른 학생만', coaches: '코치끼리만', assigned: '과제 받은 학생',
}

// 유튜브 주소 → 영상 id (youtu.be, watch?v=, shorts, embed, live)
export function ytId(url?: string | null): string | null {
  if (!url) return null
  const u = url.trim()
  const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(u) ? u : null)
}
// 주소에 붙은 시작 시각(t=90, t=1m30s)
export function ytStart(url?: string | null): number {
  const m = url?.match(/[?&](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/)
  if (!m) return 0
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
}

export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
/** "1:05" · "65" · "1:02:03" → 초 */
export function parseTime(t: string): number | null {
  const p = t.trim().split(':').map(x => x.trim())
  if (!p.length || p.some(x => !/^\d+$/.test(x))) return null
  return p.reduce((a, x) => a * 60 + parseInt(x), 0)
}
/** 구간 표시 글 → [{t, label}]. 한 줄에 "0:42 기타 솔로 시작" */
export function parseMarks(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d+(?::\d{1,2}){0,2})\s*[-–—·]?\s*(.*)$/)
    const t = m ? parseTime(m[1]) : null
    return t == null ? null : { t, label: (m![2] || '').slice(0, 80) }
  }).filter(Boolean).sort((a, b) => a!.t - b!.t) as { t: number; label: string }[]
}
export const marksToText = (marks?: { t: number; label: string }[] | null) => (marks ?? []).map(m => `${fmtTime(m.t)} ${m.label}`).join('\n')

export const parseTags = (s: string) => [...new Set(s.split(/[,#\n]/).map(x => x.trim()).filter(Boolean))].slice(0, 10)

export const dateLabel = (iso?: string) => iso ? iso.slice(0, 10).replace(/-/g, '.') : ''
export function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return '방금'
  if (d < 3600) return `${Math.floor(d / 60)}분 전`
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}일 전`
  return dateLabel(iso)
}

// 내 보관함
export async function myBookmarks(): Promise<Set<string>> {
  const { data } = await supabase.from('score_bookmarks').select('score_id')
  return new Set((data ?? []).map(r => r.score_id as string))
}
export async function setBookmark(scoreId: string, on: boolean) {
  if (on) return supabase.from('score_bookmarks').upsert({ score_id: scoreId }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })
  return supabase.from('score_bookmarks').delete().eq('score_id', scoreId)
}

/** 목록에 보일 자료: 가려진 자료는 코치 화면(라운지)에서만 */
export function listable(s: Score, isTeacher: boolean) {
  return !s.hidden && (isTeacher || s.visibility !== 'coaches')
}
