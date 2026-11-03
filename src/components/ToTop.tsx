import { useEffect, useState } from 'react'

// 긴 목록에서 아래로 내렸을 때 한 번에 맨 위로 (연습 도구 동그라미 바로 위)
export default function ToTop({ after = 600, small }: { after?: number; small?: boolean }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > after)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [after])
  if (!show) return null
  return (
    <button type="button" className={'to-top' + (small ? ' sm' : '')} aria-label="맨 위로" title="맨 위로" onClick={() => window.scrollTo({ top: 0, behavior: window.scrollY > 4000 ? 'auto' : 'smooth' })}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      {!small && <span>맨 위로</span>}
    </button>
  )
}
