import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// 1단계: 이메일 + 학원 코드. 카카오·구글·페이스북은 각 회사 앱 등록 후 아래 소셜 버튼을 켭니다.
const SOCIAL_ENABLED = false

export default function Login() {
  const { session, student, loading, refresh } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <div className="loading">불러오는 중…</div>
  if (session && student) return <Navigate to="/" replace />

  const needCode = !!session && !student

  async function submitAuth(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (!email.includes('@')) return setErr('이메일을 확인해 주세요.')
    if (password.length < 6) return setErr('비밀번호는 6자 이상이에요.')
    setBusy(true)
    const fn = mode === 'login'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { data, error } = await fn
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

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (!code.trim()) return setErr('선생님께 받은 학원 코드를 입력해 주세요.')
    setBusy(true)
    const { error } = await supabase.rpc('claim_academy_code', { code })
    setBusy(false)
    if (error) return setErr('사용할 수 없는 학원 코드예요. 선생님께 확인해 주세요.')
    await refresh()
  }

  async function social(provider: 'kakao' | 'google' | 'facebook') {
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
  }

  return (
    <div className="login">
      <div className="card box">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="mark">모</span>
          <span className="name">모두플레이</span>
        </div>
        <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: 14 }}>
          모두의음악 피아노학원 연주 자료실
        </p>

        {needCode || params.get('code') ? (
          <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>처음 오셨네요. 학원 코드를 한 번만 입력해 주세요.</p>
            <label className="field">
              <span>학원 코드</span>
              <input value={code} onChange={e => { setCode(e.target.value); setErr('') }} placeholder="MODU-7K3F" autoCapitalize="characters" />
            </label>
            {err && <p className="err">{err}</p>}
            <button className="btn primary wide" disabled={busy}>시작하기</button>
            <button type="button" className="btn wide" onClick={() => supabase.auth.signOut()}>다른 계정으로 로그인</button>
          </form>
        ) : (
          <>
            {SOCIAL_ENABLED && (
              <>
                <button className="btn wide" style={{ background: '#FEE500', borderColor: '#FEE500', color: '#191919' }} onClick={() => social('kakao')}>카카오로 시작하기</button>
                <button className="btn wide" onClick={() => social('google')}>구글로 시작하기</button>
                <button className="btn wide" onClick={() => social('facebook')}>페이스북으로 시작하기</button>
                <div className="divider">또는 이메일</div>
              </>
            )}
            <form onSubmit={submitAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
