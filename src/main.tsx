import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Saved from './pages/Saved'
import Lounge from './pages/Lounge'
import BulkPage from './pages/teacher/BulkPage'
import ScoreView from './pages/ScoreView'
// 무거운 화면은 열 때만 불러옴
const QrPrint = React.lazy(() => import('./pages/QrPrint'))
const Player = React.lazy(() => import('./pages/Player'))
import Board from './pages/Board'
import MuseScoreGuide from './pages/MuseScoreGuide'
import ToolSoon from './pages/ToolSoon'
import AppsGuide from './pages/AppsGuide'
// 플레이리스트는 내용이 커서 열 때만 불러옴
const Playlist = React.lazy(() => import('./pages/Playlist'))
import Students from './pages/teacher/Students'
import Admin from './pages/admin/Admin'
import AdminScores from './pages/admin/AdminScores'
import { ToolsProvider } from './lib/tools'
import { PracticeProvider } from './lib/practice'
const Stats = React.lazy(() => import('./pages/Stats'))
import ToolsDock from './components/ToolsDock'
import './styles.css'

// 학생 또는 코치 (악보 자료실·악보 보기·뮤즈스코어 안내는 코치도 학생처럼 씀)
function MemberGuard({ children }: { children: React.ReactElement }) {
  const { session, student, isTeacher, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to={loc.pathname === '/' && !loc.search ? '/login' : `/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (!student && !isTeacher) return <Navigate to="/login" replace />
  return children
}

function TeacherGuard({ children }: { children: React.ReactElement }) {
  const { session, isTeacher, loading } = useAuth()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!isTeacher) return <Navigate to="/" replace />
  return children
}

function AdminGuard({ children }: { children: React.ReactElement }) {
  const { session, isAdmin, loading } = useAuth()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/teacher" replace />
  return children
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PracticeProvider>
        <ToolsProvider>
        <Routes>
          <Route path="/me" element={<MemberGuard><React.Suspense fallback={<div className="loading">불러오는 중…</div>}><Stats /></React.Suspense></MemberGuard>} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<MemberGuard><Home /></MemberGuard>} />
          <Route path="/upload" element={<MemberGuard><Upload /></MemberGuard>} />
          <Route path="/saved" element={<MemberGuard><Saved /></MemberGuard>} />
          <Route path="/player" element={<MemberGuard><React.Suspense fallback={<div className="loading">불러오는 중…</div>}><Player /></React.Suspense></MemberGuard>} />
          <Route path="/score/:id/qr" element={<MemberGuard><React.Suspense fallback={<div className="loading">불러오는 중…</div>}><QrPrint /></React.Suspense></MemberGuard>} />
          <Route path="/lounge" element={<TeacherGuard><Lounge /></TeacherGuard>} />
          <Route path="/teacher/bulk" element={<TeacherGuard><BulkPage /></TeacherGuard>} />
          <Route path="/board" element={<MemberGuard><Board /></MemberGuard>} />
          <Route path="/apps" element={<MemberGuard><AppsGuide /></MemberGuard>} />
          <Route path="/tools/a" element={<Navigate to="/apps" replace />} />
          <Route path="/tools/b" element={<Navigate to="/playlist" replace />} />
          <Route path="/playlist" element={<MemberGuard><React.Suspense fallback={<div className="card loading" style={{ margin: 24, padding: 24 }}>플레이리스트 불러오는 중…</div>}><Playlist /></React.Suspense></MemberGuard>} />
          <Route path="/tools/:id" element={<MemberGuard><ToolSoon /></MemberGuard>} />
          <Route path="/guide/musescore" element={<MemberGuard><MuseScoreGuide /></MemberGuard>} />
          <Route path="/score/:id" element={<MemberGuard><ScoreView /></MemberGuard>} />
          <Route path="/teacher" element={<TeacherGuard><Students /></TeacherGuard>} />
          {/* 과제 기능은 정리함 (2026-10-31): 예전 주소는 자료 올리기로 */}
          <Route path="/teacher/scores" element={<Navigate to="/upload" replace />} />
          <Route path="/teacher/assign" element={<Navigate to="/upload" replace />} />
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
          <Route path="/admin/scores" element={<AdminGuard><AdminScores /></AdminGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToolsDock />
        </ToolsProvider>
        </PracticeProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)

// 홈 화면 앱(PWA): 실제 사이트에서만 서비스워커 등록
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
