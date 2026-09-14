import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ADMIN_BRANCHES, ADMIN_INVENTORY, ADMIN_PROFILE,
  BRANCH_PERFORMANCE_CHART, RESTOCK_REQUESTS, SYSTEM_MONTHLY_COLLECTIONS,
  SYSTEM_MONTHLY_SALES, TRANSFER_REQUESTS, USER_GROWTH, USER_STATS, USERS,
  getBranchById, getUserById,
} from '../../data/adminMockData';
import { fetchAuditLogs } from '../../api/adminService';
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

function StatusPill({ status }) {
  const style = status === 'Active' || status === 'Success' || status === 'Approved'
    ? { background: 'rgba(5,150,105,0.1)', color: '#059669' }
    : status === 'Pending'
    ? { background: 'rgba(217,119,6,0.1)', color: '#d97706' }
    : { background: 'rgba(220,38,38,0.08)', color: '#dc2626' };
  return (
    <span style={{ ...style, padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Operating Manager Administration</p>
          <h2>{ADMIN_PROFILE.name}</h2>
          <p className="muted">System Administration</p>
        </div>
      </section>

      <Stats stats={[
        { label: 'Total Users',        value: String(USER_STATS.total) },
        { label: 'Active Users',       value: String(USER_STATS.active) },
        { label: 'Inactive Users',     value: String(USER_STATS.inactive) },
        { label: 'New This Month',     value: String(USER_STATS.newThisMonth) },
        { label: 'Pending Approvals',  value: String(USER_STATS.pendingApprovals) },
        { label: 'Active Branches',    value: String(ADMIN_BRANCHES.filter(b => b.status === 'Active').length) },
      ]} />

      <div className="grid two-up">
        <Card title="User Growth" sub="Monthly registered users">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={USER_GROWTH}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" name="Users" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Branch Overview" sub="Performance scores">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="branch" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="performance" name="Performance" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" name="Risk Score" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Inventory Alerts" sub="Low stock & out of stock" action="Manage Inventory" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="widget-list">
            {ADMIN_INVENTORY.filter(p => p.status !== 'Sufficient').map(p => (
              <li key={p.id}>
                <div><strong>{p.name}</strong><span className="muted">{p.branch}</span></div>
                <StatusPill status={p.status === 'Out of Stock' ? 'Inactive' : 'Pending'} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Pending Transfer Requests" sub="Awaiting approval" action="View All" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="widget-list">
            {TRANSFER_REQUESTS.filter(t => t.status === 'Pending').map(t => (
              <li key={t.id}>
                <div><strong>{t.product}</strong><span className="muted">{t.from} → {t.to}</span></div>
                <StatusPill status={t.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Quick Access</h3></div>
        <div className="quick-link-grid">
          {[
            { label: 'User Management',      to: '/operating-manager/admin/users',      icon: 'account' },
            { label: 'Branch Management',    to: '/operating-manager/admin/branches',   icon: 'home' },
            { label: 'Inventory Management', to: '/operating-manager/admin/inventory',  icon: 'inventory' },
            { label: 'System Reports',       to: '/operating-manager/admin/reports',    icon: 'reports' },
            { label: 'Audit Logs',           to: '/operating-manager/admin/audit-logs', icon: 'log' },
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

// ── User Management ───────────────────────────────────────────────────────────
function UserListPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [usersRes, rolesRes, branchesRes] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/roles'),
          apiClient.get('/branches'),
        ]);
        if (usersRes.data.success) setUsers(usersRes.data.data || []);
        if (rolesRes.data.success) setRoles(rolesRes.data.data.roles || []);
        if (branchesRes.data.success) setBranches(branchesRes.data.data || []);
      } catch (err) {
        console.error('Error loading data:', err);
        showToast('Failed to load users.', 'error');
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    if (q && !fullName.includes(q) && !u.email.toLowerCase().includes(q)) return false;
    if (roleFilter !== 'All' && u.role?.slug !== roleFilter) return false;
    if (branchFilter !== 'All' && u.branch?.id !== Number(branchFilter)) return false;
    if (statusFilter !== 'All' && u.status !== statusFilter) return false;
    return true;
  }), [users, search, roleFilter, branchFilter, statusFilter]);

  const handleDisable = async (user) => {
    try {
      await apiClient.delete(`/users/${user.user_id}`);
      showToast(`${user.first_name} ${user.last_name} disabled.`, 'success');
      setConfirmDisable(null);
      // Reload users
      const usersRes = await apiClient.get('/users');
      if (usersRes.data.success) setUsers(usersRes.data.data || []);
    } catch (err) {
      console.error('Error disabling user:', err);
      showToast('Failed to disable user.', 'error');
    }
  };

  if (loading) return <div className="page"><section className="panel content-panel"><p>Loading users...</p></section></div>;

  return (
    <div className="page">
      <Toolbar actions={[{ label: '+ Add User', action: 'add' }]} onAction={() => navigate('/operating-manager/admin/users/add')} />

      <section className="panel content-panel">
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="All">All Roles</option>
              {roles.map(r => <option key={r.role_id} value={r.slug}>{r.role_name}</option>)}
            </select>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      {confirmDisable && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <p>Disable <strong>{confirmDisable.first_name} {confirmDisable.last_name}</strong>? They will lose system access immediately.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="button" type="button" style={{ background: '#dc2626' }} onClick={() => handleDisable(confirmDisable)}>Confirm Disable</button>
            <button className="button secondary" type="button" onClick={() => setConfirmDisable(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Users <span className="muted" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({filtered.length})</span></h3></div>
        {filtered.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>User ID</th><th>First Name</th><th>Last Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.user_id}>
                    <td>{u.user_id}</td>
                    <td>{u.first_name}</td>
                    <td>{u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{u.role?.name || '—'}</td>
                    <td>{u.branch?.name || '—'}</td>
                    <td><StatusPill status={u.status} /></td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-PH') : '—'}</td>
                    <td>{u.updated_at ? new Date(u.updated_at).toLocaleDateString('en-PH') : '—'}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => navigate(`/operating-manager/admin/users/${u.user_id}`)}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Disable" onClick={() => setConfirmDisable(u)}><NavIcon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No users found" description="Adjust your search or filters." />}
      </section>
    </div>
  );
}

function UserFormPage({ userId, navigate, showToast }) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role_id: '',
    branch_id: '',
    status: 'Active',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [branchesRes, rolesRes] = await Promise.all([
          apiClient.get('/branches'),
          apiClient.get('/roles'),
        ]);
        if (branchesRes.data.success) setBranches(branchesRes.data.data || []);
        if (rolesRes.data.success) setRoles(rolesRes.data.data || []);

        if (userId) {
          const userRes = await apiClient.get(`/users/${userId}`);
          if (userRes.data.success) {
            const user = userRes.data.data;
            setForm({
              first_name: user.first_name || '',
              last_name: user.last_name || '',
              email: user.email || '',
              password: '',
              role_id: user.role_id || '',
              branch_id: user.branch_id || '',
              status: user.status || 'Active',
            });
          }
        }
      } catch (err) {
        console.error('Error loading data:', err);
        showToast('Failed to load data.', 'error');
      }
      setLoading(false);
    }
    loadData();
  }, [userId]);

  const handleSubmit = async () => {
    const newErrors = {};
    if (!form.first_name.trim()) newErrors.first_name = 'First name is required';
    if (!form.last_name.trim()) newErrors.last_name = 'Last name is required';
    if (!form.email.trim()) newErrors.email = 'Email is required';
    if (!form.email.includes('@')) newErrors.email = 'Invalid email format';
    if (!userId && !form.password) newErrors.password = 'Password is required';
    if (form.password && form.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (!form.role_id) newErrors.role_id = 'Role is required';
    if (!form.branch_id) newErrors.branch_id = 'Branch is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role_id: Number(form.role_id),
        branch_id: Number(form.branch_id),
        status: form.status,
      };
      if (form.password) payload.password = form.password;

      if (userId) {
        await apiClient.put(`/users/${userId}`, payload);
        showToast('User updated successfully.', 'success');
      } else {
        await apiClient.post('/users', payload);
        showToast('User created successfully.', 'success');
      }
      navigate('/operating-manager/admin/users');
    } catch (err) {
      console.error('Error saving user:', err);
      showToast(err.response?.data?.message || 'Failed to save user.', 'error');
    }
  };

  if (loading) return <div className="page"><section className="panel content-panel"><p>Loading...</p></section></div>;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>{userId ? 'Edit User' : 'Add New User'}</h3></div>
        <div className="grid two-up">
          <div className="form-group">
            <label>First Name <span className="required">*</span></label>
            <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First name" />
            {errors.first_name && <p className="form-error">{errors.first_name}</p>}
          </div>
          <div className="form-group">
            <label>Last Name <span className="required">*</span></label>
            <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" />
            {errors.last_name && <p className="form-error">{errors.last_name}</p>}
          </div>
          <div className="form-group">
            <label>Email <span className="required">*</span></label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@corvex.ph" />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div className="form-group">
            <label>Password {userId ? '(leave blank to keep current)' : '<span className="required">*</span>'}</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password" />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
          <div className="form-group">
            <label>Role <span className="required">*</span></label>
            <select value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })}>
              <option value="">Select role</option>
              {roles.map(r => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
            </select>
            {errors.role_id && <p className="form-error">{errors.role_id}</p>}
          </div>
          <div className="form-group">
            <label>Branch <span className="required">*</span></label>
            <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">Select branch</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            {errors.branch_id && <p className="form-error">{errors.branch_id}</p>}
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>
      <Toolbar
        actions={[
          { label: userId ? 'Save Changes' : 'Create User', action: 'save' },
          { label: 'Cancel', to: '/operating-manager/admin/users', variant: 'secondary' },
        ]}
        onAction={a => {
          if (a.action === 'save') handleSubmit();
          else navigate(a.to);
        }}
      />
    </div>
  );
}

// ── Branch Management ─────────────────────────────────────────────────────────
function BranchListPage({ navigate, showToast }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);

  useEffect(() => {
    async function loadBranches() {
      setLoading(true);
      try {
        const response = await apiClient.get('/branches');
        if (response.data.success) {
          setBranches(response.data.data || []);
        } else {
          setError(response.data.message || 'Failed to load branches');
        }
      } catch (err) {
        console.error('Error fetching branches:', err);
        setError('Failed to load branches');
      }
      setLoading(false);
    }
    loadBranches();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>All Branches</h3></div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading branches...</div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>All Branches</h3></div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <Toolbar actions={[{ label: '+ Add Branch', action: 'add' }]} onAction={() => showToast('Add Branch form coming soon.', 'success')} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>All Branches <span className="muted" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({branches.length})</span></h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Branch ID</th><th>Branch Name</th><th>Address</th><th>Latitude</th><th>Longitude</th><th>Contact No</th><th>Email</th><th>Status</th><th>Created At</th><th>Actions</th></tr></thead>
            <tbody>
              {branches.length === 0 ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No branches found</td></tr>
              ) : (
                branches.map(b => (
                  <tr key={b.branch_id}>
                    <td>{b.branch_id}</td>
                    <td><strong>{b.branch_name}</strong></td>
                    <td>{b.address}</td>
                    <td>{b.latitude}</td>
                    <td>{b.longitude}</td>
                    <td>{b.contact_no}</td>
                    <td>{b.email}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td>{new Date(b.created_at).toLocaleString()}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/admin/branches/${b.branch_id}`)}><NavIcon name="view" /></button>
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => showToast(`Editing ${b.branch_name}.`, 'success')}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Disable" onClick={() => setConfirmDisable(b)}><NavIcon name="trash" /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {confirmDisable && (
        <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <p>Disable <strong>{confirmDisable.branch_name}</strong>? This will restrict all branch operations.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="button" type="button" style={{ background: '#dc2626' }} onClick={() => { showToast(`${confirmDisable.branch_name} disabled.`, 'success'); setConfirmDisable(null); }}>Confirm Disable</button>
            <button className="button secondary" type="button" onClick={() => setConfirmDisable(null)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}

function BranchDetailPage({ branchId, navigate, showToast }) {
  const branch = getBranchById(branchId);
  if (!branch) return <EmptyState title="Branch not found" actionLabel="Back" onAction={() => navigate('/admin/branches')} />;
  const branchUsers = USERS.filter(u => u.branch === branch.name);
  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{branch.region}</p>
          <h2>{branch.name}</h2>
          <p className="muted">{branch.city} · Manager: {branch.manager}</p>
        </div>
      </section>
      <Stats stats={[
        { label: 'Total Employees', value: String(branch.employees) },
        { label: 'Collectors',      value: String(branch.collectors) },
        { label: 'Sales Agents',    value: String(branch.salesAgents) },
        { label: 'Warehouse Staff', value: String(branch.warehouseStaff) },
      ]} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Branch Users</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Last Login</th></tr></thead>
            <tbody>{branchUsers.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.role}</td><td><StatusPill status={u.status} /></td><td>{u.lastLogin}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <Toolbar actions={[{ label: 'Edit Branch', action: 'edit' }, { label: 'Assign Manager', action: 'assign', variant: 'secondary' }, { label: 'Back', to: '/admin/branches', variant: 'ghost' }]}
        onAction={a => { if (a.to) navigate(a.to); else showToast(`${a.label} opened.`, 'success'); }} />
    </div>
  );
}

// ── Inventory Management ──────────────────────────────────────────────────────
function InventoryPage({ navigate, showToast }) {
  const [tab, setTab] = useState('products');
  const tabs = [{ key: 'products', label: 'Products' }, { key: 'transfers', label: 'Transfer Requests' }, { key: 'restock', label: 'Restock Requests' }];

  return (
    <div className="page">
      <div className="segmented-control" style={{ marginBottom: 24 }}>
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'products' && (
        <>
          <Toolbar actions={[{ label: 'Export Inventory', action: 'export' }]} onAction={() => showToast('Inventory exported.', 'success')} />
          <section className="panel content-panel">
            <div className="panel-section-header"><h3>All Products</h3></div>
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Product</th><th>SKU</th><th>Branch</th><th>Quantity</th><th>Status</th><th>Last Updated</th><th>Actions</th></tr></thead>
                <tbody>
                  {ADMIN_INVENTORY.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td><td>{p.sku}</td><td>{p.branch}</td><td>{p.quantity}</td>
                      <td><StatusPill status={p.status === 'Sufficient' ? 'Active' : p.status === 'Low Stock' ? 'Pending' : 'Inactive'} /></td>
                      <td>{p.lastUpdated}</td>
                      <td className="table-actions"><button className="icon-action-button" type="button" title="Details" onClick={() => showToast(`${p.name} details.`, 'success')}><NavIcon name="view" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'transfers' && (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Transfer Requests</h3></div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>Requested By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {TRANSFER_REQUESTS.map(t => (
                  <tr key={t.id}>
                    <td>{t.product}</td><td>{t.from}</td><td>{t.to}</td><td>{t.qty}</td>
                    <td>{t.requestedBy}</td><td>{t.date}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="table-actions">
                      {t.status === 'Pending' && <>
                        <button className="icon-action-button" type="button" title="Approve" onClick={() => showToast(`Transfer approved.`, 'success')}><NavIcon name="check" /></button>
                        <button className="icon-action-button danger" type="button" title="Reject" onClick={() => showToast(`Transfer rejected.`, 'success')}><NavIcon name="close" /></button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'restock' && (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Restock Requests</h3></div>
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Product</th><th>Branch</th><th>Qty</th><th>Requested By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {RESTOCK_REQUESTS.map(r => (
                  <tr key={r.id}>
                    <td>{r.product}</td><td>{r.branch}</td><td>{r.qty}</td>
                    <td>{r.requestedBy}</td><td>{r.date}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="table-actions">
                      {r.status === 'Pending' && <button className="icon-action-button" type="button" title="Approve" onClick={() => showToast('Restock approved.', 'success')}><NavIcon name="check" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── System Reports ────────────────────────────────────────────────────────────
function ReportsPage({ showToast }) {
  const [tab, setTab] = useState('collections');
  const tabs = [
    { key: 'collections', label: 'Collections' }, { key: 'sales', label: 'Sales' },
    { key: 'branches', label: 'Branch Performance' }, { key: 'employees', label: 'Employee Performance' },
  ];
  const exportRow = <Toolbar actions={[{ label: 'Export PDF', action: 'pdf' }, { label: 'Export Excel', action: 'excel', variant: 'secondary' }]} onAction={a => showToast(`${a.label} started.`, 'success')} />;

  return (
    <div className="page">
      <div className="segmented-control" style={{ marginBottom: 24 }}>
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'collections' && (<>
        <Stats stats={[{ label: 'Total Collections (Jun)', value: '₱12.04M' }, { label: 'Growth MoM', value: '+3.3%' }]} />
        <Card title="System-wide Monthly Collections" sub="All branches combined">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={SYSTEM_MONTHLY_COLLECTIONS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => `₱${(v / 1000000).toFixed(2)}M`} />
              <Area type="monotone" dataKey="total" name="Collections" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>)}

      {tab === 'sales' && (<>
        <Stats stats={[{ label: 'Total Sales (Jun)', value: '₱10.30M' }, { label: 'Growth MoM', value: '+4.7%' }]} />
        <Card title="System-wide Monthly Sales" sub="All branches combined">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={SYSTEM_MONTHLY_SALES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => `₱${(v / 1000000).toFixed(2)}M`} />
              <Area type="monotone" dataKey="total" name="Sales" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>)}

      {tab === 'branches' && (<>
        <Card title="Branch Performance Scores">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="branch" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip /><Legend />
              <Bar dataKey="performance" name="Performance" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" name="Risk Score" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>)}

      {tab === 'employees' && (<>
        <Card title="Employee Distribution by Role">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Role</th><th>Count</th><th>Active</th><th>Inactive</th></tr></thead>
              <tbody>
                {['Operating Manager', 'Branch Manager', 'Collector', 'Sales Agent', 'Warehouse Staff', 'Customer'].map(role => {
                  const all = USERS.filter(u => u.role === role);
                  return <tr key={role}><td>{role}</td><td>{all.length}</td><td>{all.filter(u => u.status === 'Active').length}</td><td>{all.filter(u => u.status === 'Inactive').length}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {exportRow}
      </>)}
    </div>
  );
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({ showToast }) {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadAuditLogs() {
      setLoading(true);
      const result = await fetchAuditLogs();
      if (result.success) {
        setAuditLogs(result.data || []);
      } else {
        setError(result.message || 'Failed to load audit logs');
      }
      setLoading(false);
    }
    loadAuditLogs();
  }, []);

  const [searchFilter, setSearchFilter] = useState('');
  const filtered = useMemo(() => auditLogs.filter(l => {
    if (searchFilter && !l.action.toLowerCase().includes(searchFilter.toLowerCase()) && 
        !l.status_details.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    return true;
  }), [auditLogs, searchFilter]);

  if (loading) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Audit Logs</h3></div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading audit logs...</div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Audit Logs</h3></div>
          <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="accounts-filters">
          <input 
            type="text" 
            placeholder="Search by action or status..." 
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
          />
        </div>
      </section>
      <Toolbar actions={[{ label: 'Export Logs', action: 'export' }]} onAction={() => showToast('Logs exported.', 'success')} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log <span className="muted" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({filtered.length} entries)</span></h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Log ID</th><th>User ID</th><th>Action</th><th>IP Address</th><th>Status Details</th><th>Created At</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No audit logs found</td></tr>
              ) : (
                filtered.map(l => (
                  <tr key={l.log_id}>
                    <td>{l.log_id}</td>
                    <td>{l.user_id}</td>
                    <td>{l.action}</td>
                    <td>{l.ip_address}</td>
                    <td>{l.status_details}</td>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Notifications & Profile ───────────────────────────────────────────────────
function NotificationsPage({ showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <EmptyState title="No new notifications" description="System notifications will appear here." />
      </section>
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Admin Profile</h3></div>
        <ul className="info-grid">
          <li><span className="info-item-label">Name</span><span className="info-item-value">{ADMIN_PROFILE.name}</span></li>
          <li><span className="info-item-label">Employee ID</span><span className="info-item-value">{ADMIN_PROFILE.employeeId}</span></li>
          <li><span className="info-item-label">Email</span><span className="info-item-value">{ADMIN_PROFILE.email}</span></li>
          <li><span className="info-item-label">Phone</span><span className="info-item-value">{ADMIN_PROFILE.phone}</span></li>
          <li><span className="info-item-label">Role</span><span className="info-item-value">{ADMIN_PROFILE.role}</span></li>
        </ul>
      </section>
      <Toolbar actions={[{ label: 'Update Profile', action: 'update' }, { label: 'Change Password', action: 'pw', variant: 'secondary' }, { label: 'Logout', action: 'logout', variant: 'ghost' }]}
        onAction={a => { if (a.action === 'logout') requestLogout(); else showToast(`${a.label} opened.`, 'success'); }} />
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export function AdminPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to navigate." />;
  const p = { userId: page.params?.userId, branchId: page.params?.branchId, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard':    return <DashboardPage {...p} />;
    case 'userList':     return <UserListPage {...p} />;
    case 'userForm':     return <UserFormPage {...p} />;
    case 'branchList':   return <BranchListPage {...p} />;
    case 'branchDetail': return <BranchDetailPage {...p} />;
    case 'inventory':    return <InventoryPage {...p} />;
    case 'reports':      return <ReportsPage {...p} />;
    case 'auditLogs':    return <AuditLogsPage {...p} />;
    case 'notifications':return <NotificationsPage {...p} />;
    case 'profile':      return <ProfilePage {...p} />;
    default:             return <EmptyState title="Page not found" />;
  }
}
