// 지금 보고 있는 화면(학생 / 코치 / 관리자)을 기억: 자료실·악보 보기처럼 같이 쓰는 화면에서도 그 화면의 메뉴를 유지
export type View = 'student' | 'coach' | 'admin'

export function rememberView(path: string) {
  const v: View | null = path.startsWith('/admin') ? 'admin' : path.startsWith('/teacher') ? 'coach' : path === '/' ? 'student' : null
  if (v) try { localStorage.setItem('mp_view', v) } catch { /* 저장 안 돼도 동작 */ }
}

export function lastView(): View | null {
  try { return (localStorage.getItem('mp_view') as View | null) } catch { return null }
}
