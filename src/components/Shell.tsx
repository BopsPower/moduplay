import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import type { ReactNode } from 'react'

export default function Shell({ children, right, teacher, bottomBar }: { children: ReactNode; right?: ReactNode; teacher?: boolean; bottomBar?: ReactNode }) {
  const { session, student, isTeacher, isAdmin, signOut } = useAuth()
  const loc = useLocation()
  const initial = student?.name.slice(0, 1) ?? '선'
  const links = (<>
            {teacher ? (
              <>
                <Link to="/teacher" className={loc.pathname === '/teacher' ? 'on' : ''}>학생</Link>
                <Link to="/teacher/scores" className={loc.pathname.startsWith('/teacher/scores') ? 'on' : ''}>악보</Link>
                <Link to="/teacher/assign" className={loc.pathname.startsWith('/teacher/assign') ? 'on' : ''}>과제</Link>
                {isAdmin && <Link to="/admin" className={loc.pathname.startsWith('/admin') ? 'on' : ''}>관리</Link>}
              </>
            ) : (
              <>
                <Link to="/" className={loc.pathname === '/' ? 'on' : ''}>내 과제</Link>
                <Link to="/board" className={loc.pathname === '/board' ? 'on' : ''}>악보 자료실</Link>
                <a href={BRAND.online} target="_blank" rel="noreferrer">{BRAND.onlineName}</a>
                <a href={BRAND.site} target="_blank" rel="noreferrer">학원 홈</a>
              </>
            )}
  </>)
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top">
        <div className="wrap">
          <Link to={teacher ? '/teacher' : '/'} className="brand">
            <span className="mark">모</span>
            <span className="name">{BRAND.app}</span>
            <span className="sub">{BRAND.academy}</span>
          </Link>
          <nav>{links}</nav>
          <div className="spacer" />
          {right}
          {isTeacher && !teacher && <Link to="/teacher" className="btn sm hide-m" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>코치 화면</Link>}
          {teacher && student && <Link to="/" className="btn sm hide-m" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>학생 화면</Link>}
          <details className="dl">
            <summary className="avatar" title="내 계정" aria-label="내 계정" style={{ listStyle: 'none', cursor: 'pointer' }}>{initial}</summary>
            <div className="dl-menu" style={{ minWidth: 200 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <b style={{ display: 'block', color: 'var(--ink)' }}>{student?.name ?? (isAdmin ? '관리자' : isTeacher ? '코치님' : '')}</b>
                <span className="muted">{session?.user.email}</span>
              </div>
              {isTeacher && !teacher && <Link to="/teacher" className="muted" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>코치 화면으로</Link>}
              {teacher && student && <Link to="/" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>학생 화면으로</Link>}
              <button onClick={() => { if (confirm('로그아웃할까요?')) signOut() }}>로그아웃</button>
            </div>
          </details>
        </div>
      </header>
      <main className="page wrap">{children}</main>
      {/* 모바일: 하단 고정 바 (페이지가 넘겨주면 그걸, 아니면 메뉴 탭) */}
      <div className="tabbar">{bottomBar ?? <nav>{links}</nav>}</div>
      <footer className="bottom">
        <div className="wrap">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><b>{BRAND.academy}</b><span>학생 전용 연습공간입니다.</span></span>
          <a href={BRAND.site} target="_blank" rel="noreferrer">www.modu-music.com</a>
        </div>
      </footer>
    </div>
  )
}
