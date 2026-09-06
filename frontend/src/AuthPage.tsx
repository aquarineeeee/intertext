import { FormEvent, useMemo, useState } from 'react'
import { api } from './api'

type AuthMode = 'login' | 'register'
type AuthPageProps = { mode: AuthMode; onNavigate: (path: string) => void }

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 3 18 18" /><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18.7 18.7 0 0 1-3.1 3.7M6.5 6.8C3.6 8.4 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
  )
}

function AuthPage({ mode, onNavigate }: AuthPageProps) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'
  const passwordHint = useMemo(() => {
    if (!isRegister || password.length === 0) return null
    return password.length >= 8 ? '密码长度符合要求' : '至少需要 8 个字符'
  }, [isRegister, password.length])

  const switchMode = (nextMode: AuthMode) => {
    setError(null)
    onNavigate(nextMode === 'register' ? '/register' : '/login')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return setError('请输入邮箱地址。')
    if (!password) return setError('请输入密码。')
    if (isRegister && password.length < 8) return setError('密码至少需要 8 个字符。')
    if (isRegister && password !== confirmPassword) return setError('两次输入的密码不一致。')
    setSubmitting(true)
    try {
      if (isRegister) await api.register(normalizedEmail, password, displayName.trim())
      else await api.login(normalizedEmail, password)
      onNavigate('/library')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '操作失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-grain" aria-hidden="true" />
      <section className="auth-layout" aria-labelledby={isRegister ? 'auth-title' : undefined} aria-label={!isRegister ? 'Sign in' : undefined}>
        <div className="auth-center">
          <button className="auth-logo" type="button" onClick={() => onNavigate('/')} aria-label="返回 Intertext 首页">Intertext</button>
          <div className="auth-form-wrap">
            {isRegister && <div className="auth-card-heading"><h1 id="auth-title">Create an account</h1></div>}
            <form onSubmit={submit} noValidate>
              {isRegister && <label className="auth-field"><span>称呼 <small>可选</small></span><input type="text" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="你希望我们如何称呼你" maxLength={100} autoComplete="name" /></label>}
              <label className="auth-field"><span>Email address</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="reader@example.com" autoComplete="email" required /></label>
              <label className="auth-field"><span>Security cipher {passwordHint && <small className={passwordHint.includes('符合') ? 'is-valid' : ''}>{passwordHint}</small>}</span><span className="auth-password-wrap"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={isRegister ? '至少 8 个字符' : '••••••••'} autoComplete={isRegister ? 'new-password' : 'current-password'} required /><button type="button" className="auth-icon-button" onClick={() => setShowPassword(value => !value)} title={showPassword ? '隐藏密码' : '显示密码'} aria-label={showPassword ? '隐藏密码' : '显示密码'}><EyeIcon visible={showPassword} /></button></span></label>
              {isRegister && <label className="auth-field"><span>确认密码</span><span className="auth-password-wrap"><input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="再次输入密码" autoComplete="new-password" required /><button type="button" className="auth-icon-button" onClick={() => setShowConfirmPassword(value => !value)} title={showConfirmPassword ? '隐藏密码' : '显示密码'} aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}><EyeIcon visible={showConfirmPassword} /></button></span></label>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '请稍候…' : isRegister ? 'Create account' : 'Sign in'}</button>
            </form>
            {!isRegister && <p className="auth-forgot">Forgot password?</p>}
            <div className="auth-account-link"><span>{isRegister ? 'Already have an account?' : 'New to Intertext?'}</span><button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')}>{isRegister ? 'Sign in' : 'Create new account'}</button></div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default AuthPage
