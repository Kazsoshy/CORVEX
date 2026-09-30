import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ADMIN_BRANCHES, ADMIN_INVENTORY, ADMIN_PROFILE, BRANCH_PERFORMANCE_CHART, RESTOCK_REQUESTS, SYSTEM_MONTHLY_COLLECTIONS, SYSTEM_MONTHLY_SALES, TRANSFER_REQUESTS, USER_GROWTH, USER_STATS, USERS, getBranchById, getUserById } from '../../data/adminMockData';
import { fetchAuditLogs } from '../../api/adminService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { StatusBadge } from '../StatusBadge';
function btn(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}
function Toolbar({
  actions,
  onAction,
  children
}) {
  if (!actions?.length && !children) return null;
  return <section className="panel content-panel filter-panel">
      <div className="filter-panel-header">
        <div className="filter-panel-search" style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
          {children}
        </div>
        {actions?.length > 0 && <div className="filter-panel-actions">
            {actions.map(a => <button key={a.label} className={btn(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>)}
          </div>}
      </div>
    </section>;
}
function Stats({
  stats
}) {
  return <section className="stats-grid">
      {stats.map((s, i) => <article key={s.label} className="stat-card" style={{
      '--stat-index': i
    }}>
          <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
          <span className="stat-label">{s.label}</span>
          <strong className="stat-value">{s.value}</strong>
        </article>)}
    </section>;
}
function Card({
  title,
  sub,
  children,
  action,
  onAction
}) {
  return <section className="panel content-panel relative overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
        <div><h3>{title}</h3>{sub && <p className="text-ink/70" style={{
          margin: '2px 0 0',
          fontSize: '0.85rem'
        }}>{sub}</p>}</div>
        {action && <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={onAction}>{action}</button>}
      </div>
      {children}
    </section>;
}
function StatusPill({
  status
}) {
  return <StatusBadge status={status} />;
}

const DEFAULT_ADMIN_BASE = '/operating-manager/admin';

function getAdminBase(page) {
  if (page?.breadcrumbs?.some((c) => c.to?.startsWith('/operating-manager/admin'))) {
    return '/operating-manager/admin';
  }
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/operating-manager/admin')) {
    return '/operating-manager/admin';
  }
  return '/admin';
}

const EMPTY_BRANCH_FORM = {
  branch_name: '',
  address: '',
  latitude: '7.0731',
  longitude: '125.6128',
  contact_no: '',
  email: '',
  status: 'Active',
  manager_id: '',
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({
  navigate,
  showToast
}) {
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Operating Manager Administration</p>
          <h2>{ADMIN_PROFILE.name}</h2>
          <p className="text-ink/70">System Administration</p>
        </div>
      </section>

      <Stats stats={[{
      label: 'Total Users',
      value: String(USER_STATS.total)
    }, {
      label: 'Active Users',
      value: String(USER_STATS.active)
    }, {
      label: 'Inactive Users',
      value: String(USER_STATS.inactive)
    }, {
      label: 'New This Month',
      value: String(USER_STATS.newThisMonth)
    }, {
      label: 'Pending Approvals',
      value: String(USER_STATS.pendingApprovals)
    }, {
      label: 'Active Branches',
      value: String(ADMIN_BRANCHES.filter(b => b.status === 'Active').length)
    }]} />

      <div className="grid two-up">
        <Card title="User Growth" sub="Monthly registered users">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={USER_GROWTH}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" name="Users" stroke="#093850" fill="#093850" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Branch Overview" sub="Performance scores">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} />
              <YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="performance" name="Performance" fill="#093850" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" name="Risk Score" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Inventory Alerts" sub="Low stock & out of stock" action="Manage Inventory" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {ADMIN_INVENTORY.filter(p => p.status !== 'Sufficient').map(p => <li key={p.id}>
                <div><strong>{p.name}</strong><span className="text-ink/70">{p.branch}</span></div>
                <StatusPill status={p.status === 'Out of Stock' ? 'Inactive' : 'Pending'} />
              </li>)}
          </ul>
        </Card>

        <Card title="Pending Transfer Requests" sub="Awaiting approval" action="View All" onAction={() => navigate('/operating-manager/admin/inventory')}>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {TRANSFER_REQUESTS.filter(t => t.status === 'Pending').map(t => <li key={t.id}>
                <div><strong>{t.product}</strong><span className="text-ink/70">{t.from} → {t.to}</span></div>
                <StatusPill status={t.status} />
              </li>)}
          </ul>
        </Card>
      </div>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Quick Access</h3></div>
        <div className="quick-link-grid">
          {[{
          label: 'User Management',
          to: '/operating-manager/admin/users',
          icon: 'account'
        }, {
          label: 'Branch Management',
          to: '/operating-manager/admin/branches',
          icon: 'home'
        }, {
          label: 'Inventory Management',
          to: '/operating-manager/admin/inventory',
          icon: 'inventory'
        }, {
          label: 'System Reports',
          to: '/operating-manager/admin/reports',
          icon: 'reports'
        }, {
          label: 'Audit Logs',
          to: '/operating-manager/admin/audit-logs',
          icon: 'log'
        }].map(item => <button key={item.to} className="quick-link-card" type="button" onClick={() => navigate(item.to)} style={{
          textAlign: 'left',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer'
        }}>
              <span className="quick-link-icon"><NavIcon name={item.icon} /></span>
              <span className="quick-link-copy"><strong>{item.label}</strong><span className="text-ink/70">Open</span></span>
              <span className="quick-link-arrow">→</span>
            </button>)}
        </div>
      </section>
    </div>;
}

// ── User Management ───────────────────────────────────────────────────────────
function UserListPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [usersRes, rolesRes, branchesRes] = await Promise.allSettled([
          apiClient.get('/users'),
          apiClient.get('/roles'),
          apiClient.get('/branches'),
        ]);
        const failures = [];
        if (usersRes.status === 'fulfilled' && usersRes.value.data?.success) {
          setUsers(usersRes.value.data.data || []);
        } else {
          failures.push('users');
        }
        if (rolesRes.status === 'fulfilled' && rolesRes.value.data?.success) {
          setRoles(rolesRes.value.data.data.roles || []);
        } else {
          failures.push('roles');
        }
        if (branchesRes.status === 'fulfilled' && branchesRes.value.data?.success) {
          setBranches(branchesRes.value.data.data || []);
        } else {
          failures.push('branches');
        }
        if (failures.length) {
          console.error('Error loading admin data:', failures, {
            users: usersRes.status === 'rejected' ? usersRes.reason : null,
            roles: rolesRes.status === 'rejected' ? rolesRes.reason : null,
            branches: branchesRes.status === 'rejected' ? branchesRes.reason : null,
          });
          showToast(`Failed to load: ${failures.join(', ')}. Restart the API on port 5000 if this persists.`, 'error');
        }
      } catch (err) {
        console.error('Error loading data:', err);
        showToast('Failed to load admin data.', 'error');
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
  const pagination = usePagination(filtered);
  const paginatedUsers = pagination.paginatedData;
  const handleDisable = async user => {
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
  const refreshUsers = async () => {
    try {
      const usersRes = await apiClient.get('/users');
      if (usersRes.data.success) setUsers(usersRes.data.data || []);
    } catch (err) {
      console.error('Error refreshing users:', err);
      showToast('User was created, but the list could not be refreshed.', 'error');
    }
  };
  if (loading) return <div className="relative z-10 grid gap-[22px] w-full"><section className="panel content-panel relative overflow-hidden"><p>Loading users...</p></section></div>;
  return <div className="relative z-10 grid gap-[22px] w-full">
      {confirmDisable && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)',
      marginBottom: 24
    }}>
          <p>Disable <strong>{confirmDisable.first_name} {confirmDisable.last_name}</strong>? They will lose system access immediately.</p>
          <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 12
      }}>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" style={{
          background: '#dc2626'
        }} onClick={() => handleDisable(confirmDisable)}>Confirm Disable</button>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setConfirmDisable(null)}>Cancel</button>
          </div>
        </section>}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3 style={{
          margin: 0
        }}>Users <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({filtered.length})</span></h3>
        </div>

        <div className="list-section-controls" style={{
        marginBottom: 16
      }}>
            <input className="filter-input search" style={{
          flex: '1 1 320px',
          height: 40
        }} type="search" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" style={{
          flex: '0 1 180px',
          height: 40
        }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="filter-select" style={{
          flex: '0 1 180px',
          height: 40
        }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="All">All Roles</option>
              {roles.map(r => <option key={r.id ?? r.role_id} value={r.slug}>{r.name ?? r.role_name}</option>)}
            </select>
            <select className="filter-select" style={{
          flex: '0 1 180px',
          height: 40
        }} value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            <button
              className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0"
              style={{ flex: '0 0 auto', height: 40, whiteSpace: 'nowrap' }}
              type="button"
              onClick={() => setShowAddUserModal(true)}
            >
              + Add User
            </button>
        </div>

        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
              <tr><th>User ID</th><th>First Name</th><th>Middle Name</th><th>Last Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {paginatedUsers.map(u => <tr key={u.user_id} className="clickable-row" onClick={() => navigate(`/operating-manager/admin/users/${u.user_id}`)}>
                    <td>{u.user_id}</td>
                    <td>{u.first_name}</td>
                    <td>{u.middle_name || '—'}</td>
                    <td>{u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{u.role?.name || '—'}</td>
                    <td>{u.branch?.name || '—'}</td>
                    <td><StatusPill status={u.status} /></td>
                    <td>{formatDisplayDate(u.created_at)}</td>
                    <td>{formatDisplayDate(u.updated_at)}</td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button danger" type="button" title="Disable" onClick={() => setConfirmDisable(u)}><NavIcon name="trash" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination} /></> : <EmptyState title="No users found" description="Adjust your search or filters." />}
      </section>

      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-modal-title"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 820 }}
          >
            <div className="modal-header">
              <h3 id="add-user-modal-title">Add User</h3>
              <button className="icon-action-button" type="button" title="Close" aria-label="Close add user modal" onClick={() => setShowAddUserModal(false)}>
                <NavIcon name="close" />
              </button>
            </div>
            <UserFormPage
              navigate={navigate}
              showToast={showToast}
              isModal
              onCancel={() => setShowAddUserModal(false)}
              onSuccess={() => {
                setShowAddUserModal(false);
                refreshUsers();
              }}
            />
          </div>
        </div>
      )}
    </div>;
}
function UserFormPage({
  userId,
  navigate,
  showToast,
  isModal = false,
  onCancel,
  onSuccess
}) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    password: '',
    role_id: '',
    branch_id: '',
    status: 'Active'
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [branchesRes, rolesRes] = await Promise.all([apiClient.get('/branches'), apiClient.get('/roles')]);
        if (branchesRes.data.success) setBranches(branchesRes.data.data || []);
        if (rolesRes.data.success) setRoles(rolesRes.data.data?.roles || []);
        if (userId) {
          const userRes = await apiClient.get(`/users/${userId}`);
          if (userRes.data.success) {
            const user = userRes.data.data;
            setForm({
              first_name: user.first_name || '',
              middle_name: user.middle_name || '',
              last_name: user.last_name || '',
              email: user.email || '',
              password: '',
              role_id: user.role_id || '',
              branch_id: user.branch_id || '',
              status: user.status || 'Active'
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
      setSubmitting(true);
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        role_id: Number(form.role_id),
        branch_id: Number(form.branch_id),
        status: form.status
      };
      if (form.password) payload.password = form.password;
      if (userId) {
        await apiClient.put(`/users/${userId}`, payload);
        showToast('User updated successfully.', 'success');
      } else {
        await apiClient.post('/users', payload);
        showToast('User created successfully.', 'success');
      }
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/operating-manager/admin/users');
      }
    } catch (err) {
      console.error('Error saving user:', err);
      showToast(err.response?.data?.message || 'Failed to save user.', 'error');
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) {
    if (isModal) return <p>Loading user form...</p>;
    return <div className="relative z-10 grid gap-[22px] w-full"><section className="panel content-panel relative overflow-hidden"><p>Loading...</p></section></div>;
  }
  return <div className={isModal ? '' : 'relative z-10 grid gap-[22px] w-full'}>
      <section className={isModal ? '' : 'panel form-panel content-panel'}>
        {!isModal && <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>{userId ? 'Edit User' : 'Add New User'}</h3></div>}
        <div className="grid two-up">
          <div className="form-group">
            <label>First Name <span className="required">*</span></label>
            <input value={form.first_name} onChange={e => setForm({
            ...form,
            first_name: e.target.value
          })} placeholder="First name" />
            {errors.first_name && <p className="form-error">{errors.first_name}</p>}
          </div>
          <div className="form-group">
            <label>Middle Name</label>
            <input value={form.middle_name} onChange={e => setForm({
            ...form,
            middle_name: e.target.value
          })} placeholder="Middle name (optional)" />
          </div>
          <div className="form-group">
            <label>Last Name <span className="required">*</span></label>
            <input value={form.last_name} onChange={e => setForm({
            ...form,
            last_name: e.target.value
          })} placeholder="Last name" />
            {errors.last_name && <p className="form-error">{errors.last_name}</p>}
          </div>
          <div className="form-group">
            <label>Email <span className="required">*</span></label>
            <input type="email" value={form.email} onChange={e => setForm({
            ...form,
            email: e.target.value
          })} placeholder="name@corvex.ph" />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>
          <div className="form-group">
            <label>Password {userId ? '(leave blank to keep current)' : <span className="required">*</span>}</label>
            <input type="password" value={form.password} onChange={e => setForm({
            ...form,
            password: e.target.value
          })} placeholder="Password" />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
          <div className="form-group">
            <label>Role <span className="required">*</span></label>
            <select className="filter-select" value={form.role_id} onChange={e => setForm({
            ...form,
            role_id: e.target.value
          })}>
              <option value="">Select role</option>
              {roles.map(r => <option key={r.id ?? r.role_id} value={r.id ?? r.role_id}>{r.name ?? r.role_name}</option>)}
            </select>
            {errors.role_id && <p className="form-error">{errors.role_id}</p>}
          </div>
          <div className="form-group">
            <label>Branch <span className="required">*</span></label>
            <select className="filter-select" value={form.branch_id} onChange={e => setForm({
            ...form,
            branch_id: e.target.value
          })}>
              <option value="">Select branch</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
            </select>
            {errors.branch_id && <p className="form-error">{errors.branch_id}</p>}
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="filter-select" value={form.status} onChange={e => setForm({
            ...form,
            status: e.target.value
          })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>
      <div className={isModal ? 'modal-actions' : 'flex justify-end gap-2 mt-2'}>
        <button className="button secondary" type="button" disabled={submitting} onClick={() => onCancel ? onCancel() : navigate('/operating-manager/admin/users')}>Cancel</button>
        <button className="button" type="button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? 'Saving...' : userId ? 'Save Changes' : 'Add User'}
        </button>
      </div>
    </div>;
}

// ── Branch Management ─────────────────────────────────────────────────────────
function BranchListPage({
  navigate,
  showToast,
  adminBase = DEFAULT_ADMIN_BASE
}) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const pagination = usePagination(branches);
  const paginatedBranches = pagination.paginatedData;
  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/branches');
      if (response.data.success) {
        setBranches(response.data.data || []);
        setError(null);
      } else {
        setError(response.data.message || 'Failed to load branches');
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
      setError('Failed to load branches');
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    loadBranches();
  }, [loadBranches]);
  const openCreateBranch = () => {
    setEditingBranchId(null);
    setBranchForm(EMPTY_BRANCH_FORM);
    setBranchFormOpen(true);
  };
  const openEditBranch = (branch, e) => {
    e?.stopPropagation?.();
    setEditingBranchId(branch.branch_id);
    setBranchForm({
      branch_name: branch.branch_name || '',
      address: branch.address || '',
      latitude: String(branch.latitude ?? ''),
      longitude: String(branch.longitude ?? ''),
      contact_no: branch.contact_no || '',
      email: branch.email || '',
      status: branch.status || 'Active',
      manager_id: branch.manager_id ? String(branch.manager_id) : '',
    });
    setBranchFormOpen(true);
  };
  const saveBranch = async (e) => {
    e.preventDefault();
    if (!branchForm.branch_name.trim() || !branchForm.address.trim()) {
      showToast('Branch name and address are required.', 'error');
      return;
    }
    setSavingBranch(true);
    try {
      const payload = {
        branch_name: branchForm.branch_name.trim(),
        address: branchForm.address.trim(),
        latitude: Number(branchForm.latitude),
        longitude: Number(branchForm.longitude),
        contact_no: branchForm.contact_no.trim(),
        email: branchForm.email.trim(),
        status: branchForm.status,
        manager_id: branchForm.manager_id ? Number(branchForm.manager_id) : null,
      };
      if (editingBranchId) {
        await apiClient.put(`/branches/${editingBranchId}`, payload);
        showToast('Branch updated.', 'success');
      } else {
        await apiClient.post('/branches', payload);
        showToast('Branch created.', 'success');
      }
      setBranchFormOpen(false);
      loadBranches();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save branch.', 'error');
    } finally {
      setSavingBranch(false);
    }
  };
  const disableBranch = async () => {
    if (!confirmDisable) return;
    try {
      await apiClient.put(`/branches/${confirmDisable.branch_id}`, { status: 'Inactive' });
      showToast(`${confirmDisable.branch_name} disabled.`, 'success');
      setConfirmDisable(null);
      loadBranches();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to disable branch.', 'error');
    }
  };
  if (loading) {
    return <div className="relative z-10 grid gap-[22px] w-full">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>All Branches</h3></div>
          <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#64748b'
        }}>Loading branches...</div>
        </section>
      </div>;
  }
  if (error) {
    return <div className="relative z-10 grid gap-[22px] w-full">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>All Branches</h3></div>
          <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#dc2626'
        }}>{error}</div>
        </section>
      </div>;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>All Branches <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({branches.length})</span></h3>
          <button className="button" type="button" onClick={openCreateBranch}>+ Add Branch</button>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Branch ID</th><th>Branch Name</th><th>Address</th><th>Latitude</th><th>Longitude</th><th>Contact No</th><th>Email</th><th>Status</th><th>Created At</th><th>Actions</th></tr></thead>
            <tbody>
              {branches.length === 0 ? <tr><td colSpan="10" style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#64748b'
                }}>No branches found</td></tr> : paginatedBranches.map(b => <tr key={b.branch_id} className="clickable-row" onClick={() => navigate(`${adminBase}/branches/${b.branch_id}`)}>
                    <td>{b.branch_id}</td>
                    <td><strong>{b.branch_name}</strong></td>
                    <td>{b.address}</td>
                    <td>{b.latitude}</td>
                    <td>{b.longitude}</td>
                    <td>{b.contact_no}</td>
                    <td>{b.email}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td>{formatDisplayDateTime(b.created_at)}</td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="Edit" onClick={(e) => openEditBranch(b, e)}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Disable" onClick={() => setConfirmDisable(b)}><NavIcon name="trash" /></button>
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </div><Pagination {...pagination} /></>
      </section>
      {branchFormOpen && <div className="modal-overlay" onClick={() => !savingBranch && setBranchFormOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>{editingBranchId ? 'Edit Branch' : 'Add Branch'}</h3>
            <form onSubmit={saveBranch}>
              <div className="form-group">
                <label>Branch Name *</label>
                <input value={branchForm.branch_name} onChange={(e) => setBranchForm((f) => ({ ...f, branch_name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Address *</label>
                <input value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Latitude / Longitude *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={branchForm.latitude} onChange={(e) => setBranchForm((f) => ({ ...f, latitude: e.target.value }))} required />
                  <input value={branchForm.longitude} onChange={(e) => setBranchForm((f) => ({ ...f, longitude: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label>Contact No *</label>
                <input value={branchForm.contact_no} onChange={(e) => setBranchForm((f) => ({ ...f, contact_no: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" value={branchForm.email} onChange={(e) => setBranchForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="filter-select" value={branchForm.status} onChange={(e) => setBranchForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" disabled={savingBranch} onClick={() => setBranchFormOpen(false)}>Cancel</button>
                <button type="submit" className="button" disabled={savingBranch}>{savingBranch ? 'Saving…' : 'Save Branch'}</button>
              </div>
            </form>
          </div>
        </div>}
      {confirmDisable && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)'
    }}>
          <p>Disable <strong>{confirmDisable.branch_name}</strong>? This will restrict all branch operations.</p>
          <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 12
      }}>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" style={{
          background: '#dc2626'
        }} onClick={disableBranch}>Confirm Disable</button>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setConfirmDisable(null)}>Cancel</button>
          </div>
        </section>}
    </div>;
}
function BranchDetailPage({
  branchId,
  navigate,
  showToast,
  adminBase = DEFAULT_ADMIN_BASE
}) {
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchRes, usersRes] = await Promise.all([
        apiClient.get(`/branches/${branchId}`),
        apiClient.get('/users?role=branch_manager&status=Active&limit=100'),
      ]);
      if (branchRes.data.success) {
        setBranch(branchRes.data.data);
        setManagerId(branchRes.data.data.manager_id ? String(branchRes.data.data.manager_id) : '');
      }
      if (usersRes.data.success) setManagers(usersRes.data.data || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load branch.', 'error');
    }
    setLoading(false);
  }, [branchId, showToast]);
  useEffect(() => {
    load();
  }, [load]);
  const staff = branch?.staff || [];
  const pagination_branchUsers = usePagination(staff);
  const paginated_branchUsers = pagination_branchUsers.paginatedData;
  if (loading) return <LoadingState message="Loading branch…" />;
  if (!branch) return <EmptyState title="Branch not found" actionLabel="Back" onAction={() => navigate(`${adminBase}/branches`)} />;
  const assignManager = async () => {
    try {
      await apiClient.put(`/branches/${branchId}`, { manager_id: managerId ? Number(managerId) : null });
      showToast('Branch manager assigned.', 'success');
      setAssignOpen(false);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign manager.', 'error');
    }
  };
  const openEdit = () => {
    setBranchForm({
      branch_name: branch.branch_name || '',
      address: branch.address || '',
      latitude: String(branch.latitude ?? ''),
      longitude: String(branch.longitude ?? ''),
      contact_no: branch.contact_no || '',
      email: branch.email || '',
      status: branch.status || 'Active',
      manager_id: branch.manager_id ? String(branch.manager_id) : '',
    });
    setEditOpen(true);
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put(`/branches/${branchId}`, {
        branch_name: branchForm.branch_name.trim(),
        address: branchForm.address.trim(),
        latitude: Number(branchForm.latitude),
        longitude: Number(branchForm.longitude),
        contact_no: branchForm.contact_no.trim(),
        email: branchForm.email.trim(),
        status: branchForm.status,
      });
      showToast('Branch updated.', 'success');
      setEditOpen(false);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update branch.', 'error');
    }
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{branch.region || 'Branch'}</p>
          <h2>{branch.branch_name}</h2>
          <p className="text-ink/70">{branch.address} · Manager: {branch.manager_name || '—'}</p>
        </div>
      </section>
      <Stats stats={[{
      label: 'Active Staff',
      value: String(staff.length)
    }, {
      label: 'Customers',
      value: String(branch.customers?.active ?? branch.customers?.total ?? 0)
    }, {
      label: 'MTD Collections',
      value: String(branch.collections?.count ?? 0)
    }, {
      label: 'MTD Sales',
      value: String(branch.sales?.count ?? 0)
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Branch Users</h3></div>
        {staff.length ? <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Email</th></tr></thead>
            <tbody>{paginated_branchUsers.map(u => <tr key={u.id}><td>{u.full_name}</td><td>{u.role_name}</td><td><StatusPill status={u.status} /></td><td>{u.email}</td></tr>)}</tbody>
          </table>
        </div><Pagination {...pagination_branchUsers} /></> : <EmptyState title="No active staff" description="Assign users to this branch in User Management." />}
        <div className="flex justify-end gap-2 mt-6">
          <button className="button ghost" type="button" onClick={() => navigate(`${adminBase}/branches`)}>Back</button>
          <button className="button secondary" type="button" onClick={() => setAssignOpen(true)}>Assign Manager</button>
          <button className="button" type="button" onClick={openEdit}>Edit Branch</button>
        </div>
      </section>
      {assignOpen && <div className="modal-overlay" onClick={() => setAssignOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Assign Branch Manager</h3>
            <select className="filter-select" value={managerId} onChange={(e) => setManagerId(e.target.value)} style={{ width: '100%', marginBottom: 16 }}>
              <option value="">— None —</option>
              {managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.first_name} {m.last_name} ({m.branch_name || 'Org'})</option>)}
            </select>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setAssignOpen(false)}>Cancel</button>
              <button type="button" className="button" onClick={assignManager}>Save</button>
            </div>
          </div>
        </div>}
      {editOpen && <div className="modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Edit Branch</h3>
            <form onSubmit={saveEdit}>
              <div className="form-group"><label>Branch Name</label><input value={branchForm.branch_name} onChange={(e) => setBranchForm((f) => ({ ...f, branch_name: e.target.value }))} /></div>
              <div className="form-group"><label>Address</label><input value={branchForm.address} onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div className="form-group"><label>Contact / Email</label>
                <input value={branchForm.contact_no} onChange={(e) => setBranchForm((f) => ({ ...f, contact_no: e.target.value }))} style={{ marginBottom: 8 }} />
                <input type="email" value={branchForm.email} onChange={(e) => setBranchForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group"><label>Status</label>
                <select className="filter-select" value={branchForm.status} onChange={(e) => setBranchForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setEditOpen(false)}>Cancel</button>
                <button type="submit" className="button">Save Changes</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// ── Inventory Management ──────────────────────────────────────────────────────
function InventoryPage({
  navigate,
  showToast
}) {
  const [tab, setTab] = useState('products');
  const tabs = [{
    key: 'products',
    label: 'Products'
  }, {
    key: 'transfers',
    label: 'Transfer Requests'
  }, {
    key: 'restock',
    label: 'Restock Records'
  }];
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    unit_price: '',
    status: 'Active'
  });
  const loadProducts = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/products?limit=200');
      if (res.data.success) setProducts(res.data.data || []);
    } catch (err) {
      showToast('Failed to load products.', 'error');
    }
    setLoadingTab(false);
  }, [showToast]);
  const loadTransfers = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/inventory/transfers');
      if (res.data.success) setTransfers(res.data.data || []);
    } catch (err) {
      showToast('Failed to load transfers.', 'error');
    }
    setLoadingTab(false);
  }, [showToast]);
  const loadRestocks = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/inventory/restocks');
      if (res.data.success) setRestocks(res.data.data || []);
    } catch (err) {
      showToast('Failed to load restocks.', 'error');
    }
    setLoadingTab(false);
  }, [showToast]);
  useEffect(() => {
    if (tab === 'products') loadProducts();
    if (tab === 'transfers') loadTransfers();
    if (tab === 'restock') loadRestocks();
  }, [tab, loadProducts, loadTransfers, loadRestocks]);
  const openCreateProduct = () => {
    setEditingProductId(null);
    setProductForm({ name: '', sku: '', category_id: '', unit_price: '', status: 'Active' });
    setShowProductForm(true);
  };
  const openEditProduct = (p) => {
    setEditingProductId(p.product_id);
    setProductForm({
      name: p.product_name || p.name || '',
      sku: p.sku || '',
      category_id: p.category_id ? String(p.category_id) : '',
      unit_price: p.unit_price != null ? String(p.unit_price) : '',
      status: p.status || 'Active',
    });
    setShowProductForm(true);
  };
  const handleProductSubmit = async e => {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.sku.trim()) return showToast('Name and SKU are required.', 'error');
    try {
      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        category_id: productForm.category_id ? Number(productForm.category_id) : null,
        unit_price: productForm.unit_price ? Number(productForm.unit_price) : 0,
        status: productForm.status,
      };
      if (editingProductId) {
        await apiClient.put(`/products/${editingProductId}`, payload);
        showToast('Product updated.', 'success');
      } else {
        await apiClient.post('/products', payload);
        showToast('Product created.', 'success');
      }
      setShowProductForm(false);
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save product.', 'error');
    }
  };
  const updateTransferStatus = async (transferId, status) => {
    try {
      await apiClient.patch(`/inventory/transfers/${transferId}`, { status });
      showToast(`Transfer ${status.toLowerCase()}.`, 'success');
      loadTransfers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update transfer.', 'error');
    }
  };
  const pagination_products = usePagination(products);
  const paginated_products = pagination_products.paginatedData;
  const pagination_TRANSFER_REQUESTS = usePagination(transfers);
  const paginated_TRANSFER_REQUESTS = pagination_TRANSFER_REQUESTS.paginatedData;
  const pagination_RESTOCK_REQUESTS = usePagination(restocks);
  const paginated_RESTOCK_REQUESTS = pagination_RESTOCK_REQUESTS.paginatedData;
  const pendingTransfer = (t) => ['Pending Approval', 'Submitted'].includes(t.status);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'products' && <>
          <section className="panel content-panel relative overflow-hidden">
            <div className="list-section-header">
              <h3>All Products</h3>
              <div className="list-section-actions">
                <button className="button" type="button" onClick={openCreateProduct}>+ Add Product</button>
              </div>
            </div>
            {loadingTab ? <LoadingState message="Loading products…" /> : <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!paginated_products.length ? <tr><td colSpan={7}><EmptyState title="No products" /></td></tr> : paginated_products.map(p => <tr key={p.product_id}>
                      <td><strong>{p.product_name}</strong></td><td>{p.sku}</td><td>{p.category_name || '—'}</td>
                      <td>{p.unit_price != null ? Number(p.unit_price).toFixed(2) : '—'}</td>
                      <td>{p.total_quantity ?? p.quantity ?? '—'}</td>
                      <td><StatusPill status={p.stock_status || p.status} /></td>
                      <td className="table-actions"><button className="icon-action-button" type="button" title="Edit" onClick={() => openEditProduct(p)}><NavIcon name="edit" /></button></td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_products} /></>}
          </section>

          {showProductForm && <div className="modal-overlay" onClick={() => setShowProductForm(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{
          maxWidth: 500
        }}>
                <h3>{editingProductId ? 'Edit Product' : 'Add Product'}</h3>
                <form onSubmit={handleProductSubmit}>
                  <div className="form-group">
                    <label>Product Name <span className="required">*</span></label>
                    <input type="text" value={productForm.name} onChange={e => setProductForm(p => ({
                ...p,
                name: e.target.value
              }))} placeholder="e.g. Sofa" />
                  </div>
                  <div className="form-group">
                    <label>SKU <span className="required">*</span></label>
                    <input type="text" value={productForm.sku} onChange={e => setProductForm(p => ({
                ...p,
                sku: e.target.value
              }))} placeholder="SOFA-123" disabled={Boolean(editingProductId)} />
                  </div>
                  <div className="form-group">
                    <label>Category ID</label>
                    <input type="text" value={productForm.category_id} onChange={e => setProductForm(p => ({
                ...p,
                category_id: e.target.value
              }))} placeholder="e.g. 1" />
                  </div>
                  <div className="form-group">
                    <label>Unit Price</label>
                    <input type="number" min="0" step="0.01" value={productForm.unit_price} onChange={e => setProductForm(p => ({
                ...p,
                unit_price: e.target.value
              }))} />
                  </div>
                  {editingProductId ? <div className="form-group">
                    <label>Status</label>
                    <select className="filter-select" value={productForm.status} onChange={e => setProductForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div> : null}
                  <div className="modal-actions">
                    <button type="button" className="button secondary" onClick={() => setShowProductForm(false)}>Cancel</button>
                    <button type="submit" className="button">{editingProductId ? 'Save Changes' : 'Create Product'}</button>
                  </div>
                </form>
              </div>
            </div>}
        </>}

      {tab === 'transfers' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Transfer Requests</h3></div>
          {loadingTab ? <LoadingState message="Loading transfers…" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Ref</th><th>Product</th><th>From</th><th>To</th><th>Qty</th><th>Submitted By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_TRANSFER_REQUESTS.map(t => <tr key={t.transfer_id}>
                    <td>{t.transfer_ref}</td><td>{t.product_name}</td><td>{t.source_branch}</td><td>{t.destination_branch}</td><td>{t.quantity}</td>
                    <td>{t.submitted_by_name || '—'}</td><td>{formatDisplayDate(t.submitted_date)}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="table-actions">
                      {pendingTransfer(t) && <>
                        <button className="icon-action-button" type="button" title="Approve" onClick={() => updateTransferStatus(t.transfer_id, 'Approved')}><NavIcon name="check" /></button>
                        <button className="icon-action-button danger" type="button" title="Reject" onClick={() => updateTransferStatus(t.transfer_id, 'Rejected')}><NavIcon name="close" /></button>
                      </>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_TRANSFER_REQUESTS} /></>}
        </section>}

      {tab === 'restock' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Restock Records</h3></div>
          {loadingTab ? <LoadingState message="Loading restocks…" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Delivery Ref</th><th>Product</th><th>Branch</th><th>Qty</th><th>Supplier</th><th>Received</th></tr></thead>
              <tbody>
                {paginated_RESTOCK_REQUESTS.map(r => <tr key={r.restock_id}>
                    <td>{r.delivery_ref}</td><td>{r.product_name}</td><td>{r.branch_name}</td><td>{r.quantity}</td>
                    <td>{r.supplier_name || '—'}</td><td>{formatDisplayDate(r.received_date)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_RESTOCK_REQUESTS} /></>}
        </section>}
    </div>;
}

// ── System Reports ────────────────────────────────────────────────────────────
function ReportsPage({
  showToast
}) {
  const [tab, setTab] = useState('collections');
  const tabs = [{
    key: 'collections',
    label: 'Collections'
  }, {
    key: 'sales',
    label: 'Sales'
  }, {
    key: 'branches',
    label: 'Branch Performance'
  }, {
    key: 'employees',
    label: 'Employee Performance'
  }];
  const exportRow = <div className="flex justify-end gap-2 mb-4">
      <button className="button secondary" type="button" onClick={() => showToast('Export Excel started.', 'success')}>Export Excel</button>
      <button className="button" type="button" onClick={() => showToast('Export PDF started.', 'success')}>Export PDF</button>
    </div>;
  const pagination___Operating_Manager____Branch_Manager____Collector____Sales_Agent____Warehouse_Staff____Customer__ = usePagination(['Operating Manager', 'Branch Manager', 'Collector', 'Sales Agent', 'Warehouse Staff', 'Customer']);
  const paginated___Operating_Manager____Branch_Manager____Collector____Sales_Agent____Warehouse_Staff____Customer__ = pagination___Operating_Manager____Branch_Manager____Collector____Sales_Agent____Warehouse_Staff____Customer__.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'collections' && <>
        <Stats stats={[{
        label: 'Total Collections (Jun)',
        value: '₱12.04M'
      }, {
        label: 'Growth MoM',
        value: '+3.3%'
      }]} />
        <Card title="System-wide Monthly Collections" sub="All branches combined">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={SYSTEM_MONTHLY_COLLECTIONS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} /><YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => `₱${(v / 1000000).toFixed(2)}M`} />
              <Area type="monotone" dataKey="total" name="Collections" stroke="#093850" fill="#093850" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'sales' && <>
        <Stats stats={[{
        label: 'Total Sales (Jun)',
        value: '₱10.30M'
      }, {
        label: 'Growth MoM',
        value: '+4.7%'
      }]} />
        <Card title="System-wide Monthly Sales" sub="All branches combined">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={SYSTEM_MONTHLY_SALES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} /><YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => `₱${(v / 1000000).toFixed(2)}M`} />
              <Area type="monotone" dataKey="total" name="Sales" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'branches' && <>
        <Card title="Branch Performance Scores">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} /><YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip /><Legend />
              <Bar dataKey="performance" name="Performance" fill="#093850" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" name="Risk Score" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'employees' && <>
        <Card title="Employee Distribution by Role">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Role</th><th>Count</th><th>Active</th><th>Inactive</th></tr></thead>
              <tbody>
                {paginated___Operating_Manager____Branch_Manager____Collector____Sales_Agent____Warehouse_Staff____Customer__.map(role => {
                  const all = USERS.filter(u => u.role === role);
                  return <tr key={role}><td>{role}</td><td>{all.length}</td><td>{all.filter(u => u.status === 'Active').length}</td><td>{all.filter(u => u.status === 'Inactive').length}</td></tr>;
                })}
              </tbody>
            </table>
          </div><Pagination {...pagination___Operating_Manager____Branch_Manager____Collector____Sales_Agent____Warehouse_Staff____Customer__} /></>
        </Card>
        {exportRow}
      </>}
    </div>;
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({
  showToast
}) {
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
    if (searchFilter && !l.action.toLowerCase().includes(searchFilter.toLowerCase()) && !l.status_details.toLowerCase().includes(searchFilter.toLowerCase())) {
      return false;
    }
    return true;
  }), [auditLogs, searchFilter]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) {
    return <div className="relative z-10 grid gap-[22px] w-full">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Logs</h3></div>
          <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#64748b'
        }}>Loading audit logs...</div>
        </section>
      </div>;
  }
  if (error) {
    return <div className="relative z-10 grid gap-[22px] w-full">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Logs</h3></div>
          <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#dc2626'
        }}>{error}</div>
        </section>
      </div>;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Audit Log <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({filtered.length} entries)</span></h3>
          <button className="button" type="button" onClick={() => showToast('Logs exported.', 'success')}>Export Logs</button>
        </div>
        <div className="list-section-controls" style={{ marginBottom: 12 }}>
          <input className="filter-input search" type="search" placeholder="Search by action or status..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Log ID</th><th>User</th><th>Action</th><th>IP Address</th><th>Status Details</th><th>Created At</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="6" style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#64748b'
                }}>No audit logs found</td></tr> : paginated_filtered.map(l => <tr key={l.log_id}>
                    <td>{l.log_id}</td>
                    <td>{l.user_name || `User #${l.user_id}`}</td>
                    <td>{l.action}</td>
                    <td>{l.ip_address}</td>
                    <td>{l.status_details}</td>
                    <td>{formatDisplayDateTime(l.created_at)}</td>
                  </tr>)}
            </tbody>
          </table>
        </div><Pagination {...pagination_filtered} /></>
      </section>
    </div>;
}

