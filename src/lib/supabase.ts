import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://stnyjclifmcbxeorcoje.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_hmkC7AtX0mpLovYJZbRkxA_C7ZQDZXm'

export const supabase = createClient(url, key)

export type Student = {
  id: string
  user_id: string | null
  name: string
  class_name: string | null
  email: string | null
  invite_token: string
  linked_at: string | null
  active: boolean
}

export type Score = {
  id: string
  title: string
  composer: string | null
  category: string
  key_sig: string | null
  tempo: number | null
  file_path: string
  pdf_path: string | null
  visibility: 'assigned' | 'students' | 'public'
  description: string | null
  measures_path: string | null
  convert_status: 'pending' | 'converting' | 'done' | 'failed'
  convert_error: string | null
  page_count: number | null
  mp3_path: string | null
  xml_path: string | null
  duration_sec: number | null
  created_at?: string
}

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
