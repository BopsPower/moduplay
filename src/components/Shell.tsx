import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { ReactNode } from 'react'

export default function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { student, signOut } = useAuth()
  const loc = useLocation()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top">
        <div className="wrap">
          <Link to="/" className="brand">
            <span className="mark">모</span>
            <span className="name">모두플레이</span>
            <span className="sub">모두의음악 피아노학원</span>
          </Link>
          <nav>
            <Link to="/" className={loc.pathname === '/' ? 'on' : ''}>내 악보</Link>
            <a href="https://modu-music.liveklass.com/" target="_blank" rel="noreferrer">온라인 강의</a>
            <a href="https://www.modu-music.com/" target="_blank" rel="noreferrer">학원 소식</a>
          </nav>
          <div className="spacer" />
          {right}
          {student && (
            <button className="avatar" title={`${student.name} · 로그아웃`} onClick={signOut} aria-label="로그아웃">
              {student.name.slice(0, 1)}
            </button>
          )}
        </div>
      </header>
      <main className="page wrap">{children}</main>
      <footer className="bottom">
        <div className="wrap">
          <span>모두의음악 피아노학원 · 010-0000-0000</span>
          <span>이 악보는 학원생 전용이에요</span>
        </div>
      </footer>
    </div>
  )
}
