// 앱 업데이트 대비
// 1) 새 버전 알아채기: version.json의 빌드 번호가 바뀌면, 다음 화면 이동 때 조용히 새로고침 (연습 중이면 기다림)
// 2) 배포 직후 옛 화면 조각을 못 찾는 오류(화면 하얘짐) → 한 번만 자동 새로고침
// 3) 그 밖의 화면 오류 → 하얀 화면 대신 '새로고침' 안내
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { usePractice } from './practice'
import { logError } from './errorLog'

const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'
const KEY = 'mp_reloaded_for'

/** 같은 이유로 계속 새로고침되는 일 없게 한 번만 */
export function reloadOnce(reason: string) {
  try {
    const last = sessionStorage.getItem(KEY)
    if (last === reason + BUILD) return false
    sessionStorage.setItem(KEY, reason + BUILD)
  } catch { /* 저장 못 해도 한 번은 시도 */ }
  window.location.reload()
  return true
}

// 화면 조각(lazy) 불러오기 실패: Vite가 알려 주는 이벤트
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', e => { e.preventDefault(); if (!reloadOnce('chunk')) logError('chunk', (e as any).payload ?? 'preloadError') })
}

const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch dynamically|error loading dynamically/i.test(String((e as Error)?.message ?? e))

async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()).build ?? null
  } catch { return null }
}

/** 라우터 안에 하나만 두기 */
export function UpdateWatcher() {
  const [pending, setPending] = useState(false)
  const practice = usePractice()
  const loc = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (BUILD === 'dev') return
    let stop = false
    const check = async () => { const b = await latestBuild(); if (!stop && b && b !== BUILD) setPending(true) }
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    check()
    document.addEventListener('visibilitychange', onVis)
    const t = window.setInterval(check, 10 * 60 * 1000) // 10분마다
    return () => { stop = true; document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [])

  // 새 버전이 있으면 다음 화면 이동 때 새로고침 (악보 재생·연습 도구 쓰는 중이면 미룸)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (pending && !practice?.active) window.location.reload()
  }, [loc.pathname])

  if (!pending) return null
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(84px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 60,
      background: 'var(--ink, #1d1a17)', color: '#fff', borderRadius: 999, padding: '8px 10px 8px 16px', display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,.2)', maxWidth: 'calc(100vw - 32px)' }}>
      <span>새 버전이 나왔어요</span>
      <button type="button" onClick={() => window.location.reload()}
        style={{ border: 0, borderRadius: 999, padding: '6px 12px', background: 'var(--or, #f3791f)', color: '#fff', fontWeight: 700, font: 'inherit', cursor: 'pointer' }}>지금 바꾸기</button>
    </div>
  )
}

/** 화면 오류가 나도 하얀 화면 대신 안내 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { err: unknown }> {
  state = { err: null as unknown }
  static getDerivedStateFromError(err: unknown) { return { err } }
  componentDidCatch(err: unknown) { if (isChunkError(err)) reloadOnce('chunk'); else logError('render', err) }
  render() {
    if (!this.state.err) return this.props.children
    const chunk = isChunkError(this.state.err)
    return (
      <div className="card" style={{ margin: '48px auto', maxWidth: 420, padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b style={{ fontSize: 18 }}>{chunk ? '새 버전으로 바꾸는 중이에요' : '화면을 불러오지 못했어요'}</b>
        <p className="muted" style={{ margin: 0 }}>{chunk ? '앱이 업데이트됐어요. 아래 버튼을 눌러 주세요.' : '잠시 뒤 다시 해 보시고, 계속되면 코치님께 알려 주세요.'}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>새로고침</button>
      </div>
    )
  }
}
