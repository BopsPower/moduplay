import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listTracks } from '../lib/myAudio'

// 처음 온 사람에게 '시작 미션' 4가지
// 학생: 연습하는 쪽 (악보 재생 · 유튜브 연습 · 내 음원 · 보관함)
// 코치: 자료 올리기와 레슨 쪽 (악보 · 반주 올리기 · 학생에게 구간 보내기 · 내 학생 추가)
// 완료 여부는 실제 기록으로 자동 체크. 기록이 서버에 따로 없는 것(악보 재생·구간 보내기)은 이 기기에 표시해 둠

const AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac']
const key = (uid: string) => 'mp_start_hide_' + uid
const hidden = (uid: string) => { try { return localStorage.getItem(key(uid)) === '1' } catch { return false } }
const flagKey = (name: string) => 'mp_mission_' + name
const flag = (name: string) => { try { return localStorage.getItem(flagKey(name)) === '1' } catch { return false } }
/** 서버 기록이 없는 미션을 '해 봤음'으로 표시 (악보 재생 'score-play', 구간 보내기 'send-clip') */
export function markMission(name: 'score-play' | 'send-clip') { try { localStorage.setItem(flagKey(name), '1') } catch { /* 무시 */ } }

type Item = { ok: boolean; ic: string; t: string; d: string; to: string; go: string }

export default function StartMissions({ uid, coach }: { uid: string; coach?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [hide, setHide] = useState(() => hidden(uid))

  useEffect(() => {
    if (hide) return
    let live = true
    ;(async () => {
      const has = (r: { data: unknown[] | null }) => (r.data?.length ?? 0) > 0
      if (coach) {
        // 자료를 많이 올린 코치도 정확하게: 종류마다 '하나라도 있나'만 따로 물어봄
        const mineQ = () => supabase.from('scores').select('id').eq('created_by', uid)
        const notAudio = AUDIO_EXTS.reduce((q, x) => q.not('file_path', 'ilike', `%.${x}`), mineQ().not('file_path', 'is', null))
        const { data: t } = await supabase.from('teachers').select('id').eq('user_id', uid).maybeSingle()
        const tid = (t as { id: string } | null)?.id
        const [sc, au, st1, st2] = await Promise.all([
          notAudio.limit(1),
          mineQ().or(AUDIO_EXTS.map(x => `file_path.ilike.%.${x}`).join(',')).limit(1),
          tid ? supabase.from('students').select('id').eq('teacher_id', tid).limit(1) : Promise.resolve({ data: [] }),
          tid ? supabase.from('student_teachers').select('student_id').eq('teacher_id', tid).limit(1) : Promise.resolve({ data: [] }),
        ])
        if (!live) return
        setItems([
          { ok: has(sc), ic: '🎼', t: '악보 올리기', d: 'PDF·MusicXML 악보를 올리면 담당 전공 학생들이 바로 봐요', to: '/upload?kind=' + encodeURIComponent('카피 악보'), go: '올리기' },
          { ok: has(au), ic: '🎹', t: '반주·음원 올리기', d: '반주(MR)·시범 음원을 올리면 학생이 느리게·구간 반복으로 연습해요', to: '/upload?kind=' + encodeURIComponent('반주·MR'), go: '올리기' },
          { ok: flag('send-clip'), ic: '📨', t: '유튜브 구간을 학생에게 보내기', d: '연습 플레이어에서 속도·A–B 구간을 맞추고 \'학생에게 이 구간 보내기\'', to: '/player', go: '써 보기' },
          { ok: has(st1) || has(st2), ic: '👥', t: '내 학생 추가하기', d: '담당 전공 학생이 추천돼요. 내 학생으로 추가하면 연결돼요', to: '/teacher', go: '추가' },
        ])
      } else {
        const [bm, vids, tracks] = await Promise.all([
          supabase.from('score_bookmarks').select('score_id').eq('user_id', uid).limit(1),
          supabase.from('my_videos').select('id', { count: 'exact', head: true }),
          listTracks().catch(() => ({ list: [] as unknown[] })),
        ])
        if (!live) return
        setItems([
          { ok: flag('score-play'), ic: '🎼', t: '자료실에서 악보 열어 재생해 보기', d: '코치님이 올린 내 전공 악보를 열고 ▶ 재생, 지금 연주 중인 마디가 표시돼요', to: '/board', go: '열기' },
          { ok: (vids.count ?? 0) > 0, ic: '▶️', t: '연습 플레이어로 유튜브 연습', d: '유튜브 링크를 넣고 느리게, 막히는 구간만 반복해 보세요', to: '/player', go: '써 보기' },
          { ok: tracks.list.length > 0, ic: '🎧', t: '연습 플레이어에 내 음원 열기', d: '휴대폰에 있는 음원을 열어 템포·키를 바꾸고 구간 반복해요', to: '/player?tab=file', go: '써 보기' },
          { ok: has(bm), ic: '⭐', t: '마음에 드는 자료 보관함에 담기', d: '자료에서 ☆를 누르면 내 보관함에 모여요', to: '/board', go: '담기' },
        ])
      }
    })().catch(() => { /* 못 불러오면 카드를 안 보여 줌 */ })
    return () => { live = false }
  }, [uid, hide, coach])

  if (hide || !items) return null
  const close = () => { try { localStorage.setItem(key(uid), '1') } catch { /* 무시 */ } setHide(true) }
  const n = items.filter(i => i.ok).length
  const all = n === items.length

  return (
    <section className="startm" aria-label="시작 미션">
      <div className="startm-h">
        <div>
          <span className="startm-k">{all ? '🎉 시작 미션 완료' : '🚀 시작 미션'}</span>
          <b>{all ? '모두 해 봤어요! 이제 모두플레이를 마음껏 쓰세요' : coach ? `코치님, ${items.length}가지만 한 번씩 해 보세요` : `처음 왔다면 ${items.length}가지만 해 보세요`}</b>
        </div>
        <span className="startm-n">{n}<small>/{items.length}</small></span>
        <button type="button" className="startm-x" aria-label="시작 미션 닫기" title={all ? '닫기' : '다음에 할게요'} onClick={close}>✕</button>
      </div>
      <div className="startm-bar" aria-hidden="true"><i style={{ width: `${(n / items.length) * 100}%` }} /></div>
      {!all && (
        <ul className="startm-list">
          {items.map(i => (
            <li key={i.t} className={i.ok ? 'ok' : ''}>
              <span className="ic" aria-hidden="true">{i.ok ? '✓' : i.ic}</span>
              <span className="tx"><b>{i.t}</b><small>{i.d}</small></span>
              {i.ok ? <span className="done">완료</span> : <Link to={i.to} className="go">{i.go} →</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
