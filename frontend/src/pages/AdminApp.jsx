import { useEffect, useState } from 'react'
import { api } from '../api'
import Shell, { EmptyState, Modal } from '../components/Shell'
import Icon from '../components/Icon'

const nav = [
  { id: 'dashboard', label: 'Overview', short: 'Home', icon: 'home' },
  { id: 'rooms', label: 'Rooms', icon: 'rooms' },
  { id: 'tenants', label: 'Tenants', icon: 'users' },
  { id: 'meter', label: 'Meter readings', short: 'Meter', icon: 'bolt' },
  { id: 'payments', label: 'Payments', icon: 'wallet' },
  { id: 'ledger', label: 'Billing ledger', icon: 'ledger' },
  { id: 'settings', label: 'Configuration', icon: 'settings' },
  { id: 'audit', label: 'Audit history', icon: 'history' },
]

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const inputDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(value))

function StatCard({ label, value, detail, tone, icon }) {
  return <article className={`stat-card ${tone || ''}`}><div className="stat-icon"><Icon name={icon} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function Status({ value }) {
  const normalized = String(value).toLowerCase().replace('_', ' ')
  return <span className={`status status-${normalized.replace(' ', '-')}`}>{normalized}</span>
}

function FormActions({ onClose, busy, label = 'Save changes' }) {
  return <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : label}<Icon name="check" /></button></div>
}

