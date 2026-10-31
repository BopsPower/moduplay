import { BRAND } from '../lib/brand'
import { IntroButton } from '../components/IntroVideo'
import React, { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import JoinRequest from '../components/JoinRequest'

type Provider = 'kakao' | 'google' | 'facebook'
// 학원생 로그인: 카카오 + 이메일 2가지. (구글·페이스북은 원장님 결정으로 제외, 아이콘 코드는 남겨 둠)
// 소셜 로그인은 Supabase 대시보드에서 켜는 순간 자동으로 동작(재배포 불필요). 꺼져 있으면 '준비 중'.
const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL ?? 'https://stnyjclifmcbxeorcoje.supabase.co') as string
const SUPA_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_hmkC7AtX0mpLovYJZbRkxA_C7ZQDZXm') as string

const ICONS: Record<Provider, React.ReactElement> = {
  kakao: <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3.5c-5 0-9 3.2-9 7.1 0 2.5 1.6 4.7 4.1 5.9l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.4 0 .8.1 1.2.1 5 0 9-3.2 9-7.2S17 3.5 12 3.5z"/></svg>,
  google: <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.8 9.4 6 12 6z"/></svg>,
  facebook: <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M13.5 21v-7.5h2.6l.4-3h-3v-1.9c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1z"/></svg>,
}
const SOCIAL: { id: Provider; label: string; style: React.CSSProperties }[] = [
  { id: 'kakao', label: '카카오로 시작하기', style: { background: '#FEE500', borderColor: '#FEE500', color: '#191919' } },
]

// 로그인 뒤 돌아갈 주소 (카카오 로그인처럼 다른 사이트를 다녀와도 기억)
function goNext(): string | null {
  const p = new URLSearchParams(window.location.search).get('next')
  try {
    if (p && p.startsWith('/') && !p.startsWith('//')) { sessionStorage.setItem('mp_next', p); return p }
    return sessionStorage.getItem('mp_next')
  } catch { return p && p.startsWith('/') && !p.startsWith('//') ? p : null }
}
function clearNext() { try { sessionStorage.removeItem('mp_next') } catch { /* 무시 */ } }

export default function Login() {
  const { session, student, isTeacher, isAdmin, loading, refresh } = useAuth()
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const [mode, setMode] = useState<'login' | 'signup'>(invite ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})

  // 어떤 소셜 로그인이 켜져 있는지 Supabase에 물어봄
  useEffect(() => {
    if (!SUPA_URL || !SUPA_KEY) return
    fetch(SUPA_URL + '/auth/v1/settings', { headers: { apikey: SUPA_KEY } })
      .then(r => r.json()).then(j => setEnabled(j.external ?? {})).catch(() => {})
  }, [])

  // 초대 링크로 들어와 로그인된 경우: 자동 연결
  useEffect(() => {
    if (session && !student && invite) {
      supabase.rpc('claim_invite', { token: invite }).then(({ error }) => {
        if (error) setErr('사용할 수 없는 초대 링크예요. 학원에 문의해 주세요.')
        else refresh()
      })
    }
  }, [session, student, invite])

  if (loading) return <div className="loading">불러오는 중…</div>
  // QR 등으로 특정 자료를 열려다 로그인한 경우: 그 자료로 돌아감
  const next = goNext()
  if (session && next && (student || isTeacher)) { clearNext(); return <Navigate to={next} replace /> }
  if (session && isAdmin) {
    let v = 'coach'; try { v = localStorage.getItem('mp_view') || 'coach' } catch { /* 기본: 코치 화면 */ }
    return <Navigate to={v === 'admin' ? '/admin' : v === 'student' && student ? '/' : '/teacher'} replace />
  }
  if (session && isTeacher && !student) return <Navigate to="/" replace />
  if (session && student) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setInfo('')
    if (!email.includes('@')) return setErr('이메일을 확인해 주세요.')
    if (password.length < 6) return setErr('비밀번호는 6자 이상이에요.')
    setBusy(true)
    const { data, error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) {
      if (error.message.includes('already registered')) return setErr('이미 가입된 이메일이에요. 로그인해 주세요.')
      if (error.message.includes('not confirmed')) return setErr('이메일 인증이 아직 안 됐어요. 받은 메일함을 확인해 주세요.')
      return setErr(mode === 'login' ? '이메일이나 비밀번호가 맞지 않아요.' : error.message)
    }
    if (mode === 'signup' && data.user && !data.session) {
      setInfo(`${email} 로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.`)
    }
  }

  async function social(provider: Provider) {
    setErr('')
    if (!enabled[provider]) return setErr('이 로그인은 아직 준비 중이에요. 이메일로 로그인해 주세요.')
    const redirectTo = window.location.origin + (invite ? `/login?invite=${invite}` : '/')
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  }

  const notRegistered = session && !student && !isTeacher && !invite

  return (
    <div className="login">
      <div className="card box">
        <img src="/brand/logo_moduplay.png" alt={BRAND.app} className="login-logo" />
        <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: 14 }}>
          {BRAND.academy}
        </p>
        <div style={{ textAlign: 'center' }}><IntroButton /></div>

        {notRegistered ? (
          <JoinRequest session={session!} onApproved={refresh} />
        ) : (
          <>
            {invite && <p style={{ margin: 0, fontSize: 14, textAlign: 'center', color: 'var(--accent)' }}>초대 링크로 오셨네요. 로그인하면 바로 연결돼요.</p>}
            <div className="social">
              {SOCIAL.map(o => (
                <button key={o.id} type="button" className="btn wide social-btn" style={o.style} onClick={() => social(o.id)}>
                  <span className="ic">{ICONS[o.id]}</span>
                  <span>{o.label}</span>
                  {!enabled[o.id] && <span className="soon">준비 중</span>}
                </button>
              ))}
            </div>
            <div className="divider">또는 이메일로 {mode === 'login' ? '로그인' : '가입'}</div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field">
                <span>이메일</span>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr('') }} placeholder="name@example.com" autoComplete="email" />
              </label>
              <label className="field">
                <span>비밀번호</span>
                <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErr('') }} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </label>
              {err && <p className="err">{err}</p>}
              {info && <p style={{ margin: 0, fontSize: 13, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}>{info}</p>}
              <button className="btn primary wide" disabled={busy}>{busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하기'}</button>
            </form>
            <button className="btn wide" style={{ border: 'none' }} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); setInfo('') }}>
              {mode === 'login' ? '처음이에요 · 가입하기' : '이미 계정이 있어요 · 로그인'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
