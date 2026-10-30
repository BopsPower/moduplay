import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Library from './pages/Library'
import ScoreView from './pages/ScoreView'
import Board from './pages/Board'
import MuseScoreGuide from './pages/MuseScoreGuide'
import Students from './pages/teacher/Students'
import Scores from './pages/teacher/Scores'
import Assign from './pages/teacher/Assign'
import Admin from './pages/admin/Admin'
import './styles.css'

function Guard({ children }: { children: React.ReactElement }) {
  const { session, student, isTeacher, loading } = useAuth()
  if (loading) return <div className="loading">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!student && isTeacher) return <Navigate to="/teacher" replace />
  if (!student) return <Navigate to="/login" replace />
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
          <Route path="/board" element={<Guard><Board /></Guard>} />
          <Route path="/guide/musescore" element={<Guard><MuseScoreGuide /></Guard>} />
          <Route path="/score/:id" element={<Guard><ScoreView /></Guard>} />
          <Route path="/teacher" element={<TeacherGuard><Students /></TeacherGuard>} />
          <Route path="/teacher/scores" element={<TeacherGuard><Scores /></TeacherGuard>} />
          <Route path="/teacher/assign" element={<TeacherGuard><Assign /></TeacherGuard>} />
          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
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
