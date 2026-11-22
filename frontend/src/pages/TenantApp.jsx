import { useEffect, useState } from 'react'
import { api } from '../api'
import Shell, { EmptyState } from '../components/Shell'
import Icon from '../components/Icon'

const nav = [
  { id: 'overview', label: 'My overview', short: 'Home', icon: 'home' },
  { id: 'ledger', label: 'Bills & ledger', short: 'Bills', icon: 'ledger' },
  { id: 'usage', label: 'Electricity usage', short: 'Usage', icon: 'bolt' },
  { id: 'payments', label: 'Payments', icon: 'wallet' },
  { id: 'notifications', label: 'Notifications', short: 'Alerts', icon: 'bell' },
  { id: 'activity', label: 'Account activity', icon: 'history' },
]

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const dateOnly = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })

export default function TenantApp({ user, theme, setTheme, onLogout }) {
  const [page, setPage] = useState('overview')
  const [data, setData] = useState({ dashboard: null, ledger: [], payments: [], readings: [], logs: [], notifications: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setError('')
    try {
      const [dashboard, ledger, payments, readings, logs, notifications] = await Promise.all([
        api('/tenant/dashboard'), api('/tenant/ledger'), api('/tenant/payments'), api('/tenant/meter-readings'), api('/tenant/audit-logs'), api('/tenant/notifications'),
      ])
      setData({ dashboard, ledger, payments, readings, logs, notifications })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(refresh, 0)
    return () => clearTimeout(timer)
  }, [])

  async function readNotification(id) {
    try {
      await api(`/tenant/notifications/${id}/read`, { method: 'PATCH' })
      setData((current) => ({ ...current, notifications: current.notifications.map((item) => item._id === id ? { ...item, readAt: new Date().toISOString() } : item) }))
    } catch (err) { setError(err.message) }
  }

  const unread = data.notifications.filter((item) => !item.readAt).length
  return <Shell user={user} nav={nav} page={page} setPage={setPage} theme={theme} setTheme={setTheme} onLogout={onLogout} badge={unread}>
    {error && <div className="page-error">{error}<button onClick={refresh}>Try again</button></div>}
    {loading ? <div className="loading-grid"><div /><div /><div /><div /></div> : <>
      {page === 'overview' && <Overview data={data.dashboard} setPage={setPage} />}
      {page === 'ledger' && <TenantLedger entries={data.ledger} dashboard={data.dashboard} />}
      {page === 'usage' && <Usage readings={data.readings} room={data.dashboard?.tenant?.room} />}
      {page === 'payments' && <TenantPayments payments={data.payments} />}
      {page === 'notifications' && <Notifications notifications={data.notifications} onRead={readNotification} />}
      {page === 'activity' && <TenantActivity logs={data.logs} />}
    </>}
  </Shell>
}

function Overview({ data, setPage }) {
  const tenant = data.tenant
  const due = Math.max(0, data.balance || 0)
  return <div className="page-stack">
    <section className="tenant-hero">
      <div className="tenant-hero-copy"><span className="eyebrow">GOOD TO SEE YOU, {tenant.name.split(' ')[0].toUpperCase()}</span><h2>Your home finances,<br /><em>beautifully clear.</em></h2><p>Everything about {tenant.room?.name} is collected here, without the clutter.</p></div>
      <div className="balance-orb"><span>Current balance</span><strong>{inr.format(due)}</strong><small>{due > 0 ? 'Amount currently due' : 'You are all clear'}</small></div>
    </section>
    <section className="tenant-stats">
      <article><span className="activity-icon green"><Icon name="check" /></span><div><small>Rent paid through</small><strong>{dateTime.format(new Date(tenant.rentPaidThrough))}</strong></div></article>
      <article><span className="activity-icon violet"><Icon name="rooms" /></span><div><small>Your room</small><strong>{tenant.room?.name}</strong><em>{tenant.room?.type} · {inr.format(tenant.room?.monthlyRent || 0)}/month</em></div></article>
      <article><span className="activity-icon amber"><Icon name="bolt" /></span><div><small>Latest meter</small><strong>{data.latestReading?.units ?? 'Not recorded'}</strong><em>{data.latestReading ? `${data.latestReading.consumedUnits} recent units` : 'Waiting for opening reading'}</em></div></article>
    </section>
    <section className="split-grid">
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">BALANCE BREAKDOWN</span><h3>What makes up your balance</h3></div></div><div className="balance-breakdown"><div><span><i className="rent-color" />Rent</span><strong>{inr.format(data.categories.rent || 0)}</strong></div><div><span><i className="electric-color" />Electricity</span><strong>{inr.format(data.categories.electricity || 0)}</strong></div><div><span><i className="general-color" />Other opening balance</span><strong>{inr.format(data.categories.general || 0)}</strong></div></div><button className="soft-button full-button" onClick={() => setPage('ledger')}>Open detailed ledger <Icon name="arrow" /></button></article>
      <article className="panel calm-panel"><span className="calm-icon"><Icon name="home" size={28} /></span><h3>A quieter way to stay informed.</h3><p>When your electricity is updated or a payment is recorded, you’ll see it here immediately.</p><button className="text-button" onClick={() => setPage('notifications')}>View notifications <Icon name="arrow" size={16} /></button></article>
    </section>
  </div>
}

function TenantLedger({ entries, dashboard }) {
  const [filter, setFilter] = useState('all')
  const visible = filter === 'all' ? entries : entries.filter((entry) => entry.category === filter)
  return <div className="page-stack printable"><div className="section-toolbar"><div><h2>Your complete statement</h2><p>Every charge and payment, ordered by date.</p></div><button className="soft-button" onClick={() => window.print()}><Icon name="print" />Print statement</button></div><section className="statement-summary"><div><span>Current balance</span><strong>{inr.format(Math.max(0, dashboard.balance))}</strong></div><div><span>Rent paid through</span><strong>{dateTime.format(new Date(dashboard.tenant.rentPaidThrough))}</strong></div><div><span>Room</span><strong>{dashboard.tenant.room?.name}</strong></div></section><div className="segment-control">{['all', 'rent', 'electricity', 'general'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>{visible.length ? <div className="ledger-list">{visible.map((entry) => <article className="ledger-row" key={entry._id}><span className={`entry-dot ${entry.amount < 0 ? 'credit' : entry.category}`} /><div><strong>{entry.description}</strong><small>{dateTime.format(new Date(entry.effectiveAt))}</small></div><span className="category-chip">{entry.category}</span><b className={entry.amount < 0 ? 'clear' : 'due'}>{entry.amount < 0 ? '−' : '+'}{inr.format(Math.abs(entry.amount))}</b></article>)}</div> : <EmptyState icon="ledger" title="Nothing in this category" text="Entries will appear as they are added." />}</div>
}

function Usage({ readings, room }) {
  const max = Math.max(1, ...readings.map((item) => item.consumedUnits))
  return <div className="page-stack"><div className="section-toolbar"><div><h2>{room?.name} electricity</h2><p>Read-only meter history for your room.</p></div></div>{readings.length > 1 && <section className="usage-chart panel"><div className="panel-head"><div><span className="eyebrow">RECENT CONSUMPTION</span><h3>Units between readings</h3></div></div><div className="bars">{[...readings].reverse().slice(-8).map((item) => <div key={item._id}><span style={{ height: `${Math.max(5, (item.consumedUnits / max) * 100)}%` }}><em>{item.consumedUnits}</em></span><small>{dateOnly.format(new Date(item.readAt)).split(' ')[0]}</small></div>)}</div></section>}{readings.length ? <div className="card-list">{readings.map((item) => <article className="list-card" key={item._id}><span className="activity-icon amber"><Icon name="bolt" /></span><div className="list-main"><div><strong>{item.isOpening ? 'Opening meter reading' : `${item.consumedUnits} units consumed`}</strong></div><small>{dateTime.format(new Date(item.readAt))} · ₹{item.rate}/unit</small></div><div className="reading-values"><span><small>Previous</small><b>{item.previousUnits ?? '—'}</b></span><Icon name="arrow" /><span><small>Current</small><b>{item.units}</b></span></div><strong>{inr.format(item.totalCharge)}</strong></article>)}</div> : <EmptyState icon="bolt" title="No readings yet" text="Your first meter reading will appear here." />}</div>
}

function TenantPayments({ payments }) {
  return <div className="page-stack printable"><div className="section-toolbar"><div><h2>Your receipts</h2><p>A simple record of every payment received.</p></div><button className="soft-button" onClick={() => window.print()}><Icon name="print" />Print receipts</button></div>{payments.length ? <div className="receipt-grid">{payments.map((item) => <article className="receipt-card" key={item._id}><header><span className="activity-icon green"><Icon name="check" /></span><div><small>PAYMENT RECEIVED</small><strong>{inr.format(item.totalAmount)}</strong></div></header><div><span>Date<b>{dateTime.format(new Date(item.paidAt))}</b></span><span>Receipt number<b>{item._id.slice(-8).toUpperCase()}</b></span><span>Rent allocation<b>{inr.format(item.rentAmount)}</b></span><span>Electricity allocation<b>{inr.format(item.electricityAmount)}</b></span></div>{item.note && <footer>{item.note}</footer>}</article>)}</div> : <EmptyState icon="wallet" title="No payments yet" text="Receipts appear as soon as the owner records a payment." />}</div>
}

function Notifications({ notifications, onRead }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Updates for you</h2><p>Payments, electricity bills and month-end reminders.</p></div></div>{notifications.length ? <div className="notification-list">{notifications.map((item) => <button key={item._id} className={item.readAt ? 'read' : ''} onClick={() => !item.readAt && onRead(item._id)}><span className={`activity-icon ${item.type === 'payment' ? 'green' : item.type === 'electricity' ? 'amber' : 'violet'}`}><Icon name={item.type === 'payment' ? 'wallet' : item.type === 'electricity' ? 'bolt' : 'bell'} /></span><div><strong>{item.title}</strong><p>{item.message}</p><small>{dateTime.format(new Date(item.createdAt))}</small></div>{!item.readAt && <i />}</button>)}</div> : <EmptyState icon="bell" title="You’re all caught up" text="New account updates will appear here." />}</div>
}

function TenantActivity({ logs }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Your account activity</h2><p>Only Admin actions connected to your account are visible here.</p></div></div>{logs.length ? <div className="timeline">{logs.map((log) => <article key={log._id}><span className="timeline-dot"><Icon name="history" size={16} /></span><div><div><strong>{log.action.replace('_', ' ')}</strong><span className="status">{log.entityType.replace('_', ' ')}</span></div><p>{log.reason}</p><small>{log.actor?.name || 'Administrator'} · {dateTime.format(new Date(log.createdAt))}</small></div></article>)}</div> : <EmptyState icon="history" title="No account changes" text="Manual changes made by the owner will appear here." />}</div>
}

