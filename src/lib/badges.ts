// 뮤지션 배지: 나만 모으는 배지판 (순위·비교 없음)
import { supabase } from './supabase'
import { celebrate } from './celebrate'
import { streakOf } from './practice'

export type BadgeDef = { id: string; icon: string; name: string; how: string; group: string }

export const BADGES: BadgeDef[] = [
  { id: 'streak3', icon: '🔥', name: '3일 연속', how: '3일 이어서 연습하기', group: '꾸준함' },
  { id: 'streak7', icon: '🔥', name: '7일 연속', how: '7일 이어서 연습하기', group: '꾸준함' },
  { id: 'streak30', icon: '🌋', name: '30일 연속', how: '30일 이어서 연습하기', group: '꾸준함' },
  { id: 'day1h', icon: '🎯', name: '하루 1시간', how: '하루에 1시간 연습하기', group: '시간' },
  { id: 'day3h', icon: '🎯', name: '하루 3시간', how: '하루에 3시간 연습하기', group: '시간' },
  { id: 'total10h', icon: '⏱️', name: '누적 10시간', how: '모두 10시간 연습하기', group: '시간' },
  { id: 'total50h', icon: '⏱️', name: '누적 50시간', how: '모두 50시간 연습하기', group: '시간' },
  { id: 'total100h', icon: '🏆', name: '누적 100시간', how: '모두 100시간 연습하기', group: '시간' },
  { id: 'ladder1', icon: '🪜', name: '첫 사다리 완주', how: '템포 사다리 하나를 목표 템포까지', group: '템포' },
  { id: 'ladder5', icon: '🪜', name: '사다리 5개 완주', how: '템포 사다리 5개를 목표 템포까지', group: '템포' },
  { id: 'tempo200', icon: '⚡', name: '♩200 돌파', how: '템포 사다리에서 ♩200 이상 성공', group: '템포' },
  { id: 'share1', icon: '📚', name: '첫 자료 나누기', how: '자료실에 자료 하나 올리기', group: '나누기' },
  { id: 'copy5', icon: '🎼', name: '카피 5곡', how: '연주 카피 5개 올리기', group: '나누기' },
  { id: 'ask1', icon: '💬', name: '첫 질문', how: '자료에 질문·댓글 남기기', group: '나누기' },
  { id: 'coachReply', icon: '👏', name: '코치님 답변', how: '내가 질문한 자료에 코치님 답변 받기', group: '나누기' },
  { id: 'yt10', icon: '🎧', name: '유튜브 10곡', how: '연습 플레이어로 유튜브 10곡 연습하기', group: '듣기' },
]

type Day = { day: string; seconds: number }

/** 지금까지 기록으로 받을 수 있는 배지를 확인하고, 새로 받은 배지는 저장 + 축하 */
export async function checkBadges(uid: string, days: Day[]): Promise<string[]> {
  const [{ data: have }, { data: lad }, { count: shares }, { count: copies }, { data: myComments }, { count: yts }] = await Promise.all([
    supabase.from('musician_badges').select('badge'),
    supabase.from('tempo_ladders').select('best_bpm, done_at'),
    supabase.from('scores').select('id', { count: 'exact', head: true }).eq('created_by', uid),
    supabase.from('scores').select('id', { count: 'exact', head: true }).eq('created_by', uid).eq('kind', '카피 악보'),
    supabase.from('score_comments').select('score_id, created_at').eq('user_id', uid).limit(200),
    supabase.from('my_videos').select('id', { count: 'exact', head: true }),
  ])
  const owned = new Set((have ?? []).map(r => r.badge as string))
  const streak = streakOf(days)
  const total = days.reduce((a, d) => a + d.seconds, 0)
  const bestDay = days.reduce((a, d) => Math.max(a, d.seconds), 0)
  const ladders = lad ?? []
  const done = ladders.filter(l => l.done_at).length
  const maxBpm = ladders.reduce((a, l) => Math.max(a, l.best_bpm ?? 0), 0)

  let coachReply = owned.has('coachReply')
  if (!coachReply && myComments?.length) {
    const first = new Map<string, string>()
    for (const c of myComments) if (!first.has(c.score_id) || c.created_at < first.get(c.score_id)!) first.set(c.score_id, c.created_at)
    const { data: coachC } = await supabase.from('score_comments').select('score_id, created_at').eq('is_coach', true).in('score_id', [...first.keys()]).limit(200)
    coachReply = !!coachC?.some(c => c.created_at > (first.get(c.score_id) ?? '9'))
  }

  const ok: Record<string, boolean> = {
    streak3: streak >= 3, streak7: streak >= 7, streak30: streak >= 30,
    day1h: bestDay >= 3600, day3h: bestDay >= 10800,
    total10h: total >= 36000, total50h: total >= 180000, total100h: total >= 360000,
    ladder1: done >= 1, ladder5: done >= 5, tempo200: maxBpm >= 200,
    share1: (shares ?? 0) >= 1, copy5: (copies ?? 0) >= 5,
    ask1: (myComments?.length ?? 0) >= 1, coachReply,
    yt10: (yts ?? 0) >= 10,
  }
  const fresh = BADGES.filter(b => ok[b.id] && !owned.has(b.id)).map(b => b.id)
  if (fresh.length) {
    const { error } = await supabase.from('musician_badges').upsert(fresh.map(badge => ({ badge })), { onConflict: 'user_id,badge', ignoreDuplicates: true })
    if (!error) {
      const b = BADGES.find(x => x.id === fresh[fresh.length - 1])!
      celebrate(`새 뮤지션 배지! ${b.icon} ${b.name}${fresh.length > 1 ? ` 외 ${fresh.length - 1}개` : ''}`)
    }
  }
  return [...owned, ...fresh]
}
