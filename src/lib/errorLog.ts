// 앱 화면 오류를 client_errors 표에 남김 (관리자만 봄). 한 화면에서 최대 5개, 같은 오류는 한 번만.
import { supabase } from './supabase'

const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'
const sent = new Set<string>()
// 우리 앱 문제가 아닌 흔한 잡음
const NOISE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|AbortError|The user aborted|Load failed$|NetworkError when attempting|Failed to fetch$/i

export function logError(kind: string, err: unknown) {
  if (BUILD === 'dev') return
  const e = err as { message?: string; stack?: string } | null
  const message = String(e?.message ?? err ?? '').slice(0, 1000)
  if (!message || NOISE.test(message)) return
  const k = kind + '|' + message
  if (sent.has(k) || sent.size >= 5) return
  sent.add(k)
  supabase.auth.getSession().then(({ data }) => supabase.from('client_errors').insert({
    user_id: data.session?.user.id ?? null, build: BUILD, kind: kind.slice(0, 30),
    url: (location.pathname + location.search).slice(0, 300), message,
    stack: String(e?.stack ?? '').slice(0, 4000) || null, ua: navigator.userAgent.slice(0, 300),
  })).then(() => {}, () => {})
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', ev => logError('error', ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', ev => logError('promise', ev.reason))
}