function Field({ label, hint, children, wide = false }) {
  return <label className={wide ? 'field-wide' : ''}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export default function AdminApp({ user, theme, setTheme, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [data, setData] = useState({ dashboard: {}, rooms: [], tenants: [], ledger: [], payments: [], readings: [], config: {}, audit: [] })
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  async function refresh(quiet = false) {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [dashboard, rooms, tenants, ledger, payments, readings, config, audit] = await Promise.all([
        api('/admin/dashboard'), api('/admin/rooms'), api('/admin/tenants'), api('/admin/ledger'),
        api('/admin/payments'), api('/admin/meter-readings'), api('/admin/configuration'), api('/admin/audit-logs'),
      ])
      setData({ dashboard, rooms, tenants, ledger, payments, readings, config, audit })
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

  async function submit(path, options, success) {
    await api(path, options)
    setModal(null)
    setToast(success)
    setTimeout(() => setToast(''), 3500)
    await refresh(true)
  }

  const activeTenants = data.tenants.filter((tenant) => tenant.status === 'active')
  const activeRooms = data.rooms.filter((room) => room.active)

  return (
    <Shell user={user} nav={nav} page={page} setPage={setPage} theme={theme} setTheme={setTheme} onLogout={onLogout}>
      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
      {error && <div className="page-error">{error}<button onClick={() => refresh()}>Try again</button></div>}
      {loading ? <Loading /> : (
        <>
          {page === 'dashboard' && <Dashboard data={data.dashboard} setPage={setPage} setModal={setModal} />}
          {page === 'rooms' && <Rooms rooms={data.rooms} setModal={setModal} />}
          {page === 'tenants' && <Tenants tenants={data.tenants} setModal={setModal} />}
          {page === 'meter' && <Meter readings={data.readings} rooms={activeRooms} setModal={setModal} />}
          {page === 'payments' && <Payments payments={data.payments} tenants={activeTenants} setModal={setModal} />}
          {page === 'ledger' && <Ledger entries={data.ledger} tenants={data.tenants} setModal={setModal} />}
          {page === 'settings' && <Settings config={data.config} rooms={activeRooms} setModal={setModal} />}
          {page === 'audit' && <Audit logs={data.audit} />}
        </>
      )}
      {modal?.type === 'room' && <RoomForm room={modal.data} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'tenant' && <TenantForm tenant={modal.data} rooms={activeRooms} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'archive' && <ArchiveForm tenant={modal.data} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'password' && <PasswordForm tenant={modal.data} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'meter' && <MeterForm rooms={activeRooms} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'payment' && <PaymentForm tenants={activeTenants} initialTenant={modal.data} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'adjustment' && <AdjustmentForm tenants={data.tenants} onClose={() => setModal(null)} onSubmit={submit} />}
      {modal?.type === 'settings' && <SettingsForm config={data.config} rooms={activeRooms} onClose={() => setModal(null)} onSubmit={submit} />}
    </Shell>
  )
}

function Loading() {
  return <div className="loading-grid"><div /><div /><div /><div /></div>
}

function Dashboard({ data, setPage, setModal }) {
  return <div className="page-stack">
    <section className="welcome-panel">
      <div><span className="eyebrow">TODAY AT A GLANCE</span><h2>Everything is comfortably in place.</h2><p>Track rooms, balances and the latest activity from one calm workspace.</p></div>
      <div className="welcome-actions"><button className="primary-button" onClick={() => setModal({ type: 'payment' })}><Icon name="plus" />Record payment</button><button className="soft-button" onClick={() => setModal({ type: 'meter' })}><Icon name="bolt" />Add meter reading</button></div>
    </section>
    <section className="stats-grid">
      <StatCard label="Outstanding balance" value={inr.format(data.totalDue || 0)} detail="Across all tenant accounts" tone="coral" icon="wallet" />
      <StatCard label="Active tenants" value={data.activeTenants || 0} detail="Currently living on property" tone="green" icon="users" />
      <StatCard label="Active rooms" value={data.activeRooms || 0} detail="Single and double rooms" tone="violet" icon="rooms" />
      <StatCard label="System status" value="On track" detail="Daily recovery protection active" tone="blue" icon="check" />
    </section>
    <section className="split-grid">
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Latest payments</h3></div><button className="text-button" onClick={() => setPage('payments')}>View all <Icon name="arrow" size={16} /></button></div>
        {data.recentPayments?.length ? <div className="activity-list">{data.recentPayments.map((item) => <div className="activity-row" key={item._id}><span className="activity-icon green"><Icon name="wallet" /></span><div><strong>{item.tenant?.name || 'Archived tenant'}</strong><small>{dateTime.format(new Date(item.paidAt))}</small></div><b>{inr.format(item.totalAmount)}</b></div>)}</div> : <EmptyState icon="wallet" title="No payments yet" text="New payments will appear here." />}
      </div>
      <div className="panel"><div className="panel-head"><div><span className="eyebrow">ELECTRICITY</span><h3>Recent readings</h3></div><button className="text-button" onClick={() => setPage('meter')}>View all <Icon name="arrow" size={16} /></button></div>
        {data.recentReadings?.length ? <div className="activity-list">{data.recentReadings.map((item) => <div className="activity-row" key={item._id}><span className="activity-icon amber"><Icon name="bolt" /></span><div><strong>{item.room?.name}</strong><small>{item.consumedUnits} units consumed</small></div><b>{item.units}</b></div>)}</div> : <EmptyState icon="bolt" title="No readings yet" text="Add the opening meter reading for each room." />}
      </div>
    </section>
  </div>
}

function Rooms({ rooms, setModal }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Rooms & pricing</h2><p>Each room carries its own monthly rent and meter.</p></div><button className="primary-button" onClick={() => setModal({ type: 'room' })}><Icon name="plus" />Add room</button></div>
    {rooms.length ? <div className="room-grid">{rooms.map((room) => { const capacity = room.type === 'double' ? 2 : 1; return <article className={`room-card ${!room.active ? 'muted-card' : ''}`} key={room._id}><div className="room-top"><span className="room-icon"><Icon name="rooms" /></span><Status value={room.active ? 'active' : 'archived'} /></div><h3>{room.name}</h3><p>{room.type === 'double' ? 'Double occupancy' : 'Single occupancy'}</p><div className="occupancy"><div><span style={{ width: `${Math.min(100, (room.occupants / capacity) * 100)}%` }} /></div><small>{room.occupants} of {capacity} occupied</small></div><footer><div><small>Monthly rent</small><strong>{inr.format(room.monthlyRent)}</strong></div>{room.active && <button className="icon-button" onClick={() => setModal({ type: 'room', data: room })}><Icon name="edit" /></button>}</footer></article> })}</div> : <EmptyState icon="rooms" title="Create your first room" text="Add a single or double room to begin." action={<button className="primary-button" onClick={() => setModal({ type: 'room' })}>Add room</button>} />}
  </div>
}

function Tenants({ tenants, setModal }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Tenant directory</h2><p>Accounts, rooms, balances and paid-through dates.</p></div><button className="primary-button" onClick={() => setModal({ type: 'tenant' })}><Icon name="plus" />Add tenant</button></div>
    {tenants.length ? <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Room</th><th>Status</th><th>Paid through</th><th className="align-right">Balance</th><th /></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant._id}><td><div className="person-cell"><span>{tenant.name.slice(0, 1)}</span><div><strong>{tenant.name}</strong><small>{tenant.phone}</small></div></div></td><td>{tenant.room?.name || '—'}<small className="sub-cell">{tenant.room?.type}</small></td><td><Status value={tenant.status} /></td><td>{dateTime.format(new Date(tenant.rentPaidThrough))}</td><td className={`align-right money ${tenant.balance > 0 ? 'due' : 'clear'}`}>{inr.format(tenant.balance)}</td><td><div className="row-actions">{tenant.status === 'active' && <><button onClick={() => setModal({ type: 'payment', data: tenant })} title="Record payment"><Icon name="wallet" /></button><button onClick={() => setModal({ type: 'tenant', data: tenant })} title="Edit tenant"><Icon name="edit" /></button><button onClick={() => setModal({ type: 'password', data: tenant })} title="Reset password"><Icon name="settings" /></button><button className="danger-action" onClick={() => setModal({ type: 'archive', data: tenant })} title="Move out"><Icon name="logout" /></button></>}</div></td></tr>)}</tbody></table></div></div> : <EmptyState icon="users" title="No tenants yet" text="Add a tenant after creating a room." />}
  </div>
}

