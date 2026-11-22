import { useEffect, useState } from 'react'
import { api, saveSession } from '../api'
import Icon from '../components/Icon'

export default function AuthPage({ onAuthenticated }) {
  const [status, setStatus] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', password: '', setupKey: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/auth/status').then(setStatus).catch((err) => setError(err.message))
  }, [])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const path = status?.bootstrapRequired ? '/auth/bootstrap' : '/auth/login'
      const session = await api(path, { method: 'POST', body: JSON.stringify(form) })
      saveSession(session)
      onAuthenticated(session.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><div className="brand-mark"><span>H</span></div><strong>Homely Tenants</strong></div>
        <div className="story-copy">
          <span className="story-pill"><Icon name="spark" size={16} /> Your home, clearly managed</span>
          <h1>Every room.<br />Every payment.<br /><em>Peacefully in place.</em></h1>
          <p>A calm, transparent space for rent, electricity and the little details that make a house feel managed.</p>
        </div>
        <div className="story-card">
          <div className="mini-orb"><Icon name="home" /></div>
          <div><small>Built for everyday clarity</small><strong>Simple for tenants. Powerful for owners.</strong></div>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="mobile-brand"><div className="brand-mark"><span>H</span></div><strong>Homely Tenants</strong></div>
          <span className="eyebrow">{status?.bootstrapRequired ? 'FIRST-TIME SETUP' : 'WELCOME HOME'}</span>
          <h2>{status?.bootstrapRequired ? 'Create the owner account' : 'Sign in to continue'}</h2>
          <p>{status?.bootstrapRequired ? 'This can only be completed once.' : 'Use your registered 10-digit phone number.'}</p>
          {status?.bootstrapRequired && (
            <label><span>Your name</span><input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Property owner" /></label>
          )}
          <label><span>Phone number</span><div className="input-prefix"><b>+91</b><input required inputMode="numeric" pattern="[0-9]{10}" maxLength="10" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} placeholder="98765 43210" /></div></label>
          <label><span>Password</span><div className="password-field"><input required minLength="8" type={showPassword ? 'text' : 'password'} autoComplete={status?.bootstrapRequired ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          {status?.bootstrapRequired && status.setupKeyRequired && (
            <label><span>Private setup key</span><input required type="password" value={form.setupKey} onChange={(e) => setForm({ ...form, setupKey: e.target.value })} placeholder="From the server environment" /></label>
          )}
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button auth-submit" disabled={busy || !status}>{busy ? 'Please wait…' : status?.bootstrapRequired ? 'Create owner account' : 'Sign in'}<Icon name="arrow" /></button>
          <small className="security-note">Passwords are encrypted and can never be viewed after they are saved.</small>
        </form>
      </section>
    </main>
  )
}

