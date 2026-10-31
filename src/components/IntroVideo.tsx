import { useEffect, useState } from 'react'
import { tourDone } from './Tour'

// 모두플레이 30초 소개 영상 (세로). 홈 카드·로그인 화면·내 연습에서 열어요.
export const INTRO = { src: '/intro/student.mp4', poster: '/intro/student.jpg' }
const SEEN = 'mp_intro_seen'

export function markIntroSeen() { try { localStorage.setItem(SEEN, '1') } catch { /* 무시 */ } }
function introSeen() { try { return localStorage.getItem(SEEN) === '1' } catch { return false } }

export function IntroModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-bg intro-bg" onClick={onClose}>
      <div className="intro-box" onClick={e => e.stopPropagation()}>
        <video src={INTRO.src} poster={INTRO.poster} controls autoPlay playsInline preload="auto" onEnded={markIntroSeen} />
        <button type="button" className="intro-x" aria-label="닫기" onClick={onClose}>✕</button>
      </div>
    </div>
  )
}

// 영상 여는 버튼 (어디서나)
export function IntroButton({ label = '🎬 모두플레이 30초 소개 보기', className = 'linkish' }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <IntroModal onClose={() => setOpen(false)} />}
    </>
  )
}

// 홈 카드: 처음 온 학생에게만. 닫거나 끝까지 보면 다시 안 나와요
export default function IntroCard() {
  const [hide, setHide] = useState(introSeen)
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(() => tourDone('student'))
  useEffect(() => { const f = () => setReady(tourDone('student')); addEventListener('mp-tour', f); return () => removeEventListener('mp-tour', f) }, [])
  if ((hide || !ready) && !open) return null
  return (
    <>
      {!hide && (
        <section className="intro-card">
          <button type="button" className="intro-thumb" onClick={() => setOpen(true)} aria-label="소개 영상 보기">
            <img src={INTRO.poster} alt="" /><span className="play">▶</span>
          </button>
          <div className="intro-txt">
            <b>처음이라면 30초만!</b>
            <span>연습 기록·잔디·템포 사다리·뮤지션 배지를 영상으로 둘러봐요.</span>
            <button type="button" className="btn primary" onClick={() => setOpen(true)}>▶ 소개 영상 보기</button>
          </div>
          <button type="button" className="intro-close" aria-label="다시 보지 않기" onClick={() => { markIntroSeen(); setHide(true) }}>✕</button>
        </section>
      )}
      {open && <IntroModal onClose={() => { setOpen(false); markIntroSeen(); setHide(true) }} />}
    </>
  )
}
