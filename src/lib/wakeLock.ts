import { useEffect } from 'react'

// 화면 꺼짐 방지: 연습 중(메트로놈·반주·튜너·악보 재생 등)이거나 악보를 보는 동안 휴대폰 화면이 꺼지지 않게
// - 아이폰(iOS 16.4+)·갤럭시·PC 크롬에서 됨. 안 되는 기기는 조용히 넘어감
// - 다른 앱으로 가면 기기가 알아서 풀고, 돌아오면 다시 켬
type Sentinel = { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void }
const holders = new Set<string>()
let lock: Sentinel | null = null
let busy = false

async function apply() {
  const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
  if (!wl || busy) return
  busy = true
  try {
    const want = holders.size > 0 && document.visibilityState === 'visible'
    if (want && !lock) {
      lock = await wl.request('screen')
      lock.addEventListener?.('release', () => { lock = null })
    } else if (!want && lock) {
      const l = lock; lock = null
      await l.release()
    }
  } catch { lock = null } finally { busy = false }
  // 기다리는 동안 상태가 바뀌었으면 한 번 더
  const want = holders.size > 0 && document.visibilityState === 'visible'
  if (want !== !!lock) setTimeout(apply, 50)
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { apply() })

/** key: 누가 켜 달라는지. idleMs를 주면 그 시간 동안 아무것도 안 만지면 풀림 (악보만 펴 두고 자리를 뜬 경우 배터리 아끼기) */
export function useWakeLock(key: string, on: boolean, idleMs = 0) {
  useEffect(() => {
    if (!on) return
    let t = 0
    const hold = () => {
      if (!holders.has(key)) { holders.add(key); apply() }
      if (idleMs) { clearTimeout(t); t = window.setTimeout(() => { holders.delete(key); apply() }, idleMs) }
    }
    hold()
    const evs = idleMs ? ['pointerdown', 'scroll', 'keydown'] : []
    evs.forEach(e => addEventListener(e, hold, { passive: true }))
    return () => { clearTimeout(t); evs.forEach(e => removeEventListener(e, hold)); holders.delete(key); apply() }
  }, [key, on, idleMs])
}