function Meter({ readings, rooms, setModal }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Electricity meters</h2><p>One meter per room. Bills are created only when a reading is entered.</p></div><button className="primary-button" disabled={!rooms.length} onClick={() => setModal({ type: 'meter' })}><Icon name="plus" />Add reading</button></div>
    {readings.length ? <div className="card-list">{readings.map((item) => <article className="list-card" key={item._id}><span className="activity-icon amber"><Icon name="bolt" /></span><div className="list-main"><div><strong>{item.room?.name}</strong>{item.isOpening && <Status value="opening" />}</div><small>{dateTime.format(new Date(item.readAt))} · ₹{item.rate}/unit</small></div><div className="reading-values"><span><small>Previous</small><b>{item.previousUnits ?? '—'}</b></span><Icon name="arrow" /><span><small>Current</small><b>{item.units}</b></span></div><strong>{inr.format(item.totalCharge)}</strong></article>)}</div> : <EmptyState icon="bolt" title="No meter readings" text="The first reading becomes the opening baseline and creates no bill." />}
  </div>
}

function Payments({ payments, tenants, setModal }) {
  return <div className="page-stack printable"><div className="section-toolbar"><div><h2>Payment history</h2><p>Allocate every payment between rent and electricity.</p></div><div className="toolbar-actions"><button className="soft-button" onClick={() => window.print()}><Icon name="print" />Print</button><button className="primary-button" disabled={!tenants.length} onClick={() => setModal({ type: 'payment' })}><Icon name="plus" />Record payment</button></div></div>
    {payments.length ? <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Received</th><th>Rent</th><th>Electricity</th><th>Note</th><th className="align-right">Total</th></tr></thead><tbody>{payments.map((item) => <tr key={item._id}><td><strong>{item.tenant?.name || 'Archived tenant'}</strong><small className="sub-cell">{item.tenant?.phone}</small></td><td>{dateTime.format(new Date(item.paidAt))}</td><td>{inr.format(item.rentAmount)}</td><td>{inr.format(item.electricityAmount)}</td><td>{item.note || '—'}</td><td className="align-right money clear">{inr.format(item.totalAmount)}</td></tr>)}</tbody></table></div></div> : <EmptyState icon="wallet" title="No payments recorded" text="Payments will appear here with their allocation." />}
  </div>
}

function Ledger({ entries, tenants, setModal }) {
  const [filter, setFilter] = useState('')
  const visible = filter ? entries.filter((entry) => entry.tenant?._id === filter) : entries
  return <div className="page-stack printable"><div className="section-toolbar"><div><h2>Billing ledger</h2><p>Daily rent, electricity, payments and audited corrections.</p></div><div className="toolbar-actions"><button className="soft-button" onClick={() => window.print()}><Icon name="print" />Print statement</button><button className="primary-button" onClick={() => setModal({ type: 'adjustment' })}><Icon name="plus" />Adjustment</button></div></div>
    <div className="filter-bar"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All tenants</option>{tenants.map((tenant) => <option value={tenant._id} key={tenant._id}>{tenant.name}</option>)}</select><span>{visible.length} entries</span></div>
    {visible.length ? <div className="ledger-list">{visible.map((entry) => <article className="ledger-row" key={entry._id}><span className={`entry-dot ${entry.amount < 0 ? 'credit' : entry.category}`} /><div><strong>{entry.description}</strong><small>{entry.tenant?.name} · {dateTime.format(new Date(entry.effectiveAt))}</small></div><span className="category-chip">{entry.category}</span><b className={entry.amount < 0 ? 'clear' : 'due'}>{entry.amount < 0 ? '−' : '+'}{inr.format(Math.abs(entry.amount))}</b></article>)}</div> : <EmptyState icon="ledger" title="No ledger entries" text="Daily rent appears after the first billing run." />}
  </div>
}

