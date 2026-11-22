import { useState } from 'react'
import Icon from './Icon'

export default function Shell({ user, nav, page, setPage, theme, setTheme, onLogout, children, badge = 0 }) {
  const [open, setOpen] = useState(false)
  const active = nav.find((item) => item.id === page) || nav[0]

  function choose(id) {
    setPage(id)
    setOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span>H</span></div>
          <div><strong>Homely</strong><small>Tenants</small></div>
        </div>
        <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>
        <nav className="nav-list">
          {nav.map((item) => (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => choose(item.id)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'notifications' && badge > 0 && <em>{badge}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="avatar">{user.name?.slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.name}</strong><span>{user.role === 'admin' ? 'Property owner' : 'Tenant account'}</span></div>
          <button onClick={onLogout} aria-label="Log out"><Icon name="logout" /></button>
        </div>
      </aside>
      {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div><span className="eyebrow">{user.role === 'admin' ? 'OWNER CONSOLE' : 'MY HOME'}</span><h1>{active.label}</h1></div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <div className="top-avatar">{user.name?.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>

      <nav className="mobile-nav">
        {nav.slice(0, 5).map((item) => (
          <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => choose(item.id)}>
            <Icon name={item.icon} size={19} /><span>{item.short || item.label}</span>
            {item.id === 'notifications' && badge > 0 && <em>{badge}</em>}
          </button>
        ))}
        {nav.length > 5 && <button onClick={() => setOpen(true)}><Icon name="menu" size={19} /><span>More</span></button>}
      </nav>
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div>
        {children}
      </section>
    </div>
  )
}

export function EmptyState({ icon = 'spark', title, text, action }) {
  return <div className="empty-state"><span><Icon name={icon} size={26} /></span><h3>{title}</h3><p>{text}</p>{action}</div>
}

