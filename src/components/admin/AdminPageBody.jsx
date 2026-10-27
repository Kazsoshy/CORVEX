import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination, useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { useEffect, useMemo, useState, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { getCurrentUser } from '../../api/authService.js';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ADMIN_BRANCHES, ADMIN_INVENTORY, ADMIN_PROFILE, BRANCH_PERFORMANCE_CHART, TRANSFER_REQUESTS, USER_GROWTH, USER_STATS } from '../../data/adminMockData';
import { fetchAuditLogs } from '../../api/adminService';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';
import { exportRows } from '../../utils/dataExport.js';
import { getOperatingManagerAnalytics } from '../../api/reportsService.js';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { StatusBadge } from '../StatusBadge';
import { CentralInventoryPanel } from '../inventory/CentralInventoryPanel';
import { ProductImagePicker } from '../shared/ProductImagePicker';
import { deleteProductImage, uploadProductImage } from '../../api/inventoryService';
import { DetailRowsTable } from '../shared/DetailRowsTable';

function formatUserDisplayName(user) {
  return [user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ').trim() || 'User';
}

/** Whether the signed-in admin may disable/enable this row (mirrors API guards). */
function canToggleUserStatus(actor, user) {
  if (!actor || !user) return false;
  if (Number(actor.id) === Number(user.user_id)) return false;
  const targetSlug = user.role?.slug;
  const actorSlug = actor.role?.slug;
  if (targetSlug === 'super_admin' && actorSlug !== 'super_admin') return false;
  if (actorSlug === 'operating_manager' && (targetSlug === 'super_admin' || targetSlug === 'operating_manager')) {
    return false;
  }
  return true;
}

/** Whether the signed-in admin may open the edit form for this user (mirrors API guards). */
function canEditUserRecord(actor, user) {
  if (!actor || !user) return false;
  const targetSlug = user.role?.slug;
  const actorSlug = actor.role?.slug;
  if (targetSlug === 'super_admin' && actorSlug !== 'super_admin') return false;
  return true;
}

function buildUserDetailRows(user) {
  if (!user) return [];
  return [
    { key: 'id', label: 'User ID', value: user.user_id ?? '—' },
    { key: 'name', label: 'Full Name', value: formatUserDisplayName(user) },
    { key: 'first', label: 'First Name', value: user.first_name || '—' },
    { key: 'middle', label: 'Middle Name', value: user.middle_name || '—' },
    { key: 'last', label: 'Last Name', value: user.last_name || '—' },
    { key: 'email', label: 'Email', value: user.email || '—' },
    { key: 'phone', label: 'Contact', value: formatPhone(user.phone || user.contact_number) },
    { key: 'role', label: 'Role', value: user.role?.name || '—' },
    { key: 'branch', label: 'Branch', value: user.branch?.name || '—' },
    { key: 'status', label: 'Status', value: <StatusPill status={user.status} /> },
    { key: 'created', label: 'Created At', value: formatDisplayDate(user.created_at) },
    { key: 'updated', label: 'Updated At', value: formatDisplayDate(user.updated_at) },
  ];
}
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
        {action && <button className="button ghost" type="button" onClick={onAction}>{action}</button>}
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
  return <div className="page">
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
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="month" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Area type="monotone" dataKey="users" name="Users" stroke="#1A4162" fill="#1A4162" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Branch Overview" sub="Performance scores">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={BRANCH_PERFORMANCE_CHART}>
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} />
              <YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="performance" name="Performance" fill="#1A4162" radius={[4, 4, 0, 0]} />
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
  const currentUser = getCurrentUser();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const filterResetKey = `${search}|${roleFilter}|${branchFilter}|${statusFilter}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  const buildListParams = useCallback((page = pagination.currentPage) => {
    const params = {
      page,
      limit: DEFAULT_PAGE_SIZE,
    };
    if (search.trim()) params.search = search.trim();
    if (roleFilter !== 'All') params.role = roleFilter;
    if (branchFilter !== 'All') params.branch_id = branchFilter;
    if (statusFilter !== 'All') params.status = statusFilter;
    return params;
  }, [pagination.currentPage, search, roleFilter, branchFilter, statusFilter]);

  useEffect(() => {
    async function loadMeta() {
      try {
        const [rolesRes, branchesRes] = await Promise.allSettled([
          apiClient.get('/roles'),
          apiClient.get('/branches'),
        ]);
        if (rolesRes.status === 'fulfilled' && rolesRes.value.data?.success) {
          setRoles(rolesRes.value.data.data.roles || []);
        }
        if (branchesRes.status === 'fulfilled' && branchesRes.value.data?.success) {
          setBranches(branchesRes.value.data.data || []);
        }
      } catch (err) {
        console.error('Error loading admin metadata:', err);
      }
    }
    loadMeta();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      setLoading(true);
      try {
        const usersRes = await apiClient.get('/users', { params: buildListParams() });
        if (!active) return;
        if (usersRes.data?.success) {
          setUsers(usersRes.data.data || []);
          setTotalRecords(Number(usersRes.data.pagination?.total) || (usersRes.data.data || []).length);
        } else {
          setUsers([]);
          setTotalRecords(0);
          showToast('Failed to load users.', 'error');
        }
      } catch (err) {
        if (!active) return;
        console.error('Error loading users:', err);
        setUsers([]);
        setTotalRecords(0);
        showToast('Failed to load users. Restart the API on port 5000 if this persists.', 'error');
      }
      if (active) setLoading(false);
    }
    loadUsers();
    return () => { active = false; };
  }, [buildListParams, showToast]);

  const refreshUsers = async () => {
    try {
      const usersRes = await apiClient.get('/users', { params: buildListParams() });
      if (usersRes.data.success) {
        setUsers(usersRes.data.data || []);
        setTotalRecords(Number(usersRes.data.pagination?.total) || 0);
      }
    } catch (err) {
      console.error('Error refreshing users:', err);
      showToast('User list could not be refreshed.', 'error');
    }
  };

  const openViewUser = async (user) => {
    if (!user?.user_id) return;
    setViewLoading(true);
    setViewingUser(user);
    try {
      const res = await apiClient.get(`/users/${user.user_id}`);
      if (res.data?.success && res.data.data) {
        setViewingUser(res.data.data);
      }
    } catch (err) {
      console.error('Error loading user details:', err);
      showToast(err.response?.data?.message || 'Failed to load user details.', 'error');
      setViewingUser(null);
    } finally {
      setViewLoading(false);
    }
  };

  const openEditUser = (user) => {
    if (!canEditUserRecord(currentUser, user)) {
      showToast('You are not authorized to edit this account.', 'error');
      return;
    }
    setEditingUserId(user.user_id);
  };

  const handleConfirmStatusChange = async () => {
    if (!confirmAction?.user || actionBusy) return;
    const { user, action } = confirmAction;
    const name = formatUserDisplayName(user);
    setActionBusy(true);
    try {
      if (action === 'disable') {
        await apiClient.delete(`/users/${user.user_id}`);
        showToast(`${name} disabled. They can no longer sign in.`, 'success');
      } else {
        await apiClient.put(`/users/${user.user_id}`, { status: 'Active' });
        showToast(`${name} re-enabled. Access restored with their existing role.`, 'success');
      }
      setConfirmAction(null);
      await refreshUsers();
    } catch (err) {
      console.error(`Error ${action === 'disable' ? 'disabling' : 'enabling'} user:`, err);
      showToast(err.response?.data?.message || `Failed to ${action} user.`, 'error');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) return <div className="page"><LoadingState message="Loading users..." /></div>;
  return <div className="page">
      {confirmAction && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: confirmAction.action === 'disable' ? '#fca5a5' : 'rgba(26, 65, 98, 0.35)',
      background: confirmAction.action === 'disable' ? 'rgba(220,38,38,0.04)' : 'rgba(26, 65, 98, 0.04)',
      marginBottom: 24
    }}>
          {confirmAction.action === 'disable' ? <>
              <h3 style={{ margin: '0 0 8px' }}>Disable user</h3>
              <p style={{ margin: 0 }}>
                Disable <strong>{formatUserDisplayName(confirmAction.user)}</strong>? Their account will be set to Inactive and they will lose system access immediately.
                Their record, role, permissions, and history are kept — this does not permanently delete the user.
              </p>
            </> : <>
              <h3 style={{ margin: '0 0 8px' }}>Re-enable user</h3>
              <p style={{ margin: 0 }}>
                Re-enable <strong>{formatUserDisplayName(confirmAction.user)}</strong>? They will be able to sign in again with their existing role and permissions.
              </p>
            </>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className={confirmAction.action === 'disable' ? 'button danger' : 'button'}
              type="button"
              disabled={actionBusy}
              onClick={handleConfirmStatusChange}
            >
              {actionBusy ? 'Working…' : confirmAction.action === 'disable' ? 'Confirm Disable' : 'Confirm Enable'}
            </button>
            <button className="button secondary" type="button" disabled={actionBusy} onClick={() => setConfirmAction(null)}>Cancel</button>
          </div>
        </section>}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3 style={{ margin: 0 }}>Users <span className="text-ink/70" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({totalRecords})</span></h3>
        </div>

        <div className="list-section-controls" style={{ marginBottom: 16 }}>
            <input className="filter-input search" type="search" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="All">All Roles</option>
              {roles.map(r => <option key={r.id ?? r.role_id} value={r.slug}>{r.name ?? r.role_name}</option>)}
            </select>
            <select className="filter-select" value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {branches.map(b => <option key={b.branch_id ?? b.id} value={b.branch_id ?? b.id}>{b.branch_name ?? b.name}</option>)}
            </select>
            <button
              className="button"
              style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
              type="button"
              onClick={() => setShowAddUserModal(true)}
            >
              + Add User
            </button>
        </div>

        {totalRecords ? <><div className="corvex-table-wrapper">
            <table className="corvex-table corvex-table-users">
              <thead>
              <tr>
                <th className="cell-name">Name</th>
                <th className="cell-email">Email</th>
                <th className="cell-role">Role</th>
                <th className="cell-branch">Branch</th>
                <th className="cell-status">Status</th>
                <th className="cell-actions">Actions</th>
              </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const displayName = formatUserDisplayName(u);
                  const isInactive = String(u.status).toLowerCase() === 'inactive';
                  const canToggle = canToggleUserStatus(currentUser, u);
                  const canEdit = canEditUserRecord(currentUser, u);
                  return <tr key={u.user_id} className="clickable-row" onClick={() => openViewUser(u)}>
                    <td className="cell-name">
                      <strong>{displayName}</strong>
                      <span className="user-meta-id">ID {u.user_id}</span>
                    </td>
                    <td className="cell-email" title={u.email}>{u.email}</td>
                    <td className="cell-role">{u.role?.name || '—'}</td>
                    <td className="cell-branch">{u.branch?.name || '—'}</td>
                    <td className="cell-status"><StatusPill status={u.status} /></td>
                    <td className="table-actions cell-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="icon-action-button"
                        type="button"
                        title="View"
                        aria-label={`View ${displayName}`}
                        onClick={() => openViewUser(u)}
                      >
                        <NavIcon name="view" />
                      </button>
                      {canEdit ? <button
                        className="icon-action-button"
                        type="button"
                        title="Edit"
                        aria-label={`Edit ${displayName}`}
                        onClick={() => openEditUser(u)}
                      >
                        <NavIcon name="edit" />
                      </button> : null}
                      {canToggle && (isInactive
                        ? <button
                            className="icon-action-button"
                            type="button"
                            title="Enable"
                            aria-label={`Enable ${displayName}`}
                            onClick={() => setConfirmAction({ user: u, action: 'enable' })}
                          >
                            <NavIcon name="check" />
                          </button>
                        : <button
                            className="icon-action-button danger"
                            type="button"
                            title="Disable"
                            aria-label={`Disable ${displayName}`}
                            onClick={() => setConfirmAction({ user: u, action: 'disable' })}
                          >
                            <NavIcon name="ban" />
                          </button>)}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div><Pagination {...pagination} /></> : <EmptyState title="No users found" description="Adjust your search or filters." />}
      </section>

      {viewingUser ? <div className="modal-overlay" onClick={() => !viewLoading && setViewingUser(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-view-title"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="user-view-title" style={{ marginTop: 0 }}>User Details</h3>
            <p className="text-ink/70" style={{ margin: '0 0 16px', fontSize: '0.88rem' }}>
              Read-only account information. Use Edit to make changes.
            </p>
            {viewLoading ? <LoadingState message="Loading user details..." /> : (
              <DetailRowsTable rows={buildUserDetailRows(viewingUser)} />
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              {canEditUserRecord(currentUser, viewingUser) ? (
                <button
                  className="button"
                  type="button"
                  disabled={viewLoading}
                  onClick={() => {
                    const id = viewingUser.user_id;
                    setViewingUser(null);
                    setEditingUserId(id);
                  }}
                >
                  Edit User
                </button>
              ) : null}
              <button className="button secondary" type="button" disabled={viewLoading} onClick={() => setViewingUser(null)}>
                Close
              </button>
            </div>
          </div>
        </div> : null}

      {showAddUserModal ? <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <UserFormPage
              navigate={navigate}
              showToast={showToast}
              isModal
              onCancel={() => setShowAddUserModal(false)}
              onSuccess={() => { setShowAddUserModal(false); refreshUsers(); }}
            />
          </div>
        </div> : null}

      {editingUserId ? <div className="modal-overlay" onClick={() => setEditingUserId(null)}>
          <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <UserFormPage
              userId={editingUserId}
              navigate={navigate}
              showToast={showToast}
              isModal
              onCancel={() => setEditingUserId(null)}
              onSuccess={() => { setEditingUserId(null); refreshUsers(); }}
            />
          </div>
        </div> : null}
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
    if (isModal) return <LoadingState message="Loading user form..." />;
    return <div className="page"><LoadingState message="Loading..." /></div>;
  }
  return <div className={isModal ? '' : 'page'}>
      <section className={isModal ? '' : 'panel form-panel content-panel'}>
        {isModal
          ? <h3 style={{ marginTop: 0 }}>{userId ? 'Edit User' : 'Add New User'}</h3>
          : <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>{userId ? 'Edit User' : 'Add New User'}</h3></div>}
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
              {roles
                .filter(r => !['super_admin', 'operating_manager', 'client'].includes(r.slug) || String(r.id ?? r.role_id) === String(form.role_id))
                .map(r => <option key={r.id ?? r.role_id} value={r.id ?? r.role_id}>{r.name ?? r.role_name}</option>)}
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

function buildBranchDetailRows(branch) {
  if (!branch) return [];
  return [
    { key: 'id', label: 'Branch ID', value: branch.branch_id ?? '—' },
    { key: 'name', label: 'Branch Name', value: branch.branch_name || '—' },
    { key: 'address', label: 'Address', value: branch.address || '—' },
    { key: 'region', label: 'Region', value: branch.region || '—' },
    { key: 'lat', label: 'Latitude', value: branch.latitude ?? '—' },
    { key: 'lng', label: 'Longitude', value: branch.longitude ?? '—' },
    { key: 'contact', label: 'Contact No', value: formatPhone(branch.contact_no || branch.phone) },
    { key: 'email', label: 'Email', value: branch.email || '—' },
    { key: 'manager', label: 'Manager', value: branch.manager_name || '—' },
    { key: 'staff', label: 'Active Staff', value: branch.active_staff ?? '—' },
    { key: 'customers', label: 'Customers', value: branch.customer_count ?? '—' },
    { key: 'status', label: 'Status', value: <StatusPill status={branch.status} /> },
    { key: 'created', label: 'Created At', value: formatDisplayDateTime(branch.created_at) },
    { key: 'updated', label: 'Updated At', value: formatDisplayDateTime(branch.updated_at) },
  ];
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
  const [confirmArchive, setConfirmArchive] = useState(null);
  const [viewingBranch, setViewingBranch] = useState(null);
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH_FORM);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
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
    setViewingBranch(null);
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
  const openViewBranch = (branch) => {
    setViewingBranch(branch);
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
  const archiveBranch = async () => {
    if (!confirmArchive || archiveBusy) return;
    setArchiveBusy(true);
    try {
      await apiClient.put(`/branches/${confirmArchive.branch_id}`, { status: 'Inactive' });
      showToast(`${confirmArchive.branch_name} archived. The record is preserved.`, 'success');
      setConfirmArchive(null);
      loadBranches();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive branch.', 'error');
    } finally {
      setArchiveBusy(false);
    }
  };
  if (loading) {
    return <div className="page"><LoadingState message="Loading branches..." /></div>;
  }
  if (error) {
    return <div className="page">
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
  return <div className="page">
      {confirmArchive && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)',
      marginBottom: 24
    }}>
          <h3 style={{ margin: '0 0 8px' }}>Archive branch</h3>
          <p style={{ margin: 0 }}>
            Archive <strong>{confirmArchive.branch_name}</strong>? Branch operations will be restricted.
            The branch record and related history are kept — this does not permanently delete the branch.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="button danger" type="button" disabled={archiveBusy} onClick={archiveBranch}>
              {archiveBusy ? 'Working…' : 'Confirm Archive'}
            </button>
            <button className="button secondary" type="button" disabled={archiveBusy} onClick={() => setConfirmArchive(null)}>Cancel</button>
          </div>
        </section>}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>All Branches <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({branches.length})</span></h3>
          <button className="button" type="button" onClick={openCreateBranch}>+ Add Branch</button>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table corvex-table-branches">
            <thead>
              <tr>
                <th className="cell-name">Branch</th>
                <th className="cell-address">Address</th>
                <th className="cell-contact">Contact</th>
                <th className="cell-status">Status</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 ? <tr><td colSpan="5" style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#5F7385'
                }}>No branches found</td></tr> : paginatedBranches.map(b => {
                  const isInactive = String(b.status).toLowerCase() === 'inactive';
                  return <tr key={b.branch_id} className="clickable-row" onClick={() => openViewBranch(b)}>
                    <td className="cell-name">
                      <strong>{b.branch_name}</strong>
                      <span className="user-meta-id">ID {b.branch_id}</span>
                    </td>
                    <td className="cell-address" title={b.address}>{b.address || '—'}</td>
                    <td className="cell-contact" title={[formatPhone(b.contact_no || b.phone), b.email].filter(Boolean).join(' · ')}>
                      <span className="contact-phone">{formatPhone(b.contact_no || b.phone)}</span>
                      {b.email ? <span className="user-meta-id">{b.email}</span> : null}
                    </td>
                    <td className="cell-status"><StatusPill status={b.status} /></td>
                    <td className="table-actions cell-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View" aria-label={`View ${b.branch_name}`} onClick={() => openViewBranch(b)}>
                        <NavIcon name="view" />
                      </button>
                      <button className="icon-action-button" type="button" title="Edit" aria-label={`Edit ${b.branch_name}`} onClick={(e) => openEditBranch(b, e)}>
                        <NavIcon name="edit" />
                      </button>
                      {!isInactive ? (
                        <button
                          className="icon-action-button danger"
                          type="button"
                          title="Archive"
                          aria-label={`Archive ${b.branch_name}`}
                          onClick={() => setConfirmArchive(b)}
                        >
                          <NavIcon name="archive" />
                        </button>
                      ) : (
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Restore"
                          aria-label={`Restore ${b.branch_name}`}
                          onClick={async () => {
                            try {
                              await apiClient.put(`/branches/${b.branch_id}`, { status: 'Active' });
                              showToast(`${b.branch_name} restored.`, 'success');
                              loadBranches();
                            } catch (err) {
                              showToast(err.response?.data?.message || 'Failed to restore branch.', 'error');
                            }
                          }}
                        >
                          <NavIcon name="reset" />
                        </button>
                      )}
                    </td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div><Pagination {...pagination} /></>
      </section>

      {viewingBranch && <div className="modal-overlay" onClick={() => setViewingBranch(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="branch-view-title" style={{ marginTop: 0 }}>Branch Details</h3>
            <p className="text-ink/70" style={{ margin: '0 0 16px', fontSize: '0.88rem' }}>
              Read-only branch information. Use Edit to make changes.
            </p>
            <DetailRowsTable rows={buildBranchDetailRows(viewingBranch)} />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                className="button"
                type="button"
                onClick={() => openEditBranch(viewingBranch)}
              >
                Edit Branch
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`${adminBase}/branches/${viewingBranch.branch_id}`)}
              >
                Open Full Page
              </button>
              <button className="button secondary" type="button" onClick={() => setViewingBranch(null)}>
                Close
              </button>
            </div>
          </div>
        </div>}

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
  return <div className="page">
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
  const [tab, setTab] = useState('overview');
  const tabs = [{
    key: 'overview',
    label: 'Overview'
  }, {
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
  const [productStatusFilter, setProductStatusFilter] = useState('All');
  const [confirmProductAction, setConfirmProductAction] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    category_id: '',
    unit_price: '',
    status: 'Active'
  });
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const loadProducts = useCallback(async () => {
    setLoadingTab(true);
    try {
      const res = await apiClient.get('/products', {
        params: { limit: 200, product_status: productStatusFilter },
      });
      if (res.data.success) setProducts(res.data.data || []);
    } catch (err) {
      showToast('Failed to load products.', 'error');
    }
    setLoadingTab(false);
  }, [showToast, productStatusFilter]);
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
    setImageUrl('');
    setImageFile(null);
    setImageRemoved(false);
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
    setImageUrl(p.image_url || '');
    setImageFile(null);
    setImageRemoved(false);
    setShowProductForm(true);
  };
  const saveProductImage = async (productId) => {
    if (imageFile) {
      const uploaded = await uploadProductImage(productId, imageFile);
      if (!uploaded.success) {
        showToast(uploaded.message || 'Product saved, but the image could not be updated.', 'error');
        return false;
      }
    } else if (imageRemoved) {
      const removed = await deleteProductImage(productId);
      if (!removed.success) {
        showToast(removed.message || 'Product saved, but the image could not be removed.', 'error');
        return false;
      }
    }
    return true;
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
        const imageSaved = await saveProductImage(editingProductId);
        if (!imageSaved) return;
        showToast('Product updated.', 'success');
      } else {
        const created = await apiClient.post('/products', payload);
        const createdId = created.data?.data?.product_id;
        if (imageFile && createdId) {
          const imageSaved = await saveProductImage(createdId);
          if (!imageSaved) {
            setEditingProductId(createdId);
            setImageUrl('');
            loadProducts();
            return;
          }
        }
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
  const handleArchiveProduct = async (product) => {
    try {
      await apiClient.delete(`/products/${product.product_id}`, { params: { mode: 'archive' } });
      showToast('Product archived.', 'success');
      setConfirmProductAction(null);
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive product.', 'error');
    }
  };
  const handleRestoreProduct = async (product) => {
    try {
      await apiClient.put(`/products/${product.product_id}`, { status: 'Active' });
      showToast('Product restored.', 'success');
      loadProducts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to restore product.', 'error');
    }
  };
  const pagination_products = usePagination(products);
  const paginated_products = pagination_products.paginatedData;
  const pagination_TRANSFER_REQUESTS = usePagination(transfers);
  const paginated_TRANSFER_REQUESTS = pagination_TRANSFER_REQUESTS.paginatedData;
  const pagination_RESTOCK_REQUESTS = usePagination(restocks);
  const paginated_RESTOCK_REQUESTS = pagination_RESTOCK_REQUESTS.paginatedData;
  const pendingTransfer = (t) => ['Pending Approval', 'Submitted'].includes(t.status);
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && <CentralInventoryPanel title="Inventory Management" onToast={showToast} />}

      {tab === 'products' && <>
          <section className="panel content-panel relative overflow-hidden">
            <div className="list-section-header inventory-products-header">
              <h3>All Products</h3>
              <div className="list-section-actions inventory-products-actions">
                <select
                  className="filter-select"
                  value={productStatusFilter}
                  onChange={(e) => setProductStatusFilter(e.target.value)}
                  aria-label="Product status"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Archived</option>
                </select>
                <button className="button" type="button" onClick={openCreateProduct}>+ Add Product</button>
              </div>
            </div>
            {loadingTab ? <LoadingState message="Loading products…" /> : <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {!paginated_products.length ? <tr><td colSpan={7}><EmptyState title="No products" /></td></tr> : paginated_products.map(p => <tr key={p.product_id}>
                      <td>
                        <div className="product-name-with-image">
                          {p.image_url ? <img src={p.image_url} alt="" width={40} height={40} /> : null}
                          <strong>{p.product_name}</strong>
                        </div>
                      </td><td>{p.sku}</td><td>{p.category_name || '—'}</td>
                      <td>{p.unit_price != null ? Number(p.unit_price).toFixed(2) : '—'}</td>
                      <td>{p.total_quantity ?? p.quantity ?? '—'}</td>
                      <td><StatusPill status={p.status || p.stock_status} /></td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Edit" onClick={() => openEditProduct(p)}><NavIcon name="edit" /></button>
                        {String(p.status) === 'Inactive' ? (
                          <button className="icon-action-button" type="button" title="Restore" onClick={() => handleRestoreProduct(p)}><NavIcon name="reset" /></button>
                        ) : (
                          <button
                            className="icon-action-button danger"
                            type="button"
                            title="Archive"
                            onClick={() => setConfirmProductAction({ type: 'archive', product: p })}
                          >
                            <NavIcon name="archive" />
                          </button>
                        )}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_products} /></>}
          </section>

          {confirmProductAction ? <div className="modal-overlay" onClick={() => setConfirmProductAction(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <h3>Archive Product</h3>
              <p className="text-ink/70">
                Archive “{confirmProductAction.product.product_name}”? It will be hidden from active catalogs but the record is preserved and can be restored later.
              </p>
              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setConfirmProductAction(null)}>Cancel</button>
                <button
                  type="button"
                  className="button"
                  onClick={() => handleArchiveProduct(confirmProductAction.product)}
                >
                  Confirm Archive
                </button>
              </div>
            </div>
          </div> : null}

          {showProductForm && <div className="modal-overlay" onClick={() => setShowProductForm(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{
          maxWidth: 500
        }}>
                <h3>{editingProductId ? 'Edit Product' : 'Add Product'}</h3>
                <form onSubmit={handleProductSubmit}>
                  <ProductImagePicker
                    currentUrl={imageUrl}
                    file={imageFile}
                    removed={imageRemoved}
                    showToast={showToast}
                    onFile={(next) => {
                      setImageFile(next);
                      setImageRemoved(false);
                    }}
                    onRemove={() => {
                      setImageFile(null);
                      setImageRemoved(true);
                    }}
                  />
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
function reportRows(tab, analytics, users) {
  if (tab === 'collections') {
    return (analytics?.trends?.collections || []).map((row) => ({
      day: row.day,
      amount: row.amount,
    }));
  }
  if (tab === 'sales') {
    return (analytics?.topProducts || []).map((row) => ({
      product: row.productName,
      category: row.categoryName,
      quantity: row.quantitySold,
      revenue: row.revenue,
    }));
  }
  if (tab === 'branches') {
    return (analytics?.branchSummary || []).map((row) => ({
      branch: row.branchName,
      collections: row.totalCollections,
      sales: row.totalSales,
      compliance: row.routeCompliance,
      inventory_health: row.inventoryHealth,
    }));
  }
  const counts = {};
  (users || []).forEach((user) => {
    const role = user.role?.name || 'Unassigned';
    if (!counts[role]) counts[role] = { role, count: 0, active: 0, inactive: 0 };
    counts[role].count += 1;
    if (user.status === 'Active') counts[role].active += 1;
    else counts[role].inactive += 1;
  });
  return Object.values(counts);
}

function ReportsPage({
  showToast
}) {
  const [tab, setTab] = useState('collections');
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      const [report, userRes] = await Promise.all([
        getOperatingManagerAnalytics({}),
        apiClient.get('/users?limit=200').then((res) => res.data).catch(() => ({ success: false, data: [] })),
      ]);
      if (!active) return;
      if (report.success) setAnalytics(report.data);
      else setError(report.message || 'Failed to load reports.');
      if (userRes.success) setUsers(userRes.data || []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  const exportCurrent = (format) => {
    const rows = reportRows(tab, analytics, users);
    const ok = exportRows(rows, {
      format,
      filename: `admin-${tab}-report`,
      title: `CORVEX ${tabs.find((item) => item.key === tab)?.label || 'Report'}`,
    });
    if (ok) showToast(format === 'pdf' ? 'Report exported as PDF.' : 'Excel file downloaded.', 'success');
    else showToast('Nothing to export.', 'error');
  };
  const exportRow = <div className="flex justify-end gap-2 mb-4">
      <button className="button secondary" type="button" onClick={() => exportCurrent('excel')}>Export Excel</button>
      <button className="button" type="button" onClick={() => exportCurrent('pdf')}>Export PDF</button>
    </div>;
  if (loading) return <LoadingState message="Loading system reports..." />;
  if (error || !analytics) return <EmptyState title="Reports unavailable" description={error || 'No report data is available.'} />;
  const employeeRows = reportRows('employees', analytics, users);
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'collections' && <>
        <Stats stats={[{
        label: 'Collections',
        value: formatCurrency(analytics.summary?.totalCollections || 0)
      }, {
        label: 'Growth',
        value: analytics.summary?.collectionGrowthRate == null ? '—' : `${analytics.summary.collectionGrowthRate}%`
      }]} />
        <Card title="Collections Trend" sub={analytics.scope || 'All branches'}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={analytics.trends?.collections || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} /><YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Area type="monotone" dataKey="amount" name="Collections" stroke="#1A4162" fill="#1A4162" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'sales' && <>
        <Stats stats={[{
        label: 'Sales',
        value: formatCurrency(analytics.summary?.totalSales || 0)
      }, {
        label: 'Growth',
        value: analytics.summary?.salesGrowthRate == null ? '—' : `${analytics.summary.salesGrowthRate}%`
      }]} />
        <Card title="Top Products" sub="Current reporting period">
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Product</th><th>Category</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>
                {(analytics.topProducts || []).length ? analytics.topProducts.map((row) => <tr key={row.productId}>
                  <td>{row.productName}</td><td>{row.categoryName}</td><td>{row.quantitySold}</td><td>{formatCurrency(row.revenue)}</td>
                </tr>) : <tr><td colSpan="4">No sales in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        {exportRow}
      </>}

      {tab === 'branches' && <>
        <Card title="Branch Performance">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={(analytics.branchSummary || []).map((row) => ({
              branch: row.branchName,
              compliance: row.routeCompliance,
              inventory: row.inventoryHealth,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="branch" tick={{
              fontSize: 12
            }} /><YAxis domain={[0, 100]} tick={{
              fontSize: 12
            }} />
              <Tooltip /><Legend />
              <Bar dataKey="compliance" name="Route Compliance" fill="#1A4162" radius={[4, 4, 0, 0]} />
              <Bar dataKey="inventory" name="Inventory Health" fill="#1A4162" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        {exportRow}
      </>}

      {tab === 'employees' && <>
        <Card title="Employee Distribution by Role">
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Role</th><th>Count</th><th>Active</th><th>Inactive</th></tr></thead>
              <tbody>
                {employeeRows.length ? employeeRows.map((row) => <tr key={row.role}><td>{row.role}</td><td>{row.count}</td><td>{row.active}</td><td>{row.inactive}</td></tr>) : <tr><td colSpan="4">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
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
  const [searchFilter, setSearchFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
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

  const actionOptions = useMemo(() => {
    const values = new Set();
    auditLogs.forEach((log) => {
      const action = String(log.action || '').trim();
      if (action) values.add(action);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [auditLogs]);

  const userOptions = useMemo(() => {
    const byKey = new Map();
    auditLogs.forEach((log) => {
      const key = String(log.user_id ?? log.user_name ?? '');
      if (!key) return;
      const label = log.user_name || `User #${log.user_id}`;
      if (!byKey.has(key)) byKey.set(key, { value: key, label });
    });
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [auditLogs]);

  const filtered = useMemo(() => auditLogs.filter((log) => {
    const action = String(log.action || '');
    const details = String(log.status_details || '');
    const userName = String(log.user_name || `User #${log.user_id || ''}`);
    const userKey = String(log.user_id ?? log.user_name ?? '');
    const q = searchFilter.trim().toLowerCase();

    if (actionFilter !== 'all' && action !== actionFilter) return false;
    if (userFilter !== 'all' && userKey !== userFilter) return false;
    if (q) {
      const haystack = [action, details, userName, log.ip_address].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [auditLogs, searchFilter, actionFilter, userFilter]);

  const pagination_filtered = usePagination(filtered, {
    resetKey: `${searchFilter}|${actionFilter}|${userFilter}`,
  });
  const paginated_filtered = pagination_filtered.paginatedData;

  const exportPdf = () => {
    const rows = filtered.map((l) => ({
      log_id: l.log_id,
      user: l.user_name || `User #${l.user_id}`,
      action: l.action,
      ip_address: l.ip_address,
      status_details: l.status_details,
      created_at: l.created_at,
    }));
    if (exportRows(rows, { format: 'pdf', filename: 'admin-audit-logs.pdf', title: 'Audit Logs' })) {
      showToast('Logs exported as PDF.', 'success');
    } else {
      showToast('Nothing to export.', 'error');
    }
  };

  if (loading) {
    return <div className="page"><LoadingState message="Loading audit logs..." /></div>;
  }
  if (error) {
    return <div className="page">
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
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Audit Log <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({filtered.length} entries)</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search by user, action, or status…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Search audit logs"
            />
            <select
              className="filter-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filter by action"
            >
              <option value="all">All Actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              aria-label="Filter by user"
            >
              <option value="all">All Users</option>
              {userOptions.map((user) => (
                <option key={user.value} value={user.value}>{user.label}</option>
              ))}
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button" type="button" onClick={exportPdf}>Export PDF</button>
          </div>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Log ID</th><th>User</th><th>Action</th><th>IP Address</th><th>Status Details</th><th>Created At</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="6" style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#5F7385'
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
  navigate,
  showToast
}) {
  return <NotificationsInbox navigate={navigate} showToast={showToast} />;
}
function ProfilePage({
  showToast
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Admin profile"
    subtitle="Your name, contact details, and sign-in for this CORVEX account."
  />;
}

// ── Product Categories (Admin) ────────────────────────────────────────────────
function ProductCategoriesPage({
  navigate,
  showToast
}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState('');
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const query = params.toString();
      const res = await apiClient.get(`/product-categories${query ? `?${query}` : ''}`);
      if (res.data.success) setCategories(res.data.data || []);
    } catch (err) {
      showToast('Failed to load product categories.', 'error');
    }
    setLoading(false);
  }, [search, statusFilter, showToast]);
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, loadData]);
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
  const pagination_categories = usePagination(categories, {
    resetKey: `${search}|${statusFilter}`,
  });
  const paginated_categories = pagination_categories.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Product Categories <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({categories.length})</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search categories"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Archived</option>
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button" type="button" onClick={handleAdd}>+ Add Category</button>
          </div>
        </div>
        {loading ? <LoadingState message="Loading categories..." /> : categories.length === 0 ? <EmptyState title="No categories found" /> : <><div className="corvex-table-wrapper">
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(null);
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
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const query = params.toString();
      const res = await apiClient.get(`/suppliers${query ? `?${query}` : ''}`);
      if (res.data.success) setSuppliers(res.data.data || []);
    } catch (err) {
      showToast('Failed to load suppliers.', 'error');
    }
    setLoading(false);
  }, [search, statusFilter, showToast]);
  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, loadData]);
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
  const pagination_suppliers = usePagination(suppliers, {
    resetKey: `${search}|${statusFilter}`,
  });
  const paginated_suppliers = pagination_suppliers.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Suppliers <span className="text-ink/70" style={{
            fontWeight: 400,
            fontSize: '0.88rem'
          }}>({suppliers.length})</span></h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search suppliers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search suppliers"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Archived</option>
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button className="button" type="button" onClick={openForm}>+ Add Supplier</button>
          </div>
        </div>
        {loading ? <LoadingState message="Loading suppliers..." /> : suppliers.length === 0 ? <EmptyState title="No suppliers found" /> : <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>ID</th><th>Supplier Name</th><th>Contact Number</th><th>Email</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated_suppliers.map(s => <tr key={s.suppliers_id ?? s.supplier_id}>
                    <td>{s.suppliers_id ?? s.supplier_id ?? '—'}</td>
                    <td>{s.supplier_name}</td>
                    <td>{formatPhone(s.contact_number || s.contact)}</td>
                    <td>{s.email || '—'}</td>
                    <td>{s.address?.trim() ? s.address : '—'}</td>
                    <td><StatusPill status={s.status || 'Active'} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => openForm(s)}><NavIcon name="edit" /></button>
                      {String(s.status || 'Active').toLowerCase() === 'inactive' ? (
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Restore"
                          onClick={async () => {
                            try {
                              await apiClient.put(`/suppliers/${s.suppliers_id ?? s.supplier_id}`, { status: 'Active' });
                              showToast('Supplier restored.', 'success');
                              loadData();
                            } catch (err) {
                              showToast(err.response?.data?.message || 'Failed to restore supplier.', 'error');
                            }
                          }}
                        >
                          <NavIcon name="reset" />
                        </button>
                      ) : (
                        <button className="icon-action-button danger" type="button" title="Archive" onClick={() => setConfirmArchive(s)}>
                          <NavIcon name="archive" />
                        </button>
                      )}
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
      {confirmArchive && <section className="panel content-panel" style={{ borderColor: '#fca5a5', background: 'rgba(220,38,38,0.04)' }}>
          <h3 style={{ margin: '0 0 8px' }}>Archive supplier</h3>
          <p style={{ margin: 0 }}>
            Archive supplier <strong>{confirmArchive.supplier_name}</strong>? The record is preserved and can be restored later.
          </p>
          <div className="flex gap-2 mt-4">
            <button className="button danger" type="button" onClick={async () => {
              try {
                await apiClient.delete(`/suppliers/${confirmArchive.suppliers_id ?? confirmArchive.supplier_id}`);
                showToast('Supplier archived.', 'success');
                setConfirmArchive(null);
                loadData();
              } catch (err) {
                showToast(err.response?.data?.message || 'Failed to archive supplier.', 'error');
              }
            }}>Confirm Archive</button>
            <button className="button secondary" type="button" onClick={() => setConfirmArchive(null)}>Cancel</button>
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