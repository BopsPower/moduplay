import { useEffect, useState } from 'react'
import { tourDone } from './Tour'

// 모두플레이 1분 소개 영상 (세로). 학생용·코치용 두 가지
// 홈 카드(처음 한 번)·로그인 화면·내 연습에서 열어요
type Who = 'student' | 'coach'
export const INTROS: Record<Who, { src: string; poster: string }> = {
  student: { src: '/intro/student.mp4', poster: '/intro/student.jpg' },
  coach: { src: '/intro/coach.mp4', poster: '/intro/coach.jpg' },
}
export const INTRO = INTROS.student
const seenKey = (w: Who) => (w === 'student' ? 'mp_intro_seen' : 'mp_intro_seen_coach')

export function markIntroSeen(w: Who = 'student') { try { localStorage.setItem(seenKey(w), '1') } catch { /* 무시 */ } }
function introSeen(w: Who) { try { return localStorage.getItem(seenKey(w)) === '1' } catch { return false } }

export function IntroModal({ onClose, who = 'student' }: { onClose: () => void; who?: Who }) {
  const v = INTROS[who]
  return (
    <div className="modal-bg intro-bg" onClick={onClose}>
      <div className="intro-box" onClick={e => e.stopPropagation()}>
        <video src={v.src} poster={v.poster} controls autoPlay playsInline preload="auto" onEnded={() => markIntroSeen(who)} />
        <button type="button" className="intro-x" aria-label="닫기" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

// 영상 여는 버튼 (어디서나)
export function IntroButton({ label = '🎬 모두플레이 1분 소개 보기', className = 'linkish', who = 'student' }: { label?: string; className?: string; who?: Who }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <IntroModal who={who} onClose={() => setOpen(false)} />}
    </>
  )
}

// 홈 카드: 처음 온 학생·코치에게 한 번만. 닫거나 끝까지 보면 다시 안 나와요
export default function IntroCard({ who = 'student' }: { who?: Who }) {
  const [hide, setHide] = useState(() => introSeen(who))
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(() => tourDone(who))
  useEffect(() => { const f = () => setReady(tourDone(who)); addEventListener('mp-tour', f); return () => removeEventListener('mp-tour', f) }, [who])
  if ((hide || !ready) && !open) return null
  const coach = who === 'coach'
  return (
    <>
      {!hide && (
        <section className="intro-card">
          <button type="button" className="intro-thumb" onClick={() => setOpen(true)} aria-label="소개 영상 보기">
            <img src={INTROS[who].poster} alt="" /><span className="play">▶</span>
          </button>
          <div className="intro-txt">
            <b>{coach ? '코치님, 1분만 보세요!' : '처음이라면 1분만!'}</b>
            <span>{coach
              ? '자료 올리기·악보 창고·코치 추천·내 학생 추가·QR까지 영상으로 둘러봐요.'
              : '내 캐릭터·악보 연습·템포 사다리·배지·성과 카드를 영상으로 둘러봐요.'}</span>
            <button type="button" className="btn primary" onClick={() => setOpen(true)}>▶ 소개 영상 보기</button>
          </div>
          <button type="button" className="intro-close" aria-label="다시 보지 않기" onClick={() => { markIntroSeen(who); setHide(true) }}>✕</button>
        </section>
      )}
      {open && <IntroModal who={who} onClose={() => { setOpen(false); markIntroSeen(who); setHide(true) }} />}
    </>
  )
}