function Settings({ config, rooms, setModal }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Property configuration</h2><p>Global details and the electricity price used for future units.</p></div><button className="primary-button" onClick={() => setModal({ type: 'settings' })}><Icon name="edit" />Edit configuration</button></div>
    <section className="settings-grid"><article className="settings-card"><span className="activity-icon violet"><Icon name="home" /></span><small>Property name</small><h3>{config.propertyName}</h3><p>Shown throughout the tenant experience.</p></article><article className="settings-card"><span className="activity-icon amber"><Icon name="bolt" /></span><small>Electricity price</small><h3>{inr.format(config.electricityPrice || 0)} <em>/ unit</em></h3><p>A current reading is required before changing this rate.</p></article><article className="settings-card"><span className="activity-icon blue"><Icon name="history" /></span><small>Local time</small><h3>Asia / Kolkata</h3><p>Daily billing runs at midnight IST.</p></article></section>
    <section className="info-panel"><Icon name="check" /><div><strong>Missed-job recovery is enabled</strong><p>The daily endpoint can run more than once safely. It only creates rent entries that are missing.</p></div></section>
    <div className="panel"><div className="panel-head"><div><span className="eyebrow">ROOM PRICING</span><h3>Monthly rent by room</h3></div></div><div className="compact-list">{rooms.map((room) => <div key={room._id}><span>{room.name}<small>{room.type}</small></span><strong>{inr.format(room.monthlyRent)}</strong></div>)}</div></div>
  </div>
}

function Audit({ logs }) {
  return <div className="page-stack"><div className="section-toolbar"><div><h2>Admin activity</h2><p>Manual changes only. Automatic rent updates are intentionally excluded.</p></div></div>{logs.length ? <div className="timeline">{logs.map((log) => <article key={log._id}><span className="timeline-dot"><Icon name="history" size={16} /></span><div><div><strong>{log.action.replace('_', ' ')}</strong><Status value={log.entityType} /></div><p>{log.reason}</p><small>{log.tenant?.name ? `${log.tenant.name} · ` : ''}{log.actor?.name} · {dateTime.format(new Date(log.createdAt))}</small></div></article>)}</div> : <EmptyState icon="history" title="No manual changes yet" text="Admin edits and their reasons will appear here." />}</div>
}

function RoomForm({ room, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: room?.name || '', type: room?.type || 'single', monthlyRent: room?.monthlyRent || '', effectiveFrom: today(), reason: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); setError(''); try { await onSubmit(room ? `/admin/rooms/${room._id}` : '/admin/rooms', { method: room ? 'PATCH' : 'POST', body: JSON.stringify(form) }, room ? 'Room updated' : 'Room created') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title={room ? 'Edit room' : 'Add a room'} subtitle="Set the capacity and monthly price." onClose={onClose}><form className="modal-form" onSubmit={save}><div className="form-grid"><Field label="Room name" wide><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Room 101" /></Field><Field label="Room type"><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="single">Single tenant</option><option value="double">Double tenant</option></select></Field><Field label="Monthly rent"><input required type="number" min="1" step="0.01" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} /></Field><Field label="Effective from"><input required type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></Field>{room && <Field label="Reason for change" wide><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why is this room being updated?" /></Field>}</div>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label={room ? 'Save room' : 'Create room'} /></form></Modal>
}

