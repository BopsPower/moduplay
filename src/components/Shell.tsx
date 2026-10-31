import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'
import { lastView, rememberView } from '../lib/view'
import { useState, type ReactNode } from 'react'
import NameEdit from './NameEdit'
import { restartTour } from './Tour'
import Avatar from './Avatar'
import AvatarEdit from './AvatarEdit'
import { lookOf, nickOf } from '../lib/avatar'

export default function Shell({ children, right, teacher, bottomBar }: { children: ReactNode; right?: ReactNode; teacher?: boolean; bottomBar?: ReactNode }) {
  const { session, student, isTeacher, isAdmin, signOut } = useAuth()
  const [nameEdit, setNameEdit] = useState(false)
  const [avatarEdit, setAvatarEdit] = useState(false)
  const look = lookOf(session?.user.user_metadata)
  const loc = useLocation()
  const initial = student?.name.slice(0, 1) ?? '선'
  const nav = useNavigate()
  rememberView(loc.pathname)
  const adminView = isAdmin && loc.pathname.startsWith('/admin')
  // 코치 메뉴: 코치 화면이거나, 학생 기록 없는 코치이거나, 코치 화면에서 자료실·악보 보기로 넘어온 경우
  const shared = !loc.pathname.startsWith('/teacher') && !loc.pathname.startsWith('/admin')
  const coachNav = !adminView && (teacher || (isTeacher && (!student || (shared && lastView() !== 'student'))))
  const view: 'student' | 'coach' | 'admin' = adminView ? 'admin' : coachNav ? 'coach' : 'student'
  // 관리자: 학생 / 코치 / 관리자 화면 중 하나를 고름 (마지막 선택을 기억해 다음 로그인 때 그 화면으로)
  const go = (v: 'student' | 'coach' | 'admin') => {
    try { localStorage.setItem('mp_view', v) } catch { /* 저장 안 돼도 이동은 됨 */ }
    nav(v === 'student' ? '/' : v === 'coach' ? '/teacher' : '/admin')
  }
  const asStudent = () => { try { localStorage.setItem('mp_view', 'student') } catch { /* 무시 */ } }
  const switcher = isAdmin ? (
    <div className="viewsw" role="tablist" aria-label="화면 선택">
      {([['student', '학생'], ['coach', '코치'], ['admin', '관리자']] as const).map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''}
          disabled={v === 'student' && !student} title={v === 'student' && !student ? '학생 화면용 기록이 아직 없어요' : `${l} 화면`}
          onClick={() => go(v)}>{l}</button>
      ))}
    </div>
  ) : null
  // 자료실 탭: 자료 보기·올리기·추천 앱·연습 플레이어도 자료실 안에 있는 화면
  const onBoard = ['/board', '/upload', '/apps', '/player', '/guide'].some(p => loc.pathname.startsWith(p)) || loc.pathname.startsWith('/score/')
  const links = (<>
            {adminView ? (
              <>
                <Link to="/admin" className={loc.pathname === '/admin' ? 'on' : ''}>회원 관리</Link>
                <Link to="/admin/scores" className={loc.pathname.startsWith('/admin/scores') ? 'on' : ''}>악보 전체</Link>
              </>
            ) : coachNav ? (
              <>
                <Link to="/" className={loc.pathname === '/' ? 'on' : ''}>홈</Link>
                <Link to="/board" className={onBoard ? 'on' : ''}>자료실</Link>
                <Link to="/lounge" className={loc.pathname === '/lounge' ? 'on' : ''}>코치 라운지</Link>
                <Link to="/teacher" className={loc.pathname.startsWith('/teacher') ? 'on' : ''}>내 학생</Link>
              </>
            ) : (
              <>
                <Link to="/" className={loc.pathname === '/' ? 'on' : ''}>홈</Link>
                <Link to="/board" className={onBoard ? 'on' : ''}>자료실</Link>
                <Link to="/playlist" className={loc.pathname === '/playlist' ? 'on' : ''}>플레이리스트</Link>
                <Link to="/saved" className={loc.pathname === '/saved' ? 'on' : ''}>내 보관함</Link>
              </>
            )}
  </>)
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="top">
        <div className="wrap">
          <Link to={adminView ? '/admin' : '/'} className="brand">
            <img src="/brand/logo_moduplay_white.png" alt={BRAND.app} className="logo" />
            <span className="sub">{BRAND.academy}</span>
          </Link>
          <nav>{links}</nav>
          <div className="spacer" />
          {!coachNav && !adminView && (
            <span className="ext-links hide-m">
              <a href={BRAND.online} target="_blank" rel="noreferrer">{BRAND.onlineName} ↗</a>
              <a href={BRAND.site} target="_blank" rel="noreferrer">학원 홈 ↗</a>
            </span>
          )}
          {right}
          {switcher && <div className="hide-m">{switcher}</div>}
          {!isAdmin && isTeacher && !coachNav && <Link to="/teacher" className="btn sm hide-m" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>코치 화면</Link>}
          {!isAdmin && teacher && student && <Link to="/" onClick={asStudent} className="btn sm hide-m" style={{ background: 'transparent', color: '#fff', borderColor: '#666' }}>학생 화면</Link>}
          <details className="dl">
            <summary className="avatar" title="내 계정" aria-label="내 계정" style={{ listStyle: 'none', cursor: 'pointer', ...(look ? { overflow: 'hidden', padding: 0, border: '2px solid #fff' } : {}) }}>
              {look ? <Avatar look={look} size={36} head title="내 계정" /> : initial}
            </summary>
            <div className="dl-menu" style={{ minWidth: 200 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <b style={{ display: 'block', color: 'var(--ink)' }}>{student?.name ?? (isAdmin ? '관리자' : isTeacher ? '코치님' : '')}</b>
                <span className="muted">{session?.user.email}</span>
              </div>
              <button onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setAvatarEdit(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {look ? <><Avatar look={look} size={28} head /> 내 캐릭터 꾸미기 <span className="muted" style={{ fontSize: 12 }}>{nickOf(look)}</span></> : <>🎸 내 캐릭터 만들기</>}
              </button>
              {!isAdmin && isTeacher && !coachNav && <Link to="/teacher" className="muted" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>코치 화면으로</Link>}
              {!isAdmin && teacher && student && <Link to="/" onClick={asStudent} style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>학생 화면으로</Link>}
              <a href={BRAND.online} target="_blank" rel="noreferrer" className="ext">{BRAND.onlineName} <span>↗ 새 창</span></a>
              <a href={BRAND.site} target="_blank" rel="noreferrer" className="ext">학원 홈 <span>↗ 새 창</span></a>
              <div className="sns" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }} aria-label="학원 공식 채널">
                {BRAND.sns.filter(x => x.url).map(x => (
                  <a key={x.name} href={x.url} target="_blank" rel="noreferrer" title={`모두의음악 ${x.name} (새 창)`} aria-label={x.name}>
                    <i style={{ background: x.color }} aria-hidden="true">{x.icon}</i>
                  </a>
                ))}
              </div>
              {!adminView && <button onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); restartTour(); nav('/?tour=1') }}>화면 안내 다시 보기</button>}
              {isAdmin && <button onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setNameEdit(true) }}>내 이름 바꾸기</button>}
              <button onClick={() => { if (confirm('로그아웃할까요?')) signOut() }}>로그아웃</button>
            </div>
          </details>
        </div>
      </header>
      {switcher && <div className="viewsw-m">{switcher}</div>}
      {nameEdit && <NameEdit onClose={() => setNameEdit(false)} />}
      {avatarEdit && <AvatarEdit onClose={() => setAvatarEdit(false)} />}
      <main className="page wrap">{children}</main>
      {/* 모바일: 하단 고정 바 (페이지가 넘겨주면 그걸, 아니면 메뉴 탭) */}
      <div className="tabbar">{bottomBar ?? <nav>{links}</nav>}</div>
      <footer className="bottom">
        <div className="wrap ft">
          <div className="ft-id">
            <b>{BRAND.academy}</b>
            <span>학생과 코치가 연습 자료를 나누는 공간입니다.</span>
          </div>
          <div className="ft-links">
            <nav className="sns" aria-label="학원 공식 채널">
              {BRAND.sns.filter(x => x.url).map(x => (
                <a key={x.name} href={x.url} target="_blank" rel="noreferrer" title={`모두의음악 ${x.name} (새 창)`}>
                  <i aria-hidden="true">{x.icon}</i>{x.name}
                </a>
              ))}
            </nav>
            <a className="ft-site" href={BRAND.site} target="_blank" rel="noreferrer">www.modu-music.com ↗</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