// ── Notifications & Profile ───────────────────────────────────────────────────
function NotificationsPage({
  showToast
}) {
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <EmptyState title="No new notifications" description="System notifications will appear here." />
      </section>
    </div>;
}
function ProfilePage({
  navigate,
  showToast
}) {
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Admin Profile</h3></div>
        <ul className="info-grid">
          <li><span className="info-item-label">Name</span><span className="info-item-value">{ADMIN_PROFILE.name}</span></li>
          <li><span className="info-item-label">Employee ID</span><span className="info-item-value">{ADMIN_PROFILE.employeeId}</span></li>
          <li><span className="info-item-label">Email</span><span className="info-item-value">{ADMIN_PROFILE.email}</span></li>
          <li><span className="info-item-label">Phone</span><span className="info-item-value">{ADMIN_PROFILE.phone}</span></li>
          <li><span className="info-item-label">Role</span><span className="info-item-value">{ADMIN_PROFILE.role}</span></li>
        </ul>
        <div className="flex justify-end gap-2 mt-6">
          <button className="button ghost" type="button" onClick={() => {
          /* requestLogout() */showToast('Logout clicked.', 'success');
        }}>Logout</button>
          <button className="button secondary" type="button" onClick={() => showToast('Change Password opened.', 'success')}>Change Password</button>
          <button className="button" type="button" onClick={() => showToast('Update Profile opened.', 'success')}>Update Profile</button>
        </div>
      </section>
    </div>;
}