function TenantForm({ tenant, rooms, onClose, onSubmit }) {
  const initialDate = tenant?.joiningAt ? inputDate(tenant.joiningAt) : today()
  const [form, setForm] = useState({ name: tenant?.name || '', phone: tenant?.phone || '', password: '', room: tenant?.room?._id || '', joiningAt: initialDate, billingStartAt: tenant?.billingStartAt ? inputDate(tenant.billingStartAt) : initialDate, rentPaidThrough: tenant?.rentPaidThrough ? inputDate(tenant.rentPaidThrough) : initialDate, openingBalance: 0, reason: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); setError(''); try { await onSubmit(tenant ? `/admin/tenants/${tenant._id}` : '/admin/tenants', { method: tenant ? 'PATCH' : 'POST', body: JSON.stringify(form) }, tenant ? 'Tenant updated' : 'Tenant account created') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal wide title={tenant ? 'Edit tenant' : 'Add a tenant'} subtitle={tenant ? 'Every change is saved with your reason.' : 'Create their private read-only account.'} onClose={onClose}><form className="modal-form" onSubmit={save}><div className="form-grid"><Field label="Full name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="10-digit phone"><input required pattern="[0-9]{10}" maxLength="10" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></Field>{!tenant && <><Field label="Temporary password" hint="Shown only while you type it."><input required minLength="8" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Field label="Room"><select required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}><option value="">Select room</option>{rooms.map((room) => <option key={room._id} value={room._id}>{room.name} · {room.type}</option>)}</select></Field></>}<Field label="Joining date"><input required type="date" value={form.joiningAt} onChange={(e) => setForm({ ...form, joiningAt: e.target.value, billingStartAt: e.target.value, rentPaidThrough: e.target.value })} /></Field><Field label="Rent paid through"><input required type="date" value={form.rentPaidThrough} onChange={(e) => setForm({ ...form, rentPaidThrough: e.target.value })} /></Field>{!tenant && <><Field label="Start automatic billing"><input required type="date" value={form.billingStartAt} onChange={(e) => setForm({ ...form, billingStartAt: e.target.value })} /></Field><Field label="Opening balance" hint="Use 0 for a new tenant."><input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></Field></>}{tenant && <Field label="Reason for change" wide><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>}</div>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label={tenant ? 'Save tenant' : 'Create tenant'} /></form></Modal>
}

function ArchiveForm({ tenant, onClose, onSubmit }) {
  const [form, setForm] = useState({ moveOutDate: today(), reason: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit(`/admin/tenants/${tenant._id}/archive`, { method: 'POST', body: JSON.stringify(form) }, `${tenant.name} moved out`) } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title={`Move out ${tenant.name}`} subtitle="Their login will be disabled and the final date is billed at half the daily rate." onClose={onClose}><form className="modal-form" onSubmit={save}><Field label="Move-out date"><input required type="date" value={form.moveOutDate} onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })} /></Field><Field label="Reason"><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label="Confirm move-out" /></form></Modal>
}

function PasswordForm({ tenant, onClose, onSubmit }) {
  const [form, setForm] = useState({ password: '', reason: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit(`/admin/tenants/${tenant._id}/reset-password`, { method: 'POST', body: JSON.stringify(form) }, 'Password reset—share it with the tenant now') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title="Reset tenant password" subtitle="The existing password cannot be viewed. The new one is visible only now." onClose={onClose}><form className="modal-form" onSubmit={save}><Field label="New temporary password"><input required minLength="8" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Field label="Reason"><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label="Reset password" /></form></Modal>
}

function MeterForm({ rooms, onClose, onSubmit }) {
  const [form, setForm] = useState({ room: '', units: '', readAt: today(), isOpening: false }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit('/admin/meter-readings', { method: 'POST', body: JSON.stringify(form) }, form.isOpening ? 'Opening reading saved' : 'Electricity bills updated') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title="Add meter reading" subtitle="The difference from the last reading becomes the bill." onClose={onClose}><form className="modal-form" onSubmit={save}><Field label="Room"><select required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}><option value="">Select room</option>{rooms.map((room) => <option value={room._id} key={room._id}>{room.name}</option>)}</select></Field><div className="form-grid"><Field label="Current units"><input required type="number" min="0" step="0.01" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} /></Field><Field label="Reading date"><input required type="date" value={form.readAt} onChange={(e) => setForm({ ...form, readAt: e.target.value })} /></Field></div><label className="check-field"><input type="checkbox" checked={form.isOpening} onChange={(e) => setForm({ ...form, isOpening: e.target.checked })} /><span><strong>Opening reading</strong><small>Save as a baseline without creating a bill.</small></span></label>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label="Save reading" /></form></Modal>
}

function PaymentForm({ tenants, initialTenant, onClose, onSubmit }) {
  const [form, setForm] = useState({ tenant: initialTenant?._id || '', rentAmount: '', electricityAmount: '', paidAt: today(), note: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const total = Number(form.rentAmount || 0) + Number(form.electricityAmount || 0)
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit('/admin/payments', { method: 'POST', body: JSON.stringify(form) }, `Payment of ${inr.format(total)} recorded`) } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title="Record a payment" subtitle="Manually choose how much covers rent and electricity." onClose={onClose}><form className="modal-form" onSubmit={save}><Field label="Tenant"><select required value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })}><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.name} · {tenant.room?.name}</option>)}</select></Field><div className="allocation-card"><span>Payment allocation</span><div className="form-grid"><Field label="Rent amount"><input type="number" min="0" step="0.01" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} placeholder="0.00" /></Field><Field label="Electricity amount"><input type="number" min="0" step="0.01" value={form.electricityAmount} onChange={(e) => setForm({ ...form, electricityAmount: e.target.value })} placeholder="0.00" /></Field></div><div className="allocation-total"><span>Total received</span><strong>{inr.format(total)}</strong></div></div><Field label="Payment date"><input required type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></Field><Field label="Note (optional)"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Cash, UPI reference, etc." /></Field>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label="Record payment" /></form></Modal>
}

