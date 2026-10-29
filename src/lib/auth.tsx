import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Student } from './supabase'

type AuthState = {
  session: Session | null
  student: Student | null
  isTeacher: boolean
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null, student: null, isTeacher: false, loading: true,
  refresh: async () => {}, signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [student, setStudent] = useState<Student | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadProfile(s: Session | null) {
    if (!s) { setStudent(null); setIsTeacher(false); return }
    const [{ data: st }, { data: t }] = await Promise.all([
      supabase.from('students').select('*').eq('user_id', s.user.id).maybeSingle(),
      supabase.from('teachers').select('user_id').eq('user_id', s.user.id).maybeSingle(),
    ])
    setStudent(st ?? null)
    setIsTeacher(!!t)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      await loadProfile(s)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{
      session, student, isTeacher, loading,
      refresh: () => loadProfile(session),
      signOut: async () => { await supabase.auth.signOut() },
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
