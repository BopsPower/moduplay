import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Library from './pages/Library'
import ScoreView from './pages/ScoreView'
import Board from './pages/Board'
import MuseScoreGuide from './pages/MuseScoreGuide'
import ToolSoon from './pages/ToolSoon'
import AppsGuide from './pages/AppsGuide'
import Playlist from './pages/Playlist'
import Students from './pages/teacher/Students'
import Assign from './pages/teacher/Assign'
import Admin from './pages/admin/Admin'
import AdminScores from './pages/admin/AdminScores'
import './styles.css'

function Guard({ children }: { children: React.ReactElement }) {
  const { session, student, isTeacher, loading } = useAuth()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!student && isTeacher) return <Navigate to="/teacher" replace />
  if (!student) return <Navigate to="/login" replace />
  return children
}

// 학생 또는 코치 (악보 자료실·악보 보기·뮤즈스코어 안내는 코치도 학생처럼 씀)
function MemberGuard({ children }: { children: React.ReactElement }) {
  const { session, student, isTeacher, loading } = useAuth()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Library /></Guard>} />
          <Route path="/board" element={<MemberGuard><Board /></MemberGuard>} />
          <Route path="/apps" element={<MemberGuard><AppsGuide /></MemberGuard>} />
          <Route path="/tools/a" element={<Navigate to="/apps" replace />} />
          <Route path="/tools/b" element={<Navigate to="/playlist" replace />} />
          <Route path="/playlist" element={<MemberGuard><Playlist /></MemberGuard>} />
          <Route path="/tools/:id" element={<MemberGuard><ToolSoon /></MemberGuard>} />
          <Route path="/guide/musescore" element={<MemberGuard><MuseScoreGuide /></MemberGuard>} />
          <Route path="/score/:id" element={<MemberGuard><ScoreView /></MemberGuard>} />
          <Route path="/teacher" element={<TeacherGuard><Students /></TeacherGuard>} />
          <Route path="/teacher/scores" element={<Navigate to="/teacher/assign" replace />} />
          <Route path="/teacher/assign" element={<TeacherGuard><Assign /></TeacherGuard>} />
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
          <Route path="/admin/scores" element={<AdminGuard><AdminScores /></AdminGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
