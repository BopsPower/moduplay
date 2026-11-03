import { useEffect, useState } from 'react'

// 스크롤하는 동안(그리고 멈춘 뒤 ms 동안)만 true → 평소엔 숨겨 두고 움직일 때만 보이는 단추·막대에 씀
export function useScrollPeek(ms = 2000, on = true) {
  const [peek, setPeek] = useState(false)
  useEffect(() => {
    if (!on) { setPeek(false); return }
    let t = 0
    const f = () => { setPeek(true); clearTimeout(t); t = window.setTimeout(() => setPeek(false), ms) }
    addEventListener('scroll', f, { passive: true })
    return () => { removeEventListener('scroll', f); clearTimeout(t) }
  }, [ms, on])
  return peek
}
