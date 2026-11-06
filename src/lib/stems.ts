import { supabase } from './supabase'
import { playbackSession } from './iosAudio'

// 악기 나누기 (Demucs): 음원 하나 → 보컬·기타·피아노·베이스·드럼·나머지
// 줄 서기 표 stem_jobs, 결과 파일은 'stems' 버킷 <job id>/<악기>.mp3
export const STEM_ORDER = ['vocals', 'guitar', 'piano', 'bass', 'drums', 'other'] as const
export const STEM_NAME: Record<string, string> = { vocals: '보컬', guitar: '기타', piano: '건반', bass: '베이스', drums: '드럼', other: '나머지' }
export const DAILY_LIMIT = 10 // 원장님 2026-11-06 "10곡으로 하자" (DB 규칙도 10)
// 전공 → 악기 나누기에서 처음부터 꺼 둘 악기 (내 악기 빼고 연습)
export const MAJOR_STEM: Record<string, string> = { 보컬: 'vocals', 싱어송라이터: 'vocals', 기타: 'guitar', 피아노: 'piano', 베이스: 'bass', 드럼: 'drums' }

export type StemSource = { bucket: 'scores' | 'my-audio'; path: string; scoreId?: string | null; title?: string | null }
export type StemJob = {
  id: string; status: 'queued' | 'working' | 'done' | 'failed'; stems: Record<string, string> | null; error: string | null
  created_at: string; started_at: string | null; finished_at: string | null; created_by: string | null; score_id: string | null
}

/** 같은 음원으로 이미 맡긴(또는 끝난) 일이 있으면 그것 */
export async function findJob(src: StemSource): Promise<StemJob | null> {
  const { data } = await supabase.from('stem_jobs').select('*').eq('source_bucket', src.bucket).eq('source_path', src.path)
    .in('status', ['queued', 'working', 'done']).order('created_at', { ascending: false }).limit(1)
  return (data?.[0] as StemJob) ?? null
}

export async function requestJob(src: StemSource): Promise<StemJob> {
  const had = await findJob(src)
  if (had) return had
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('stem_jobs').insert({
    created_by: u.user?.id, source_bucket: src.bucket, source_path: src.path, score_id: src.scoreId ?? null, title: src.title ?? null,
  }).select('*').single()
  if (error) {
    if (/row-level security|violates/i.test(error.message)) throw new Error(`내 음원은 하루 ${DAILY_LIMIT}곡까지 나눌 수 있어요. 내일 다시 해 주세요.`)
    // 동시에 같은 곡을 누른 경우: 이미 생긴 일을 씀
    const again = await findJob(src); if (again) return again
    throw new Error('맡기지 못했어요: ' + error.message)
  }
  return data as StemJob
}

export async function getJob(id: string): Promise<StemJob | null> {
  const { data } = await supabase.from('stem_jobs').select('*').eq('id', id).maybeSingle()
  return (data as StemJob) ?? null
}

/** 내 앞에 기다리는 일 수 */
export async function aheadOf(job: StemJob): Promise<number> {
  const { count } = await supabase.from('stem_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'working']).lt('created_at', job.created_at)
  return count ?? 0
}

/** 고른 악기만 소리 크기대로 섞어서 wav 파일 하나로 (기존 플레이어의 템포·키·구간 반복을 그대로 쓰려고) */
export async function mixStems(stems: Record<string, string>, gains: Record<string, number>, name: string, onStep?: (t: string) => void): Promise<File> {
  const use = STEM_ORDER.filter(s => stems[s] && (gains[s] ?? 1) > 0)
  if (!use.length) throw new Error('들을 악기를 하나 이상 켜 주세요.')
  playbackSession()
  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  const ctx: AudioContext = new Ctx()
  const bufs: { s: string; b: AudioBuffer }[] = []
  try {
    for (const s of use) {
      onStep?.(`${STEM_NAME[s]} 받는 중…`)
      const { data, error } = await supabase.storage.from('stems').download(stems[s])
      if (error || !data) throw new Error(`${STEM_NAME[s]} 소리를 받지 못했어요.`)
      bufs.push({ s, b: await ctx.decodeAudioData(await data.arrayBuffer()) })
    }
  } finally { ctx.close?.() }
  onStep?.('섞는 중…')
  const sr = bufs[0].b.sampleRate
  const len = Math.max(...bufs.map(x => x.b.length))
  const off = new OfflineAudioContext(2, len, sr)
  for (const { s, b } of bufs) {
    const src = off.createBufferSource(); src.buffer = b
    const g = off.createGain(); g.gain.value = gains[s] ?? 1
    src.connect(g).connect(off.destination); src.start()
  }
  const out = await off.startRendering()
  const { toWav } = await import('./pitchShift')
  return new File([toWav(out.getChannelData(0), out.getChannelData(1), sr)], name, { type: 'audio/wav' })
}