// ── Product Categories (Admin) ────────────────────────────────────────────────
function ProductCategoriesPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/product-categories${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (res.data.success) setCategories(res.data.data || []);
    } catch (err) {
      showToast('Failed to load product categories.', 'error');
    }
    setLoading(false);
  };
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search]);
  const handleAdd = () => {
    setEditing(null);
    setFormName('');
    setShowForm(true);
  };
  const handleEdit = c => {
    setEditing(c);
    setFormName(c.category_name);
    setShowForm(true);
  };
  const handleArchive = async c => {
    if (!window.confirm(`Archive category "${c.category_name}"?`)) return;
    try {
      await apiClient.delete(`/product-categories/${c.category_id}`);
      showToast('Category archived.', 'success');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive.', 'error');
    }
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (!formName.trim()) return showToast('Category name is required.', 'error');
    try {
      if (editing) {
        await apiClient.put(`/product-categories/${editing.category_id}`, {
          category_name: formName.trim()
        });
        showToast('Category updated.', 'success');
      } else {
        await apiClient.post('/product-categories', {
          category_name: formName.trim()
        });
        showToast('Category created.', 'success');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save.', 'error');
    }
  };
  const pagination_categories = usePagination(categories);
  const paginated_categories = pagination_categories.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Product Categories <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({categories.length})</span></h3>
          <div className="list-section-actions">
            <button className="button" type="button" onClick={handleAdd}>+ Add Category</button>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? <p>Loading…</p> : categories.length === 0 ? <EmptyState title="No categories found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>ID</th><th>Category Name</th><th>Status</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_categories.map(c => <tr key={c.category_id}>
                    <td>{c.category_id}</td>
                    <td>{c.category_name}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td>{formatDisplayDateTime(c.created_at)}</td>
                    <td>{formatDisplayDateTime(c.updated_at || c.created_at)}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => handleEdit(c)}><NavIcon name="edit" /></button>
                      {c.status === 'Active' && <button className="icon-action-button danger" type="button" title="Archive" onClick={() => handleArchive(c)}><NavIcon name="archive" /></button>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_categories} /></>}
      </section>
      {showForm && <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        maxWidth: 500
      }}>
            <h3>{editing ? 'Edit Category' : 'Add Category'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category Name</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Living Room" />
              </div>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="button">{editing ? 'Save Changes' : 'Create Category'}</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// ── Suppliers (Admin) ─────────────────────────────────────────────────────────
function SuppliersAdminPage({
  navigate,
  showToast
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    supplier_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'Active'
  });
  const emptyForm = {
    supplier_name: '',
    contact: '',
    email: '',
    address: '',
    status: 'Active'
  };
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (res.data.success) setSuppliers(res.data.data || []);
    } catch (err) {
      showToast('Failed to load suppliers.', 'error');
    }
    setLoading(false);
  }, [search, showToast]);
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, loadData]);
  const openForm = (supplier = null) => {
    if (supplier) {
      setEditingSupplierId(supplier.suppliers_id ?? supplier.supplier_id);
      setForm({
        supplier_name: supplier.supplier_name || '',
        contact: supplier.contact || supplier.contact_number || '',
        email: supplier.email || '',
        address: supplier.address || '',
        status: supplier.status || 'Active',
      });
    } else {
      setEditingSupplierId(null);
      setForm(emptyForm);
    }
    setErrors({});
    setShowForm(true);
  };
  const closeForm = () => {
    if (submitting) return;
    setShowForm(false);
    setForm(emptyForm);
    setErrors({});
  };
  const updateFormField = (field, value) => {
    setForm(current => ({
      ...current,
      [field]: value
    }));
    setErrors(current => {
      if (!current[field] && !current.submit) return current;
      const next = {
        ...current
      };
      delete next[field];
      delete next.submit;
      return next;
    });
  };
  const handleSubmit = async e => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.supplier_name.trim()) nextErrors.supplier_name = 'Supplier name is required.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        supplier_name: form.supplier_name.trim(),
        contact: form.contact.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        status: form.status
      };
      if (editingSupplierId) {
        await apiClient.put(`/suppliers/${editingSupplierId}`, payload);
        showToast('Supplier updated.', 'success');
      } else {
        await apiClient.post('/suppliers', payload);
        showToast('Supplier created.', 'success');
      }
      setShowForm(false);
      setEditingSupplierId(null);
      setForm(emptyForm);
      setErrors({});
      loadData();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create supplier.';
      setErrors({
        submit: message
      });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  const pagination_suppliers = usePagination(suppliers);
  const paginated_suppliers = pagination_suppliers.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Suppliers <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({suppliers.length})</span></h3>
          <div className="list-section-actions">
            <button className="button" type="button" onClick={openForm}>+ Add Supplier</button>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? <p>Loading…</p> : suppliers.length === 0 ? <EmptyState title="No suppliers found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>ID</th><th>Supplier Name</th><th>Contact</th><th>Email</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_suppliers.map(s => <tr key={s.suppliers_id ?? s.supplier_id}>
                    <td>{s.suppliers_id ?? s.supplier_id ?? '—'}</td>
                    <td>{s.supplier_name}</td>
                    <td>{s.contact_number || s.contact || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>{s.address?.trim() ? s.address : '—'}</td>
                    <td><StatusPill status={s.status || 'Active'} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => openForm(s)}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Delete" onClick={() => setConfirmDelete(s)}><NavIcon name="trash" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_suppliers} /></>}
      </section>
      {showForm && <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-supplier-title" onClick={e => e.stopPropagation()} style={{
        maxWidth: 500
      }}>
            <h3 id="add-supplier-title">{editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="supplier-name">Supplier Name <span aria-hidden="true">*</span></label>
                <input id="supplier-name" type="text" value={form.supplier_name} onChange={e => updateFormField('supplier_name', e.target.value)} placeholder="Company Name" aria-invalid={Boolean(errors.supplier_name)} aria-describedby={errors.supplier_name ? 'supplier-name-error' : undefined} autoFocus />
                {errors.supplier_name && <p id="supplier-name-error" className="form-error">{errors.supplier_name}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="supplier-contact">Contact Number</label>
                <input id="supplier-contact" type="text" value={form.contact} onChange={e => updateFormField('contact', e.target.value)} placeholder="+63..." />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-email">Email Address</label>
                <input id="supplier-email" type="email" value={form.email} onChange={e => updateFormField('email', e.target.value)} placeholder="email@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'supplier-email-error' : undefined} />
                {errors.email && <p id="supplier-email-error" className="form-error">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="supplier-address">Address</label>
                <textarea id="supplier-address" value={form.address} onChange={e => updateFormField('address', e.target.value)} placeholder="Supplier address" rows={3} />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-status">Status</label>
                <select id="supplier-status" className="filter-select" value={form.status} onChange={e => updateFormField('status', e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {errors.submit && <p className="form-error" role="alert">{errors.submit}</p>}
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={closeForm} disabled={submitting}>Cancel</button>
                <button type="submit" className="button" disabled={submitting}>{submitting ? 'Saving…' : editingSupplierId ? 'Save Changes' : 'Add Supplier'}</button>
              </div>
            </form>
          </div>
        </div>}
      {confirmDelete && <section className="panel content-panel" style={{ borderColor: '#fca5a5' }}>
          <p>Delete supplier <strong>{confirmDelete.supplier_name}</strong>? This cannot be undone.</p>
          <div className="flex gap-2 mt-4">
            <button className="button" type="button" style={{ background: '#dc2626' }} onClick={async () => {
              try {
                await apiClient.delete(`/suppliers/${confirmDelete.suppliers_id ?? confirmDelete.supplier_id}`);
                showToast('Supplier deleted.', 'success');
                setConfirmDelete(null);
                loadData();
              } catch (err) {
                showToast(err.response?.data?.message || 'Failed to delete supplier.', 'error');
              }
            }}>Confirm Delete</button>
            <button className="button secondary" type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </section>}
    </div>;
}

// ── Export ────────────────────────────────────────────────────────────────────
export function AdminPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to navigate." />;
  const adminBase = getAdminBase(page);
  const p = {
    userId: page.params?.userId,
    branchId: page.params?.branchId,
    navigate,
    showToast,
    adminBase
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...p} />;
    case 'userList':
      return <UserListPage {...p} />;
    case 'userForm':
      return <UserFormPage {...p} />;
    case 'branchList':
      return <BranchListPage {...p} />;
    case 'branchDetail':
      return <BranchDetailPage {...p} />;
    case 'inventory':
      return <InventoryPage {...p} />;
    case 'reports':
      return <ReportsPage {...p} />;
    case 'auditLogs':
      return <AuditLogsPage {...p} />;
    case 'notifications':
      return <NotificationsPage {...p} />;
    case 'profile':
      return <ProfilePage {...p} />;
    case 'productCategories':
      return <ProductCategoriesPage {...p} />;
    case 'suppliers':
      return <SuppliersAdminPage {...p} />;
    default:
      return <EmptyState title="Page not found" />;
  }
}