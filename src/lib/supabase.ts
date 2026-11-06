import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://stnyjclifmcbxeorcoje.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_hmkC7AtX0mpLovYJZbRkxA_C7ZQDZXm'
// 큰 파일 이어 올리기(zipBundle.ts)에서 주소·공개 키를 씀
export const SUPABASE_URL: string = url
export const SUPABASE_KEY: string = key

export const supabase = createClient(url, key)

export type Student = {
  id: string
  user_id: string | null
  teacher_id?: string | null
  name: string
  class_name: string | null
  email: string | null
  invite_token: string
  linked_at: string | null
  active: boolean
  staff_preview?: boolean
  campus?: string | null
}

export type Score = {
  id: string
  pinned_at?: string | null // 관리자가 '필수 자료'로 맨 위에 고정
  title: string
  composer: string | null
  category: string
  key_sig: string | null
  tempo: number | null
  file_path: string | null
  pdf_path: string | null
  thumb_path?: string | null // 교재 표지(첫 쪽) 그림: out/<id>/cover.jpg
  created_by?: string | null
  visibility: Visibility
  description: string | null
  measures_path: string | null
  mscz_path: string | null
  midi_path: string | null
  major: string | null
  convert_status: 'pending' | 'converting' | 'done' | 'failed'
  convert_error: string | null
  page_count: number | null
  mp3_path: string | null
  xml_path: string | null
  duration_sec: number | null
  created_at?: string
  // 자료 공유 (2026-10-31)
  kind?: string | null
  areas?: string[] | null
  level?: string | null
  artist?: string | null
  song?: string | null
  tags?: string[] | null
  view_only?: boolean
  youtube_url?: string | null
  yt_marks?: { t: number; label: string }[] | null
  coach_memo?: string | null
  // 음원 묶음(ZIP) · 짝 교재 연결 (2026-11-06)
  zip_info?: { size: number; audio: number; files: { n: string; s: number }[] } | null
  linked_score_id?: string | null
  uploader_role?: 'coach' | 'student'
  uploader_name?: string | null
  hidden?: boolean
}

// students 학원 전체 · mine 내 학생만 · selected 고른 학생만 · coaches 코치끼리 (public·assigned는 예전 값)
export type Visibility = 'students' | 'mine' | 'selected' | 'coaches' | 'public' | 'assigned' | 'admin' | 'review' | 'sent'

export type Comment = { id: string; score_id: string; user_id: string; author_name: string | null; is_coach: boolean; body: string; created_at: string }
export type MaterialRequest = { id: string; user_id: string; author_name: string | null; is_coach: boolean; body: string; done: boolean; done_score_id: string | null; created_at: string }

export type Assignment = {
  id: string
  student_id: string
  score_id: string
  note: string | null
  target_tempo: number | null
  due_date: string | null
  is_current: boolean
  score?: Score
}

export type Teacher = { id: string; user_id: string | null; name: string; email: string | null; role: 'admin' | 'teacher'; active: boolean; campuses?: string[]; majors?: string[]; linked_at: string | null; created_at: string }
