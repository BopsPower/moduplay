import { BRAND } from '../lib/brand'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// 카카오·구글·페이스북은 각 회사 앱 등록 후 true로 바꾸면 버튼이 나타납니다.
const SOCIAL = { kakao: false, google: false, facebook: false }

export default function Login() {
  const { session, student, isTeacher, loading, refresh } = useAuth()
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const [mode, setMode] = useState<'login' | 'signup'>(invite ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

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
  if (session && isTeacher && !student) return <Navigate to="/teacher" replace />
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

  async function social(provider: 'kakao' | 'google' | 'facebook') {
    const redirectTo = window.location.origin + (invite ? `/login?invite=${invite}` : '/')
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  }

  const notRegistered = session && !student && !isTeacher && !invite
  const anySocial = SOCIAL.kakao || SOCIAL.google || SOCIAL.facebook

  return (
    <div className="login">
      <div className="card box">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="mark">모</span>
          <span className="name">모두플레이</span>
        </div>
        <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: 14 }}>
          {BRAND.academy}
        </p>

        {notRegistered ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>아직 등록되지 않은 계정이에요</p>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              {session.user.email} 은 학원에 등록된 학생 이메일이 아니에요. 선생님께 이 이메일을 알려주시거나, 받은 초대 링크로 다시 들어와 주세요.
            </p>
            <button className="btn wide" onClick={() => supabase.auth.signOut()}>다른 계정으로 로그인</button>
          </div>
        ) : (
          <>
            {invite && <p style={{ margin: 0, fontSize: 14, textAlign: 'center', color: 'var(--accent)' }}>초대 링크로 오셨네요. 로그인하면 바로 연결돼요.</p>}
            {anySocial && (
              <>
                {SOCIAL.kakao && <button className="btn wide" style={{ background: '#FEE500', borderColor: '#FEE500', color: '#191919' }} onClick={() => social('kakao')}>카카오로 시작하기</button>}
                {SOCIAL.google && <button className="btn wide" onClick={() => social('google')}>구글로 시작하기</button>}
                {SOCIAL.facebook && <button className="btn wide" onClick={() => social('facebook')}>페이스북으로 시작하기</button>}
                <div className="divider">또는 이메일</div>
              </>
            )}
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
