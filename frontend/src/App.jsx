import { useEffect, useState } from 'react'
import { api, clearSession, hasSession } from './api'
import AuthPage from './pages/AuthPage'
import AdminApp from './pages/AdminApp'
import TenantApp from './pages/TenantApp'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(hasSession())
  const [theme, setThemeState] = useState(() => localStorage.getItem('homely_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('homely_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!hasSession()) return
    api('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => clearSession())
      .finally(() => setChecking(false))
  }, [])

  function logout() {
    clearSession()
    setUser(null)
  }

  if (checking) return <div className="launch-screen"><div className="brand-mark"><span>H</span></div><p>Preparing your home…</p></div>
  if (!user) return <AuthPage onAuthenticated={setUser} />
  if (user.role === 'admin') return <AdminApp user={user} theme={theme} setTheme={setThemeState} onLogout={logout} />
  return <TenantApp user={user} theme={theme} setTheme={setThemeState} onLogout={logout} />
}

export default App