function AdjustmentForm({ tenants, onClose, onSubmit }) {
  const [form, setForm] = useState({ tenant: '', category: 'rent', amount: '', effectiveAt: today(), description: '', reason: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit('/admin/adjustments', { method: 'POST', body: JSON.stringify(form) }, 'Audited adjustment added') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal title="Add a correction" subtitle="Use a positive amount to increase dues and a negative amount to reduce them." onClose={onClose}><form className="modal-form" onSubmit={save}><Field label="Tenant"><select required value={form.tenant} onChange={(e) => setForm({ ...form, tenant: e.target.value })}><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant._id} value={tenant._id}>{tenant.name}</option>)}</select></Field><div className="form-grid"><Field label="Category"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="rent">Rent</option><option value="electricity">Electricity</option><option value="general">General</option></select></Field><Field label="Amount"><input required type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Effective date"><input type="date" value={form.effectiveAt} onChange={(e) => setForm({ ...form, effectiveAt: e.target.value })} /></Field></div><Field label="Description"><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><Field label="Reason for correction"><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} label="Add correction" /></form></Modal>
}

function SettingsForm({ config, rooms, onClose, onSubmit }) {
  const [form, setForm] = useState({ propertyName: config.propertyName || 'Homely Tenants', electricityPrice: config.electricityPrice || 0, effectiveFrom: today(), reason: '', currentReadings: rooms.map((room) => ({ room: room._id, name: room.name, units: '' })) }); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const rateChanged = Number(form.electricityPrice) !== Number(config.electricityPrice)
  async function save(e) { e.preventDefault(); setBusy(true); try { await onSubmit('/admin/configuration', { method: 'PUT', body: JSON.stringify({ ...form, currentReadings: rateChanged ? form.currentReadings : [] }) }, 'Configuration updated') } catch (err) { setError(err.message); setBusy(false) } }
  return <Modal wide title="Edit configuration" subtitle="A price change starts only after the current usage is closed at the old rate." onClose={onClose}><form className="modal-form" onSubmit={save}><div className="form-grid"><Field label="Property name"><input required value={form.propertyName} onChange={(e) => setForm({ ...form, propertyName: e.target.value })} /></Field><Field label="Electricity price per unit"><input required type="number" min="0" step="0.01" value={form.electricityPrice} onChange={(e) => setForm({ ...form, electricityPrice: e.target.value })} /></Field><Field label="Effective from"><input required type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></Field></div>{rateChanged && Number(config.electricityPrice) > 0 && <div className="rate-readings"><strong>Close readings at the old price</strong><p>Enter every occupied room’s current units.</p><div className="form-grid">{form.currentReadings.map((reading, index) => <Field key={reading.room} label={reading.name}><input required type="number" min="0" step="0.01" value={reading.units} onChange={(e) => { const next = [...form.currentReadings]; next[index] = { ...reading, units: e.target.value }; setForm({ ...form, currentReadings: next }) }} /></Field>)}</div></div>}<Field label="Reason for change"><textarea required minLength="3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>{error && <div className="form-error">{error}</div>}<FormActions onClose={onClose} busy={busy} /></form></Modal>
}

