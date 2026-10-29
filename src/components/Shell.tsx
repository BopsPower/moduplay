import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import type { ReactNode } from 'react'

export default function Shell({ children, right, teacher }: { children: ReactNode; right?: ReactNode; teacher?: boolean }) {
  const { session, student, isTeacher, isAdmin, signOut } = useAuth()
  const loc = useLocation()
  const initial = student?.name.slice(0, 1) ?? '선'
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top">
        <div className="wrap">
          <Link to={teacher ? '/teacher' : '/'} className="brand">
            <span className="mark">모</span>
            <span className="name">{BRAND.app}</span>
            <span className="sub">{BRAND.academy}</span>
          </Link>
          <nav>
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
                <a href={BRAND.online} target="_blank" rel="noreferrer">온라인 강의</a>
                <a href={BRAND.site} target="_blank" rel="noreferrer">학원 홈</a>
              </>
            )}
          </nav>
          <div className="spacer" />
          {right}
          {isTeacher && !teacher && <Link to="/teacher" className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>강사 화면</Link>}
          {teacher && student && <Link to="/" className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>학생 화면</Link>}
          <details className="dl">
            <summary className="avatar" title="내 계정" aria-label="내 계정" style={{ listStyle: 'none', cursor: 'pointer' }}>{initial}</summary>
            <div className="dl-menu" style={{ minWidth: 200 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <b style={{ display: 'block', color: 'var(--ink)' }}>{student?.name ?? (isAdmin ? '관리자' : isTeacher ? '선생님' : '')}</b>
                <span className="muted">{session?.user.email}</span>
              </div>
              {isTeacher && !teacher && <Link to="/teacher" className="muted" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>강사 화면으로</Link>}
              {teacher && student && <Link to="/" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>학생 화면으로</Link>}
              <button onClick={() => { if (confirm('로그아웃할까요?')) signOut() }}>로그아웃</button>
            </div>
          </details>
        </div>
      </header>
      <main className="page wrap">{children}</main>
      <footer className="bottom">
        <div className="wrap">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#fff', fontWeight: 700 }}>{BRAND.academy}</span>
            {BRAND.campuses.map(c => (
              <span key={c.name}>{c.name} · <a href={`tel:${c.tel}`}>{c.tel}</a> · {c.addr}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right' }}>
            <a href={BRAND.site} target="_blank" rel="noreferrer">www.modu-music.com</a>
            <span>이 악보는 학원생 전용이에요</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
