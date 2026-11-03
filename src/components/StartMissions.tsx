import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listTracks } from '../lib/myAudio'

// 처음 온 사람에게: 자료를 종류별로 하나씩 올려 보고, 연습 플레이어를 써 보게 하는 '시작 미션'
// 완료 여부는 실제 기록(내가 올린 자료 · 유튜브 연습 기록 · 내 음원 보관함)으로 자동 체크

type Done = { score: boolean; audio: boolean; video: boolean; ytPlay: boolean; myAudio: boolean }
const AUDIO = /\.(mp3|m4a|wav|aac|ogg|flac)$/i

const key = (uid: string) => 'mp_start_hide_' + uid
const hidden = (uid: string) => { try { return localStorage.getItem(key(uid)) === '1' } catch { return false } }

export default function StartMissions({ uid, coach }: { uid: string; coach?: boolean }) {
  const [done, setDone] = useState<Done | null>(null)
  const [hide, setHide] = useState(() => hidden(uid))

  useEffect(() => {
    if (hide) return
    let live = true
    ;(async () => {
      const [mine, vids, tracks] = await Promise.all([
        supabase.from('scores').select('file_path,mp3_path,youtube_url,kind').eq('created_by', uid).limit(300),
        supabase.from('my_videos').select('id', { count: 'exact', head: true }),
        listTracks().catch(() => ({ list: [] as unknown[] })),
      ])
      const rows = (mine.data ?? []) as { file_path: string | null; mp3_path: string | null; youtube_url: string | null; kind: string | null }[]
      if (!live) return
      setDone({
        score: rows.some(r => r.file_path && !AUDIO.test(r.file_path)),
        audio: rows.some(r => (r.file_path && AUDIO.test(r.file_path)) || !!r.mp3_path),
        video: rows.some(r => !!r.youtube_url),
        ytPlay: (vids.count ?? 0) > 0,
        myAudio: tracks.list.length > 0,
      })
    })().catch(() => { /* 못 불러오면 카드를 안 보여 줌 */ })
    return () => { live = false }
  }, [uid, hide])

  if (hide || !done) return null
  const close = () => { try { localStorage.setItem(key(uid), '1') } catch { /* 무시 */ } setHide(true) }

  const items: { ok: boolean; ic: string; t: string; d: string; to: string; go: string }[] = [
    { ok: done.score, ic: '🎼', t: '악보 올려 보기', d: coach ? 'PDF·사진·MusicXML 악보를 올리면 담당 전공 학생들이 바로 봐요' : '연습하는 곡 악보(PDF·사진)를 올려 두면 어디서든 열려요', to: '/upload?kind=' + encodeURIComponent('카피 악보'), go: '올리기' },
    { ok: done.audio, ic: '🎹', t: '반주·음원 올려 보기', d: coach ? '반주(MR)·시범 음원을 올리면 학생이 느리게·구간 반복으로 연습해요' : '반주(MR)나 내 연주 녹음을 올려 보세요', to: '/upload?kind=' + encodeURIComponent('반주·MR'), go: '올리기' },
    { ok: done.video, ic: '🎬', t: '유튜브 영상 올려 보기', d: coach ? '참고 영상 링크만 붙이면 자료실에 시범 영상으로 올라가요' : '따라 하고 싶은 연주 영상 링크를 붙여 넣으면 돼요', to: '/upload?mode=yt', go: '올리기' },
    { ok: done.ytPlay, ic: '▶️', t: '연습 플레이어로 유튜브 연습', d: coach ? '레슨 곡을 느리게 틀고 A·B 구간 반복, 학생에게 구간째 보내기' : '유튜브 링크를 넣고 느리게, 막히는 구간만 반복해 보세요', to: '/player', go: '써 보기' },
    { ok: done.myAudio, ic: '🎧', t: '연습 플레이어에 내 음원 열기', d: '휴대폰에 있는 음원을 열어 템포·키를 바꾸고 구간 반복해요', to: '/player?tab=file', go: '써 보기' },
  ]
  const n = items.filter(i => i.ok).length
  const all = n === items.length

  return (
    <section className="startm" aria-label="시작 미션">
      <div className="startm-h">
        <div>
          <span className="startm-k">{all ? '🎉 시작 미션 완료' : '🚀 시작 미션'}</span>
          <b>{all ? '모두 해 봤어요! 이제 모두플레이를 마음껏 쓰세요' : coach ? '코치님, 다섯 가지만 한 번씩 해 보세요' : '처음 왔다면 다섯 가지만 해 보세요'}</b>
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
