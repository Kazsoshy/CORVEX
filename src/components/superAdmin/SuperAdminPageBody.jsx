import { useState } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  AUDIT_LOGS, BACKUP_HISTORY, ROLES_PERMISSIONS, SECURITY_ALERTS,
  SERVER_METRICS, SUPER_ADMIN_PROFILE, SYSTEM_HEALTH, SYSTEM_SETTINGS,
} from '../../data/adminMockData';
import { EmptyState } from '../collector/EmptyState';
import { NavIcon } from '../../navIcons';

function btn(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}

function Toolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((a) => (
            <button key={a.label} className={btn(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Stats({ stats }) {
  return (
    <section className="stats-grid">
      {stats.map((s, i) => (
        <article key={s.label} className="stat-card" style={{ '--stat-index': i }}>
          <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
          <span className="stat-label">{s.label}</span>
          <strong className="stat-value">{s.value}</strong>
        </article>
      ))}
    </section>
  );
}

function Card({ title, sub, children, action, onAction }) {
  return (
    <section className="panel content-panel">
      <div className="panel-section-header">
        <div><h3>{title}</h3>{sub && <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>{sub}</p>}</div>
        {action && <button className="button ghost" type="button" onClick={onAction}>{action}</button>}
      </div>
      {children}
    </section>
  );
}

function MetricBar({ label, value, max = 100, color = '#2563eb' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '0.88rem', color: '#64748b' }}>{value}{max === 100 ? '%' : ' ms'}</span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: color, borderRadius: 999, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const cls = { Critical: 'severity-critical', Warning: 'severity-warning', Informational: 'severity-info' }[severity] ?? '';
  return <span className={`severity-badge ${cls}`}>{severity}</span>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({ navigate }) {
  const dbColor = SYSTEM_HEALTH.dbStatus === 'Online' ? '#059669' : '#dc2626';
  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Super Admin</p>
          <h2>{SUPER_ADMIN_PROFILE.name}</h2>
          <p className="muted">Full system control & infrastructure</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: `1.5px solid ${dbColor}22`, background: `${dbColor}0d` }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dbColor, flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: dbColor }}>DB {SYSTEM_HEALTH.dbStatus}</span>
        </div>
      </section>

      <Stats stats={[
        { label: 'Total Users',     value: String(SYSTEM_HEALTH.totalUsers) },
        { label: 'Total Branches',  value: String(SYSTEM_HEALTH.totalBranches) },
        { label: 'Active Sessions', value: String(SYSTEM_HEALTH.activeSessions) },
        { label: 'API Response',    value: `${SYSTEM_HEALTH.apiResponseMs} ms` },
        { label: 'System Uptime',   value: SYSTEM_HEALTH.uptime },
        { label: 'Last Backup',     value: SYSTEM_HEALTH.lastBackup },
      ]} />

      <div className="grid two-up">
        <Card title="Server Performance" sub="CPU & Memory (today)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={SERVER_METRICS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={v => `${v}%`} />
              <Legend />
              <Line type="monotone" dataKey="cpu" name="CPU" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mem" name="Memory" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Current Resource Usage">
          <div style={{ padding: '8px 0' }}>
            <MetricBar label="CPU Usage"     value={SYSTEM_HEALTH.serverCpu}    color="#2563eb" />
            <MetricBar label="Memory Usage"  value={SYSTEM_HEALTH.memoryUsage}  color="#8b5cf6" />
            <MetricBar label="Storage Usage" value={SYSTEM_HEALTH.storageUsage} color="#06b6d4" />
            <MetricBar label="API Response"  value={SYSTEM_HEALTH.apiResponseMs} max={500} color="#f59e0b" />
          </div>
        </Card>
      </div>

      {SECURITY_ALERTS.length > 0 && (
        <Card title="Security Alerts" sub="Recent suspicious activity">
          <ul className="widget-list">
            {SECURITY_ALERTS.map(a => (
              <li key={a.id}>
                <div><strong>{a.type}</strong><span className="muted">{a.user} · {a.ip} · {a.time}</span></div>
                <SeverityBadge severity={a.severity} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Quick Access</h3></div>
        <div className="quick-link-grid">
          {[
            { label: 'System Settings',       to: '/super-admin/settings',    icon: 'form' },
            { label: 'Role & Permissions',    to: '/super-admin/roles',       icon: 'accounts' },
            { label: 'Backup & Restore',      to: '/super-admin/backup',      icon: 'history' },
            { label: 'Database Monitoring',   to: '/super-admin/monitoring',  icon: 'reports' },
            { label: 'Audit Logs',            to: '/super-admin/audit-logs',  icon: 'log' },
          ].map(item => (
            <button key={item.to} className="quick-link-card" type="button" onClick={() => navigate(item.to)} style={{ textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
              <span className="quick-link-icon"><NavIcon name={item.icon} /></span>
              <span className="quick-link-copy"><strong>{item.label}</strong><span className="muted">Open</span></span>
              <span className="quick-link-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Role & Permission Management ──────────────────────────────────────────────
function RolesPage({ showToast }) {
  const PERM_KEYS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manageUsers', 'manageBranches'];
  const PERM_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export', manageUsers: 'Manage Users', manageBranches: 'Manage Branches' };
  const [perms, setPerms] = useState(ROLES_PERMISSIONS);

  const toggle = (roleIdx, key) => {
    if (perms[roleIdx].role === 'Super Admin') return;
    setPerms(prev => prev.map((r, i) => i === roleIdx ? { ...r, permissions: { ...r.permissions, [key]: !r.permissions[key] } } : r));
  };

  return (
    <div className="page">
      <section className="panel content-panel" style={{ overflowX: 'auto' }}>
        <div className="panel-section-header"><h3>Role Permission Matrix</h3><p className="muted">Super Admin row is read-only.</p></div>
        <table className="data-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Role</th>
              {PERM_KEYS.map(k => <th key={k}>{PERM_LABELS[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map((r, roleIdx) => (
              <tr key={r.role}>
                <td><strong>{r.role}</strong></td>
                {PERM_KEYS.map(k => (
                  <td key={k} style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={r.permissions[k]}
                      disabled={r.role === 'Super Admin'}
                      onChange={() => toggle(roleIdx, k)}
                      style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: r.role === 'Super Admin' ? 'not-allowed' : 'pointer' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Toolbar actions={[{ label: 'Save Permissions', action: 'save' }]} onAction={() => showToast('Permissions saved successfully.', 'success')} />
    </div>
  );
}

// ── System Settings ───────────────────────────────────────────────────────────
function SettingsPage({ showToast }) {
  const [settings, setSettings] = useState({ ...SYSTEM_SETTINGS });
  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Company Information</h3></div>
        <div className="grid two-up">
          <div className="form-group"><label>Company Name</label><input value={settings.companyName} onChange={e => set('companyName', e.target.value)} /></div>
          <div className="form-group"><label>Company Email</label><input type="email" value={settings.companyEmail} onChange={e => set('companyEmail', e.target.value)} /></div>
          <div className="form-group"><label>Logo Upload</label><input type="file" accept="image/*" /></div>
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Integrations & API</h3></div>
        <div className="grid two-up">
          <div className="form-group"><label>GIS API Key</label><input value={settings.gisApiKey} onChange={e => set('gisApiKey', e.target.value)} /></div>
          <div className="form-group"><label>Backup Schedule</label><input value={settings.backupSchedule} onChange={e => set('backupSchedule', e.target.value)} /></div>
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Notification Settings</h3></div>
        <div style={{ display: 'flex', gap: 24 }}>
          <label className="toggle-label"><input type="checkbox" checked={settings.notificationsEmail} onChange={e => set('notificationsEmail', e.target.checked)} />Email Notifications</label>
          <label className="toggle-label"><input type="checkbox" checked={settings.notificationsSms} onChange={e => set('notificationsSms', e.target.checked)} />SMS Notifications</label>
          <label className="toggle-label"><input type="checkbox" checked={settings.smsEnabled} onChange={e => set('smsEnabled', e.target.checked)} />SMS / OTP Enabled</label>
        </div>
      </section>

      {confirmReset && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <p>Restore all settings to factory defaults? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="button" type="button" style={{ background: '#dc2626' }} onClick={() => { showToast('Settings restored to defaults.', 'success'); setSettings({ ...SYSTEM_SETTINGS }); setConfirmReset(false); }}>Confirm Reset</button>
            <button className="button secondary" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </section>
      )}

      <Toolbar
        actions={[{ label: 'Save Settings', action: 'save' }, { label: 'Restore Defaults', action: 'reset', variant: 'secondary' }]}
        onAction={a => { if (a.action === 'save') showToast('Settings saved.', 'success'); else setConfirmReset(true); }}
      />
    </div>
  );
}

// ── Backup & Restore ──────────────────────────────────────────────────────────
function BackupPage({ showToast }) {
  const [confirmRestore, setConfirmRestore] = useState(null);
  return (
    <div className="page">
      <Stats stats={[
        { label: 'Total Backups',   value: String(BACKUP_HISTORY.length) },
        { label: 'Latest Backup',   value: BACKUP_HISTORY[0]?.date ?? '—' },
        { label: 'Latest Size',     value: BACKUP_HISTORY[0]?.size ?? '—' },
        { label: 'Schedule',        value: 'Daily 02:00 AM' },
      ]} />

      <Toolbar actions={[{ label: 'Create Manual Backup', action: 'backup' }]} onAction={() => showToast('Manual backup started. This may take a few minutes.', 'success')} />

      {confirmRestore && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <p><strong>Warning:</strong> Restoring backup from <strong>{confirmRestore.date}</strong> will replace all current data. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="button" type="button" style={{ background: '#dc2626' }} onClick={() => { showToast(`Database restored from ${confirmRestore.date}.`, 'success'); setConfirmRestore(null); }}>Confirm Restore</button>
            <button className="button secondary" type="button" onClick={() => setConfirmRestore(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Backup History</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Type</th><th>Date</th><th>Size</th><th>Created By</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {BACKUP_HISTORY.map(b => (
                <tr key={b.id}>
                  <td>{b.type}</td><td>{b.date}</td><td>{b.size}</td><td>{b.by}</td>
                  <td><span style={{ color: '#059669', fontWeight: 700, fontSize: '0.8rem' }}>{b.status}</span></td>
                  <td className="table-actions">
                    <button className="link-button" type="button" onClick={() => showToast(`Downloading ${b.date} backup.`, 'success')}>Download</button>
                    <button className="link-button" type="button" onClick={() => setConfirmRestore(b)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Database & Server Monitoring ──────────────────────────────────────────────
function MonitoringPage({ showToast }) {
  const [loading, setLoading] = useState(false);
  const refresh = () => { setLoading(true); setTimeout(() => setLoading(false), 800); };

  return (
    <div className="page">
      <Toolbar
        actions={[{ label: loading ? 'Refreshing…' : 'Refresh', action: 'refresh' }, { label: 'Download Logs', action: 'download', variant: 'secondary' }]}
        onAction={a => { if (a.action === 'refresh') refresh(); else showToast('Error logs downloaded.', 'success'); }}
      />

      <Stats stats={[
        { label: 'Database Status',  value: SYSTEM_HEALTH.dbStatus },
        { label: 'CPU Usage',        value: `${SYSTEM_HEALTH.serverCpu}%` },
        { label: 'Memory Usage',     value: `${SYSTEM_HEALTH.memoryUsage}%` },
        { label: 'Storage Usage',    value: `${SYSTEM_HEALTH.storageUsage}%` },
        { label: 'API Response',     value: `${SYSTEM_HEALTH.apiResponseMs} ms` },
        { label: 'Active Users',     value: String(SYSTEM_HEALTH.activeSessions) },
      ]} />

      <Card title="Server Performance Timeline" sub="CPU & Memory over the last 24h">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={SERVER_METRICS}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={v => `${v}%`} />
            <Legend />
            <Line type="monotone" dataKey="cpu" name="CPU" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="mem" name="Memory" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Error Logs</h3></div>
        {AUDIT_LOGS.filter(l => l.status === 'Failed').length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>IP</th></tr></thead>
              <tbody>
                {AUDIT_LOGS.filter(l => l.status === 'Failed').map(l => (
                  <tr key={l.id}><td>{l.timestamp}</td><td>{l.user}</td><td>{l.action}</td><td>{l.module}</td><td>{l.ip}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No errors logged" description="System is running clean." />}
      </section>
    </div>
  );
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({ showToast }) {
  return (
    <div className="page">
      <Toolbar actions={[{ label: 'Export Logs', action: 'export' }]} onAction={() => showToast('Logs exported.', 'success')} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>System Audit Log</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>IP Address</th><th>Status</th></tr></thead>
            <tbody>
              {AUDIT_LOGS.map(l => (
                <tr key={l.id}>
                  <td>{l.timestamp}</td><td>{l.user}</td><td>{l.action}</td><td>{l.module}</td><td>{l.ip}</td>
                  <td><span style={{ color: l.status === 'Success' ? '#059669' : '#dc2626', fontWeight: 700, fontSize: '0.8rem' }}>{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Super Admin Profile</h3></div>
        <ul className="bullet-list">
          <li>Name: {SUPER_ADMIN_PROFILE.name}</li>
          <li>Employee ID: {SUPER_ADMIN_PROFILE.employeeId}</li>
          <li>Email: {SUPER_ADMIN_PROFILE.email}</li>
          <li>Phone: {SUPER_ADMIN_PROFILE.phone}</li>
          <li>Role: {SUPER_ADMIN_PROFILE.role}</li>
        </ul>
      </section>
      <Toolbar
        actions={[{ label: 'Update Profile', action: 'update' }, { label: 'Change Password', action: 'pw', variant: 'secondary' }, { label: 'Logout', action: 'logout', variant: 'ghost' }]}
        onAction={a => { if (a.action === 'logout') navigate('/login'); else showToast(`${a.label} opened.`, 'success'); }}
      />
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export function SuperAdminPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to navigate." />;
  const p = { navigate, showToast };
  switch (page.pageType) {
    case 'dashboard':     return <DashboardPage {...p} />;
    case 'roles':         return <RolesPage {...p} />;
    case 'settings':      return <SettingsPage {...p} />;
    case 'backup':        return <BackupPage {...p} />;
    case 'monitoring':    return <MonitoringPage {...p} />;
    case 'auditLogs':     return <AuditLogsPage {...p} />;
    case 'notifications': return <EmptyState title="No notifications" description="System notifications will appear here." />;
    case 'profile':       return <ProfilePage {...p} />;
    default:              return <EmptyState title="Page not found" />;
  }
}
