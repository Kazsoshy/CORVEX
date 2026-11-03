import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api/apiClient';
import { fetchAuditLogs } from '../../api/adminService';
import { exportRows } from '../../utils/dataExport';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import {
  createSystemBackup,
  downloadSystemBackup,
  fetchSystemBackups,
  fetchSystemSettings,
  resetSystemSettings,
  restoreSystemBackup,
  saveSystemSettings,
} from '../../api/systemService';
import {
  fetchSecuritySummary,
  fetchSecurityEvents,
  updateSecurityEventStatus,
  runSecuritySweep,
} from '../../api/securityService.js';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { NavIcon } from '../../navIcons';
import { StatusBadge } from '../StatusBadge';
import { formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { brand, chartMuted, textMuted } from '../../theme/palette.js';
import { can, MANAGE_IMPLIES_VIEW } from '../../utils/permissions.js';
import { getCurrentUser, refreshSessionPermissions } from '../../api/authService.js';
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
function MetricBar({
  label,
  value,
  max = 100,
  color = brand
}) {
  return <div style={{
    marginBottom: 14
  }}>
      <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 4
    }}>
        <span style={{
        fontSize: '0.88rem',
        fontWeight: 600
      }}>{label}</span>
        <span style={{
        fontSize: '0.88rem',
        color: textMuted
      }}>{value}{max === 100 ? '%' : ' ms'}</span>
      </div>
      <div style={{
      height: 8,
      background: chartMuted,
      borderRadius: 999,
      overflow: 'hidden'
    }}>
        <div style={{
        height: '100%',
        width: `${value / max * 100}%`,
        background: color,
        borderRadius: 999,
        transition: 'width 0.4s'
      }} />
      </div>
    </div>;
}
function SeverityBadge({
  severity
}) {
  return <StatusBadge status={severity} />;
}

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DashboardPage({
  navigate
}) {
  const [health, setHealth] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [hRes, uRes, bRes, aRes] = await Promise.all([apiClient.get('/dashboard/system-health'), apiClient.get('/dashboard/user-stats'), apiClient.get('/branches'), apiClient.get('/dashboard/recent-audit')]);
        if (hRes.data.success) setHealth(hRes.data.data);
        if (uRes.data.success) setUserStats(uRes.data.data);
        if (bRes.data.success) setBranches(bRes.data.data);
        if (aRes.data.success) setAuditLogs(aRes.data.data);
      } catch (err) {
        console.error('[SuperAdmin] dashboard load error:', err.message);
      }
      setLoading(false);
    }
    load();
  }, []);
  const pagination_userStats_byRole = usePagination(userStats?.byRole || []);
  const paginated_userStats_byRole = pagination_userStats_byRole.paginatedData;
  const pagination_branches = usePagination(branches || []);
  const paginated_branches = pagination_branches.paginatedData;
  const pagination_auditLogs = usePagination(auditLogs || []);
  const paginated_auditLogs = pagination_auditLogs.paginatedData;
  if (loading) return <LoadingState message="Loading system dashboard..." />;
  const dbColor = health?.dbStatus === 'Online' ? '#2A9B6A' : '#dc2626';
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Super Admin</p>
          <h2>System Overview</h2>
          <p className="text-ink/70">Full system control &amp; infrastructure</p>
        </div>
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 12,
        border: `1.5px solid ${dbColor}22`,
        background: `${dbColor}0d`
      }}>
          <span style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: dbColor,
          flexShrink: 0
        }} />
          <span style={{
          fontSize: '0.82rem',
          fontWeight: 700,
          color: dbColor
        }}>DB {health?.dbStatus || 'Unknown'}</span>
        </div>
      </section>

      <Stats stats={[{
      label: 'Total Users',
      value: String(health?.totalUsers || 0)
    }, {
      label: 'Active Users',
      value: String(health?.activeUsers || 0)
    }, {
      label: 'Total Branches',
      value: String(health?.totalBranches || 0)
    }, {
      label: 'API Response',
      value: `${health?.apiResponseMs || 0} ms`
    }, {
      label: 'Login Errors (24h)',
      value: String(health?.errorCount || 0)
    }, {
      label: 'New Users (Month)',
      value: String(userStats?.newThisMonth || 0)
    }]} />

      {/* User breakdown by role â€” from users table */}
      {userStats?.byRole?.length ? <Card title="Users by Role" sub="Source: users table â€” COUNT(*) grouped by role">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Role</th><th>Total</th><th>Active</th><th>Inactive</th></tr></thead>
              <tbody>
                {paginated_userStats_byRole.map(r => <tr key={r.slug}>
                    <td><strong>{r.role}</strong></td>
                    <td>{r.total}</td>
                    <td style={{
                  color: '#2A9B6A'
                }}>{r.active}</td>
                    <td style={{
                  color: '#dc2626'
                }}>{r.inactive}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_userStats_byRole} /></>
        </Card> : null}

      {/* Branch directory — from branches table with full fields */}
      {branches.length ? <Card title="Branch Directory" sub="Source: branches table — branch_id, branch_name, address, latitude, longitude, contact_no, email, status, created_at">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>Branch ID</th><th>Branch Name</th><th>Address</th><th>Latitude</th><th>Longitude</th><th>Contact No</th><th>Email</th><th>Status</th><th>Created At</th></tr>
              </thead>
              <tbody>
                {paginated_branches.map(b => <tr key={b.branch_id}>
                    <td>{b.branch_id}</td>
                    <td><strong>{b.branch_name}</strong></td>
                    <td>{b.address}</td>
                    <td>{b.latitude}</td>
                    <td>{b.longitude}</td>
                    <td>{formatPhone(b.contact_no || b.phone)}</td>
                    <td>{b.email}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>{formatDisplayDateTime(b.created_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_branches} /></>
        </Card> : null}

      {/* System performance chart â€” from dashboard/system-health */}
      <Card title="System Resource Usage" sub="Memory is measured from the host. CPU and disk are not collected.">
        <div style={{
        padding: '8px 0'
      }}>
          {health?.memoryUsage != null ? <MetricBar label="Memory Usage" value={health.memoryUsage} color={brand} /> : null}
          <MetricBar label="API Response" value={health?.apiResponseMs || 0} max={500} color="#f59e0b" />
        </div>
      </Card>

      {/* Recent audit logs â€” from audit_logs table */}
      {auditLogs.length ? <Card title="Recent Audit Activity" sub="Source: audit_logs table â€” last 10 entries">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>User</th><th>Action</th><th>IP Address</th><th>Details</th><th>Time</th></tr></thead>
              <tbody>
                {paginated_auditLogs.map(l => <tr key={l.log_id}>
                    <td><strong>{l.user_name}</strong></td>
                    <td>{l.action}</td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem'
                  }}>{l.ip_address}</span></td>
                    <td>{l.status_details}</td>
                    <td className="text-ink/70" style={{
                  fontSize: '0.8rem'
                }}>{formatDisplayDateTime(l.created_at)}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_auditLogs} /></>
        </Card> : null}

    </div>;
}

// â”€â”€ Role & Permission Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ──────────────────────────────────────────────────────────────────────────────
// Role & Permission Management
// ──────────────────────────────────────────────────────────────────────────────

function formatRoleUserName(user) {
  if (!user) return '—';
  const parts = [user.first_name, user.middle_name, user.last_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return user.fullName || user.username || user.email || `User #${user.id}`;
}

function isActiveRoleStatus(status) {
  return String(status || 'Active').toLowerCase() !== 'inactive';
}

function RolesPage({
  showToast
}) {
  const [tab, setTab] = useState('users'); // users | roles | permissions
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [selectedUserId, setSelectedUserId] = useState(null);

  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permLocked, setPermLocked] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [modules, setModules] = useState([]);
  const [draftGrants, setDraftGrants] = useState({});
  const [savedGrants, setSavedGrants] = useState({});
  const [expandedModules, setExpandedModules] = useState({});

  const [modalType, setModalType] = useState(null); // 'role' or 'permission'
  const [editingItem, setEditingItem] = useState(null);
  const [roleForm, setRoleForm] = useState({
    role_name: '',
    slug: ''
  });
  const [permForm, setPermForm] = useState({
    label: '',
    description: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, usersRes] = await Promise.all([
        apiClient.get('/roles', { params: { status: 'all' } }),
        apiClient.get('/users', { params: { limit: 500 } }),
      ]);
      if (rolesRes.data?.success) {
        setRoles(rolesRes.data.data.roles || []);
        setPermissions(rolesRes.data.data.permissions || []);
      }
      if (usersRes.data?.success) {
        setUsers(usersRes.data.data || []);
      }
    } catch (err) {
      showToast('Failed to load roles data.', 'error');
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeRoles = useMemo(
    () => roles.filter((r) => isActiveRoleStatus(r.status)),
    [roles]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && String(u.role?.slug || '') !== roleFilter) return false;
      if (!q) return true;
      const haystack = [
        formatRoleUserName(u),
        u.email,
        u.username,
        u.role?.name,
        u.branch?.name,
        u.status,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [users, userSearch, roleFilter]);

  const usersPagination = usePagination(filteredUsers, {
    resetKey: `${userSearch}|${roleFilter}`,
  });
  const paginatedUsers = usersPagination.paginatedData;

  const applyMatrixPayload = useCallback((data) => {
    const grants = {};
    for (const perm of data.permissions || []) {
      grants[perm.permission_id] = Boolean(perm.granted);
    }
    setDraftGrants(grants);
    setSavedGrants(grants);
    setModules(data.modules || []);
    setPermLocked(Boolean(data.locked));
    setSelectedUserDetail(data.user || null);
    const expanded = {};
    for (const mod of data.modules || []) {
      expanded[mod.module] = true;
    }
    setExpandedModules(expanded);
  }, []);

  const loadUserPermissions = useCallback(async (userId) => {
    setPermLoading(true);
    try {
      const res = await apiClient.get(`/users/${userId}/permissions`);
      if (res.data?.success) {
        applyMatrixPayload(res.data.data);
      } else {
        showToast(res.data?.message || 'Failed to load user permissions.', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load user permissions.', 'error');
    }
    setPermLoading(false);
  }, [applyMatrixPayload, showToast]);

  const openUserPermissions = (user) => {
    setSelectedUserId(user.id);
    setTab('users');
    loadUserPermissions(user.id);
  };

  const backToUsers = () => {
    setSelectedUserId(null);
    setSelectedUserDetail(null);
    setModules([]);
    setDraftGrants({});
    setSavedGrants({});
    setPermLocked(false);
  };

  const isDirty = useMemo(() => {
    const keys = new Set([
      ...Object.keys(draftGrants),
      ...Object.keys(savedGrants),
    ]);
    for (const key of keys) {
      if (Boolean(draftGrants[key]) !== Boolean(savedGrants[key])) return true;
    }
    return false;
  }, [draftGrants, savedGrants]);

  const togglePermission = (permissionId, value, code) => {
    if (permLocked) return;
    setDraftGrants((prev) => {
      const next = {
        ...prev,
        [permissionId]: value,
      };
      // Manage / action grants imply View for that module.
      if (value && code && MANAGE_IMPLIES_VIEW[code]) {
        const viewCode = MANAGE_IMPLIES_VIEW[code];
        for (const mod of modules) {
          for (const perm of mod.permissions || []) {
            if (perm.code === viewCode) next[perm.permission_id] = true;
          }
        }
      }
      return next;
    });
  };

  const setModuleAll = (modulePerms, granted) => {
    if (permLocked) return;
    setDraftGrants((prev) => {
      const next = { ...prev };
      for (const perm of modulePerms) {
        next[perm.permission_id] = granted;
      }
      return next;
    });
  };

  const moduleState = (modulePerms) => {
    if (!modulePerms?.length) return { all: false, some: false };
    let allowed = 0;
    for (const perm of modulePerms) {
      if (draftGrants[perm.permission_id]) allowed += 1;
    }
    return {
      all: allowed === modulePerms.length,
      some: allowed > 0 && allowed < modulePerms.length,
    };
  };

  const saveUserPermissions = async () => {
    if (!selectedUserId || permLocked) return;
    setPermSaving(true);
    try {
      const res = await apiClient.put(`/users/${selectedUserId}/permissions`, {
        permissions: draftGrants,
      });
      if (res.data?.success) {
        applyMatrixPayload(res.data.data);
        showToast(res.data.message || 'Permissions saved.', 'success');
        const me = getCurrentUser();
        if (me && String(me.id) === String(selectedUserId)) {
          await refreshSessionPermissions();
          window.dispatchEvent(new Event('corvex-permissions-updated'));
        }
      } else {
        showToast(res.data?.message || 'Failed to save permissions.', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save permissions.', 'error');
    }
    setPermSaving(false);
  };

  const resetDraft = () => {
    setDraftGrants({ ...savedGrants });
    showToast('Unsaved changes discarded.', 'success');
  };

  // ROLES CRUD
  const openRoleModal = (role = null) => {
    setEditingItem(role);
    setRoleForm(role ? {
      role_name: role.name,
      slug: role.slug
    } : {
      role_name: '',
      slug: ''
    });
    setModalType('role');
  };
  const saveRole = async e => {
    e.preventDefault();
    try {
      if (editingItem) {
        await apiClient.put(`/roles/${editingItem.id}`, roleForm);
        showToast('Role updated.', 'success');
      } else {
        await apiClient.post('/roles', roleForm);
        showToast('Role created.', 'success');
      }
      setModalType(null);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save role.', 'error');
    }
  };
  const deleteRole = async role => {
    if (role.slug === 'super_admin') return showToast('Cannot archive Super Admin.', 'error');
    if (!window.confirm(`Archive role “${role.name}”? The role record is preserved. Active users must be reassigned first.`)) return;
    try {
      await apiClient.delete(`/roles/${role.id}`);
      showToast('Role archived.', 'success');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive role.', 'error');
    }
  };

  // PERMISSIONS CRUD
  const openPermModal = (perm = null) => {
    setEditingItem(perm);
    setPermForm(perm ? {
      label: perm.label,
      description: perm.description
    } : {
      label: '',
      description: ''
    });
    setModalType('permission');
  };
  const savePerm = async e => {
    e.preventDefault();
    try {
      if (editingItem) {
        await apiClient.put(`/permissions/${editingItem.permission_id}`, permForm);
        showToast('Permission updated.', 'success');
      } else {
        await apiClient.post('/permissions', permForm);
        showToast('Permission created.', 'success');
      }
      setModalType(null);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save permission.', 'error');
    }
  };
  const deletePerm = async perm => {
    if (!window.confirm(`Archive permission “${perm.label}”? The permission record is preserved.`)) return;
    try {
      await apiClient.delete(`/permissions/${perm.permission_id}`);
      showToast('Permission archived.', 'success');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive permission.', 'error');
    }
  };
  const pagination_roles = usePagination(roles);
  const paginated_roles = pagination_roles.paginatedData;
  const pagination_permissions = usePagination(permissions);
  const paginated_permissions = pagination_permissions.paginatedData;

  const displayUser = selectedUserDetail || users.find((u) => String(u.id) === String(selectedUserId)) || null;

  return <div className="page">
      <div className="rp-tabs" style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={tab === 'users' ? 'button' : 'button ghost'} type="button" onClick={() => setTab('users')}>Users & Access</button>
        <button className={tab === 'roles' ? 'button' : 'button ghost'} type="button" onClick={() => { setTab('roles'); backToUsers(); }}>Roles</button>
        <button className={tab === 'permissions' ? 'button' : 'button ghost'} type="button" onClick={() => { setTab('permissions'); backToUsers(); }}>Permissions</button>
      </div>

      {loading ? <LoadingState message="Loading roles & permissions..." /> : <>
          {tab === 'users' && !selectedUserId && <>
              <section className="panel content-panel relative overflow-hidden rp-users-panel">
                <div className="list-section-header">
                  <h3>Users &amp; Access</h3>
                  <p className="text-ink/70" style={{ margin: 0, fontSize: '0.88rem' }}>
                    Select a user to configure module and action permissions.
                  </p>
                </div>
                <div className="rp-matrix-toolbar" style={{ marginBottom: 16 }}>
                  <input
                    className="filter-input search rp-matrix-search"
                    type="search"
                    placeholder="Search name, email, role, branch…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    aria-label="Search users"
                  />
                  <select
                    className="filter-select rp-matrix-select"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    aria-label="Filter by role"
                  >
                    <option value="ALL">All Roles</option>
                    {activeRoles.map((r) => (
                      <option key={r.id} value={r.slug}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Branch</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.length ? paginatedUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={String(selectedUserId) === String(u.id) ? 'rp-user-row selected' : 'rp-user-row'}
                          onClick={() => openUserPermissions(u)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td><strong>{formatRoleUserName(u)}</strong></td>
                          <td>{u.role?.name || '—'}</td>
                          <td>{u.branch?.name || '—'}</td>
                          <td><StatusBadge status={u.status || 'Active'} /></td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="button"
                              type="button"
                              onClick={() => openUserPermissions(u)}
                            >
                              Permissions
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: 20 }}>
                            No users match these filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination {...usersPagination} />
              </section>
            </>}

          {tab === 'users' && selectedUserId ? <>
              <section className="panel content-panel relative overflow-hidden rp-user-perm-panel">
                <div className="rp-user-perm-header">
                  <button className="button ghost" type="button" onClick={backToUsers}>← Back to users</button>
                  <div className="rp-user-perm-actions">
                    {can('roles.assign') ? (
                      <>
                        <button className="button secondary" type="button" onClick={resetDraft} disabled={permLocked || permSaving || !isDirty}>Reset</button>
                        <button className="button" type="button" onClick={saveUserPermissions} disabled={permLocked || permSaving || !isDirty}>
                          {permSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {permLoading || !displayUser ? (
                  <LoadingState message="Loading user permissions..." />
                ) : (
                  <>
                    <div className="rp-user-info selected">
                      <h3 style={{ marginTop: 0 }}>User Information</h3>
                      <div className="rp-user-info-grid">
                        <div>
                          <span className="rp-user-info-label">Full Name</span>
                          <strong>{formatRoleUserName(displayUser)}</strong>
                        </div>
                        <div>
                          <span className="rp-user-info-label">Assigned Role</span>
                          <strong>{displayUser.role?.name || '—'}</strong>
                        </div>
                        <div>
                          <span className="rp-user-info-label">Assigned Branch</span>
                          <strong>{displayUser.branch?.name || '—'}</strong>
                        </div>
                        <div>
                          <span className="rp-user-info-label">Account Status</span>
                          <StatusBadge status={displayUser.status || 'Active'} />
                        </div>
                      </div>
                      {permLocked ? (
                        <p className="rp-user-perm-note">
                          Super Admin accounts always have full access. Their permissions cannot be modified.
                        </p>
                      ) : null}
                    </div>

                    <div className="rp-perm-modules">
                      <h3>Permissions</h3>
                      <p className="text-ink/70" style={{ marginTop: 0, marginBottom: 14, fontSize: '0.88rem' }}>
                        All CORVEX modules are listed. Checked actions are allowed for this user.
                        {!can('roles.assign') ? ' (read-only)' : ''}
                      </p>
                      {modules.length === 0 ? (
                        <div className="rp-matrix-empty" role="status">
                          <p>No module permissions are defined yet. Restart the API so the permission catalog can seed.</p>
                        </div>
                      ) : modules.map((mod) => {
                        const state = moduleState(mod.permissions);
                        const open = expandedModules[mod.module] !== false;
                        return (
                          <div key={mod.module} className="rp-perm-module">
                            <div className="rp-perm-module-header">
                              <button
                                className="rp-perm-module-toggle"
                                type="button"
                                aria-expanded={open}
                                onClick={() => setExpandedModules((prev) => ({
                                  ...prev,
                                  [mod.module]: !open,
                                }))}
                              >
                                <span className="rp-perm-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                                <strong>{mod.module}</strong>
                                <span className="rp-perm-count">
                                  {mod.permissions.filter((p) => draftGrants[p.permission_id]).length}/{mod.permissions.length}
                                </span>
                              </button>
                              <label className="rp-perm-module-all">
                                <input
                                  type="checkbox"
                                  checked={state.all}
                                  ref={(el) => {
                                    if (el) el.indeterminate = state.some;
                                  }}
                                  disabled={permLocked || !can('roles.assign')}
                                  onChange={(e) => setModuleAll(mod.permissions, e.target.checked)}
                                />
                                <span>Enable all</span>
                              </label>
                            </div>
                            {open ? (
                              <ul className="rp-perm-action-list">
                                {mod.permissions.map((perm) => (
                                  <li key={perm.permission_id} className="rp-perm-action-item">
                                    <label className="rp-perm-action-label">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(draftGrants[perm.permission_id])}
                                        disabled={permLocked || !can('roles.assign')}
                                        onChange={(e) => togglePermission(perm.permission_id, e.target.checked, perm.code)}
                                      />
                                      <span>
                                        <strong>{perm.label}</strong>
                                        <span className="rp-matrix-perm-desc">{perm.description}</span>
                                      </span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {can('roles.assign') ? (
                      <div className="rp-user-perm-footer">
                        <button className="button secondary" type="button" onClick={resetDraft} disabled={permLocked || permSaving || !isDirty}>Reset</button>
                        <button className="button" type="button" onClick={saveUserPermissions} disabled={permLocked || permSaving || !isDirty}>
                          {permSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    ) : (
                      <p className="rp-user-perm-note">You can view this matrix but do not have permission to assign changes.</p>
                    )}
                  </>
                )}
              </section>
            </> : null}

          {tab === 'roles' && <>
              <section className="panel content-panel relative overflow-hidden">
                <div className="list-section-header">
                  <h3>Roles</h3>
                  {can('roles.create') ? (
                    <button className="button" type="button" onClick={() => openRoleModal()}>Add Role</button>
                  ) : null}
                </div>
                <><div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead><tr><th>ID</th><th>Role Name</th><th>Slug</th><th>Status</th><th>Created At</th><th>Actions</th></tr></thead>
                    <tbody>
                      {paginated_roles.map(r => <tr key={r.id}>
                          <td>{r.id}</td>
                          <td><strong>{r.name}</strong></td>
                          <td><code>{r.slug}</code></td>
                          <td><StatusBadge status={r.status || 'Active'} /></td>
                          <td>{formatDisplayDateTime(r.created_at)}</td>
                          <td className="table-actions">
                            {can('roles.edit') ? (
                              <button className="icon-action-button" type="button" title="Edit" onClick={() => openRoleModal(r)}><NavIcon name="edit" /></button>
                            ) : null}
                            {can('roles.delete') && String(r.status || 'Active').toLowerCase() !== 'inactive' && r.slug !== 'super_admin' ? (
                              <button className="icon-action-button danger" type="button" title="Archive" onClick={() => deleteRole(r)}><NavIcon name="archive" /></button>
                            ) : null}
                          </td>
                        </tr>)}
                    </tbody>
                  </table>
                </div><Pagination {...pagination_roles} /></>
              </section>
            </>}

          {tab === 'permissions' && <>
              <section className="panel content-panel relative overflow-hidden">
                <div className="list-section-header">
                  <h3>Permissions</h3>
                  {can('roles.create') ? (
                    <button className="button" type="button" onClick={() => openPermModal()}>Add Permission</button>
                  ) : null}
                </div>
                <><div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead><tr><th>ID</th><th>Label</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {paginated_permissions.map(p => <tr key={p.permission_id}>
                          <td>{p.permission_id}</td>
                          <td><strong>{p.label}</strong></td>
                          <td>{p.description}</td>
                          <td><StatusBadge status={p.status || 'Active'} /></td>
                          <td className="table-actions">
                            {can('roles.edit') ? (
                              <button className="icon-action-button" type="button" title="Edit" onClick={() => openPermModal(p)}><NavIcon name="edit" /></button>
                            ) : null}
                            {can('roles.delete') && String(p.status || 'Active').toLowerCase() !== 'inactive' ? (
                              <button className="icon-action-button danger" type="button" title="Archive" onClick={() => deletePerm(p)}><NavIcon name="archive" /></button>
                            ) : null}
                          </td>
                        </tr>)}
                    </tbody>
                  </table>
                </div><Pagination {...pagination_permissions} /></>
              </section>
            </>}
        </>}

      {modalType === 'role' && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
          <div className="panel form-panel" style={{
        width: '100%',
        maxWidth: 500,
        background: '#fff'
      }}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <h3>{editingItem ? 'Edit Role' : 'Create Role'}</h3>
            </div>
            <form onSubmit={saveRole} style={{
          padding: '0 20px 20px'
        }}>
              <div className="form-group"><label>Role Name</label><input required value={roleForm.role_name} onChange={e => setRoleForm({
              ...roleForm,
              role_name: e.target.value
            })} /></div>
              <div className="form-group"><label>Slug</label><input required value={roleForm.slug} disabled={editingItem?.slug === 'super_admin'} onChange={e => setRoleForm({
              ...roleForm,
              slug: e.target.value
            })} /></div>
              <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 16
          }}>
                <button className="button secondary" type="button" onClick={() => setModalType(null)}>Cancel</button>
                <button className="button" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>}

      {modalType === 'permission' && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
          <div className="panel form-panel" style={{
        width: '100%',
        maxWidth: 500,
        background: '#fff'
      }}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <h3>{editingItem ? 'Edit Permission' : 'Create Permission'}</h3>
            </div>
            <form onSubmit={savePerm} style={{
          padding: '0 20px 20px'
        }}>
              <div className="form-group"><label>Label</label><input required value={permForm.label} onChange={e => setPermForm({
              ...permForm,
              label: e.target.value
            })} /></div>
              <div className="form-group"><label>Description</label><textarea required value={permForm.description} onChange={e => setPermForm({
              ...permForm,
              description: e.target.value
            })} style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #BADBE9',
              borderRadius: 8
            }} /></div>
              <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 16
          }}>
                <button className="button secondary" type="button" onClick={() => setModalType(null)}>Cancel</button>
                <button className="button" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// â”€â”€ System Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function asBool(value) {
  return value === true || value === 'true';
}
function formatBytes(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function SettingsPage({
  showToast
}) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setSettings(p => ({
    ...p,
    [k]: v
  }));
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsArea, setSettingsArea] = useState('company');
  useEffect(() => {
    let active = true;
    async function load() {
      const result = await fetchSystemSettings();
      if (!active) return;
      if (result.success) setSettings(result.data);
      else showToast(result.message || 'Failed to load settings.', 'error');
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [showToast]);
  const onLogo = (file) => {
    if (!file) return;
    if (file.size > 150000) {
      showToast('Logo must be smaller than 150 KB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('logoDataUrl', String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  const save = async () => {
    setSaving(true);
    const result = await saveSystemSettings({
      ...settings,
      smsEnabled: String(asBool(settings.smsEnabled)),
      otpEnabled: String(asBool(settings.otpEnabled)),
      notificationsEmail: String(asBool(settings.notificationsEmail)),
      notificationsSms: String(asBool(settings.notificationsSms)),
    });
    setSaving(false);
    if (result.success) {
      setSettings(result.data);
      showToast('Settings saved.', 'success');
    } else showToast(result.message || 'Failed to save settings.', 'error');
  };
  if (loading) return <LoadingState message="Loading settings..." />;
  if (!settings) return <EmptyState title="Settings unavailable" description="Company settings could not be loaded." />;
  return <div className="page settings-system">
      <div className="settings-tabs" role="tablist" aria-label="System settings">
        <button className={settingsArea === 'company' ? 'settings-tab active' : 'settings-tab'} type="button" role="tab" aria-selected={settingsArea === 'company'} onClick={() => setSettingsArea('company')}>Company</button>
        <button className={settingsArea === 'preferences' ? 'settings-tab active' : 'settings-tab'} type="button" role="tab" aria-selected={settingsArea === 'preferences'} onClick={() => setSettingsArea('preferences')}>Accessibility & display</button>
      </div>
      {settingsArea === 'preferences' ? <UserSettingsPanel role="personal" showToast={showToast} /> : null}
      {settingsArea === 'company' ? <>
      <fieldset disabled={!can('settings.update')} style={{ border: 0, margin: 0, padding: 0 }}>
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Company Information</h3></div>
        <div className="grid two-up">
          <div className="form-group"><label>Company Name</label><input value={settings.companyName} onChange={e => set('companyName', e.target.value)} /></div>
          <div className="form-group"><label>Company Email</label><input type="email" value={settings.companyEmail} onChange={e => set('companyEmail', e.target.value)} /></div>
          <div className="form-group"><label>Logo Upload</label><input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} />{settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="Company logo" style={{ marginTop: 8, maxHeight: 48 }} /> : null}</div>
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Integrations & API</h3></div>
        <div className="grid two-up">
          <div className="form-group"><label>Leaflet API Key</label><input value={settings.leafletApiKey} onChange={e => set('leafletApiKey', e.target.value)} /></div>
          <div className="form-group"><label>Backup Schedule</label><input value={settings.backupSchedule} onChange={e => set('backupSchedule', e.target.value)} /></div>
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Notification Settings</h3></div>
        <div className="settings-system-toggles">
          <label className="settings-switch"><span><strong>Email Notifications</strong></span><span className="settings-switch-control"><input type="checkbox" checked={asBool(settings.notificationsEmail)} onChange={e => set('notificationsEmail', String(e.target.checked))} /><span className="settings-switch-track" aria-hidden="true" /></span></label>
          <label className="settings-switch"><span><strong>SMS Notifications</strong></span><span className="settings-switch-control"><input type="checkbox" checked={asBool(settings.notificationsSms)} onChange={e => set('notificationsSms', String(e.target.checked))} /><span className="settings-switch-track" aria-hidden="true" /></span></label>
          <label className="settings-switch"><span><strong>SMS / OTP Enabled</strong></span><span className="settings-switch-control"><input type="checkbox" checked={asBool(settings.smsEnabled)} onChange={e => set('smsEnabled', String(e.target.checked))} /><span className="settings-switch-track" aria-hidden="true" /></span></label>
        </div>
      </section>
      </fieldset>

      {confirmReset && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)'
    }}>
          <p>Restore all settings to factory defaults? This cannot be undone.</p>
          <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 12
      }}>
            <button className="button danger" type="button" onClick={async () => {
          const result = await resetSystemSettings();
          if (result.success) {
            setSettings(result.data);
            showToast('Settings restored to defaults.', 'success');
          } else showToast(result.message || 'Failed to restore defaults.', 'error');
          setConfirmReset(false);
        }}>Confirm Reset</button>
            <button className="button secondary" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </section>}

      <div className="settings-system-footer">
        {can('settings.update') ? (
          <>
            <button className="button secondary" type="button" onClick={() => setConfirmReset(true)}>Restore Defaults</button>
            <button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
          </>
        ) : (
          <p className="text-ink/70" style={{ margin: 0, fontSize: '0.88rem' }}>View-only access. You cannot update system settings.</p>
        )}
      </div>
      </> : null}
    </div>;
}

// â”€â”€ Backup & Restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BackupPage({
  showToast
}) {
  const [backups, setBackups] = useState([]);
  const [schedule, setSchedule] = useState('Daily at 02:00 AM');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    const [backupRes, settingsRes] = await Promise.all([fetchSystemBackups(), fetchSystemSettings()]);
    if (backupRes.success) setBackups(backupRes.data || []);
    else showToast(backupRes.message || 'Failed to load backups.', 'error');
    if (settingsRes.success && settingsRes.data?.backupSchedule) setSchedule(settingsRes.data.backupSchedule);
    setLoading(false);
  }, [showToast]);
  useEffect(() => { load(); }, [load]);
  const pagination_BACKUP_HISTORY = usePagination(backups);
  const paginated_BACKUP_HISTORY = pagination_BACKUP_HISTORY.paginatedData;
  const createBackup = async () => {
    setCreating(true);
    const result = await createSystemBackup();
    setCreating(false);
    if (result.success) {
      showToast(result.message || 'Backup created.', 'success');
      load();
    } else showToast(result.message || 'Failed to create backup.', 'error');
  };
  const confirm = async () => {
    const result = await restoreSystemBackup(confirmRestore.backup_id);
    if (result.success) showToast(result.message || 'Settings restored from backup.', 'success');
    else showToast(result.message || 'Restore failed.', 'error');
    setConfirmRestore(null);
  };
  if (loading) return <LoadingState message="Loading backups..." />;
  return <div className="page">
      <Stats stats={[{
      label: 'Total Backups',
      value: String(backups.length)
    }, {
      label: 'Latest Backup',
      value: backups[0] ? formatDisplayDateTime(backups[0].created_at) : '—'
    }, {
      label: 'Latest Size',
      value: backups[0] ? formatBytes(backups[0].size_bytes) : '—'
    }, {
      label: 'Schedule',
      value: schedule
    }]} />

      {confirmRestore && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)'
    }}>
          <p><strong>Warning:</strong> Restoring the backup from <strong>{formatDisplayDateTime(confirmRestore.created_at)}</strong> replaces company settings with the saved values. Transactions, users, and payments are not overwritten.</p>
          <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 12
      }}>
            <button className="button danger" type="button" onClick={confirm}>Confirm Restore</button>
            <button className="button secondary" type="button" onClick={() => setConfirmRestore(null)}>Cancel</button>
          </div>
        </section>}

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Backup History</h3>
          {can('backup.create') ? (
            <button className="button" type="button" onClick={createBackup} disabled={creating}>{creating ? 'Creating…' : 'Create Manual Backup'}</button>
          ) : null}
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Type</th><th>Date</th><th>Size</th><th>Created By</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {paginated_BACKUP_HISTORY.length ? paginated_BACKUP_HISTORY.map(b => <tr key={b.backup_id}>
                  <td>{b.backup_type}</td><td>{formatDisplayDateTime(b.created_at)}</td><td>{formatBytes(b.size_bytes)}</td><td>{b.created_by_name || '—'}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="table-actions">
                    {can('backup.download') ? (
                      <button className="icon-action-button" type="button" title="Download" onClick={async () => {
                        const result = await downloadSystemBackup(b.backup_id, b.file_name);
                        if (result.success) showToast('Backup downloaded.', 'success');
                        else showToast(result.message || 'Download failed.', 'error');
                      }}><NavIcon name="download" /></button>
                    ) : null}
                    {can('backup.restore') ? (
                      <button className="icon-action-button" type="button" title="Restore" onClick={() => setConfirmRestore(b)}><NavIcon name="history" /></button>
                    ) : null}
                  </td>
                </tr>) : <tr><td colSpan="6">No backups yet. Create a manual backup to download company settings and catalog data.</td></tr>}
            </tbody>
          </table>
        </div><Pagination {...pagination_BACKUP_HISTORY} /></>
      </section>
    </div>;
}

// â”€â”€ Database & Server Monitoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MonitoringPage({
  showToast
}) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/dashboard/system-health');
      if (response.data.success) setHealth(response.data.data);
    } catch (err) {
      showToast('Could not load system health.', 'error');
    }
    setLoading(false);
  }, [showToast]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  if (loading && !health) return <LoadingState message="Loading system health..." />;
  const uptime = health?.processUptimeSeconds != null ? `${Math.floor(health.processUptimeSeconds / 3600)}h ${Math.floor(health.processUptimeSeconds % 3600 / 60)}m` : '—';
  return <div className="page">
      {can('monitoring.details') ? (
      <Toolbar actions={[{
      label: loading ? 'Refreshing…' : 'Refresh',
      action: 'refresh'
    }]} onAction={action => {
      if (action.action === 'refresh') refresh();
    }} />
      ) : null}

      <Stats stats={[{
      label: 'Database Status',
      value: health?.dbStatus || 'Unknown'
    }, {
      label: 'Memory Usage',
      value: health?.memoryUsage != null ? `${health.memoryUsage}%` : 'Not measured'
    }, {
      label: 'API Response',
      value: `${health?.apiResponseMs ?? 0} ms`
    }, {
      label: 'Active Users',
      value: String(health?.activeUsers ?? 0)
    }, {
      label: 'Process Uptime',
      value: uptime
    }, {
      label: 'Login Errors (24h)',
      value: String(health?.errorCount ?? 0)
    }]} />
    </div>;
}

function auditStatusLabel(log) {
  return String(log?.status || log?.status_details || log?.action || '—').trim() || '—';
}

function auditActivityLabel(log) {
  return String(log?.activity || log?.action || '—').trim() || '—';
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildAuditDetailRows(log) {
  if (!log) return [];
  const status = auditStatusLabel(log);
  const description = String(log.description || log.status_details || '').trim() || '—';
  return [
    { key: 'log_id', label: 'Log ID', value: log.log_id ?? '—' },
    { key: 'date', label: 'Date', value: formatDisplayDate(log.activity_date || log.created_at) },
    { key: 'timestamp', label: 'Timestamp', value: formatDisplayDateTime(log.created_at) },
    { key: 'user', label: 'User', value: log.user_name || (log.user_id ? `User #${log.user_id}` : 'System') },
    { key: 'role', label: 'Role', value: log.role_name || '—' },
    { key: 'module', label: 'Module', value: log.module || '—' },
    { key: 'activity', label: 'Activity', value: auditActivityLabel(log) },
    { key: 'status', label: 'Status', value: <StatusBadge status={status} /> },
    { key: 'description', label: 'Description', value: description },
    { key: 'ip', label: 'IP Address', value: log.ip_address || '—' },
  ];
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({
  showToast
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [viewingLog, setViewingLog] = useState(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const result = await fetchAuditLogs();
      if (!active) return;
      if (result.success) setLogs(result.data || []);
      else setError(result.message || 'Failed to load audit logs.');
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const userOptions = useMemo(() => uniqueSorted(logs.map((l) => l.user_name || (l.user_id ? `User #${l.user_id}` : ''))), [logs]);
  const roleOptions = useMemo(() => uniqueSorted(logs.map((l) => l.role_name)), [logs]);
  const moduleOptions = useMemo(() => uniqueSorted(logs.map((l) => l.module)), [logs]);
  const activityOptions = useMemo(() => uniqueSorted(logs.map((l) => auditActivityLabel(l))), [logs]);
  const statusOptions = useMemo(() => uniqueSorted(logs.map((l) => auditStatusLabel(l))), [logs]);

  const filtered = useMemo(() => logs.filter((log) => {
    const q = search.trim().toLowerCase();
    const userName = log.user_name || (log.user_id ? `User #${log.user_id}` : 'System');
    const status = auditStatusLabel(log);
    const activity = auditActivityLabel(log);
    if (userFilter !== 'all' && userName !== userFilter) return false;
    if (roleFilter !== 'all' && String(log.role_name || '') !== roleFilter) return false;
    if (moduleFilter !== 'all' && String(log.module || '') !== moduleFilter) return false;
    if (activityFilter !== 'all' && activity !== activityFilter) return false;
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (dateFilter) {
      const created = new Date(log.created_at);
      if (!Number.isFinite(created.getTime())) return false;
      const day = [
        created.getFullYear(),
        String(created.getMonth() + 1).padStart(2, '0'),
        String(created.getDate()).padStart(2, '0'),
      ].join('-');
      if (day !== dateFilter) return false;
    }
    if (q) {
      const haystack = [
        userName, log.role_name, log.module, activity, log.action, status,
        log.description, log.status_details, log.ip_address, log.affected_record,
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), [logs, search, userFilter, roleFilter, moduleFilter, activityFilter, statusFilter, dateFilter]);

  const pagination_AUDIT_LOGS = usePagination(filtered, {
    resetKey: `${search}|${userFilter}|${roleFilter}|${moduleFilter}|${activityFilter}|${statusFilter}|${dateFilter}`,
  });
  const paginated_AUDIT_LOGS = pagination_AUDIT_LOGS.paginatedData;
  const exportLogs = () => {
    const rows = filtered.map((log) => ({
      timestamp: formatDisplayDateTime(log.created_at),
      user: log.user_name || (log.user_id ? `User #${log.user_id}` : 'System'),
      role: log.role_name || '—',
      module: log.module || '—',
      activity: auditActivityLabel(log),
      status: auditStatusLabel(log),
      description: log.description || log.status_details || '—',
      ip_address: log.ip_address || '—',
    }));
    if (exportRows(rows, { format: 'pdf', filename: 'super-admin-audit-logs.pdf', title: 'Audit Logs' })) showToast('Logs exported as PDF.', 'success');
    else showToast('Nothing to export.', 'error');
  };
  if (loading) return <LoadingState message="Loading audit logs..." />;
  if (error) return <EmptyState title="Audit logs unavailable" description={error} />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>System Audit Log <span className="text-ink/70" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({filtered.length} entries)</span></h3>
        </div>
        <div className="list-section-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input className="filter-input search" type="search" placeholder="Search user, module, activity, status…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit logs" />
            <select className="filter-select" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="Filter by user">
              <option value="all">All Users</option>
              {userOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="all">All Roles</option>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className="filter-select" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} aria-label="Filter by module">
              <option value="all">All Modules</option>
              {moduleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="filter-select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Filter by activity">
              <option value="all">All Activities</option>
              {activityOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All Statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="filter-input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" />
            <button className="button" type="button" onClick={exportLogs}>Export PDF</button>
          </div>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Role</th>
                <th>Module</th>
                <th>Activity</th>
                <th>IP Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated_AUDIT_LOGS.length ? paginated_AUDIT_LOGS.map((l) => (
                <tr key={l.log_id}>
                  <td>{formatDisplayDateTime(l.created_at)}</td>
                  <td>{l.user_name || (l.user_id ? `User #${l.user_id}` : 'System')}</td>
                  <td>{l.role_name || '—'}</td>
                  <td>{l.module || '—'}</td>
                  <td>{auditActivityLabel(l)}</td>
                  <td>{l.ip_address || '—'}</td>
                  <td>
                    {can('audit.details') ? (
                      <button
                        className="icon-action-button"
                        type="button"
                        title="View"
                        aria-label={`View audit log ${l.log_id}`}
                        onClick={() => setViewingLog(l)}
                      >
                        <NavIcon name="view" />
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              )) : <tr><td colSpan="7">No audit logs match these filters.</td></tr>}
            </tbody>
          </table>
        </div><Pagination {...pagination_AUDIT_LOGS} /></>
      </section>
      {viewingLog ? <div className="modal-overlay" onClick={() => setViewingLog(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 560 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-log-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="audit-log-view-title" style={{ marginTop: 0 }}>Audit Log Details</h3>
            <p className="text-ink/70" style={{ margin: '0 0 16px', fontSize: '0.88rem' }}>
              Full record of the selected system activity.
            </p>
            <DetailRowsTable rows={buildAuditDetailRows(viewingLog)} />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button secondary" type="button" onClick={() => setViewingLog(null)}>
                Close
              </button>
            </div>
          </div>
        </div> : null}
    </div>;
}
function ProfilePage({
  showToast
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Super admin profile"
    subtitle="Your name, contact details, and sign-in for this CORVEX account."
    settingsRole="personal"
  />;
}

// â”€â”€ Users Management (API-Backed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UsersPage({
  showToast
}) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    role_id: '',
    branch_id: '',
    contact_number: '',
    employee_id: '',
    status: 'Active'
  });
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, bRes] = await Promise.allSettled([
        apiClient.get('/users?limit=100'),
        apiClient.get('/roles'),
        apiClient.get('/dashboard/branches'),
      ]);
      if (uRes.status === 'fulfilled' && uRes.value.data?.success) {
        setUsers(uRes.value.data.data || []);
      }
      if (rRes.status === 'fulfilled' && rRes.value.data?.success) {
        setRoles(rRes.value.data.data.roles || []);
      }
      if (bRes.status === 'fulfilled' && bRes.value.data?.success) {
        setBranches(bRes.value.data.data || []);
      }
      if (uRes.status === 'rejected' || rRes.status === 'rejected' || bRes.status === 'rejected') {
        showToast('Some user admin data failed to load. Restart the API on port 5000 if this persists.', 'error');
      }
    } catch (err) {
      showToast('Failed to load users data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const openAdd = () => {
    setEditingUser(null);
    setFormData({
      first_name: '',
      middle_name: '',
      last_name: '',
      username: '',
      email: '',
      password: '',
      role_id: '',
      branch_id: '',
      contact_number: '',
      employee_id: '',
      status: 'Active'
    });
    setShowModal(true);
  };
  const openEdit = u => {
    setEditingUser(u);
    setFormData({
      first_name: u.first_name || (u.fullName ? u.fullName.split(' ')[0] : ''),
      middle_name: u.middle_name || '',
      last_name: u.last_name || (u.fullName && u.fullName.split(' ').length > 1 ? u.fullName.split(' ').slice(1).join(' ') : ''),
      username: u.username || '',
      email: u.email,
      password: '',
      role_id: u.role_id || u.role?.id || '',
      branch_id: u.branch_id || u.branch?.id || '',
      contact_number: u.contactNumber || u.contact_number || '',
      employee_id: u.employeeId || u.employee_id || '',
      status: u.status
    });
    setShowModal(true);
  };
  const handleSave = async e => {
    e.preventDefault();
    try {
      if (editingUser) {
        // password is optional on edit
        const payload = {
          ...formData
        };
        if (!payload.password) delete payload.password;
        await apiClient.put(`/users/${editingUser.id}`, payload);
        showToast('User updated successfully.', 'success');
      } else {
        await apiClient.post('/users', formData);
        showToast('User created successfully.', 'success');
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save user.', 'error');
    }
  };
  const deactivateUser = async id => {
    if (!window.confirm('Disable this user? They will lose system access. Their record is preserved and can be re-enabled later.')) return;
    try {
      await apiClient.delete(`/users/${id}`);
      showToast('User disabled.', 'success');
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to disable user.', 'error');
    }
  };
  const pagination_users = usePagination(users);
  const paginated_users = pagination_users.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>User Directory</h3>
          {can('users.create') ? (
            <button className="button" type="button" onClick={openAdd}>Add User</button>
          ) : null}
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr><th>Name</th><th>Middle Name</th><th>Email / Username</th><th>Role</th><th>Branch</th><th>Last Login</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8" style={{
                  textAlign: 'center',
                  padding: '20px'
                }}>Loading...</td></tr> : users.length === 0 ? <tr><td colSpan="8" style={{
                  textAlign: 'center',
                  padding: '20px'
                }}>No users found.</td></tr> : paginated_users.map(u => <tr key={u.id}>
                    <td>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}>
                        <span style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "#0B1E30",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      flexShrink: 0
                    }}>
                          {u.avatarInitials || (u.first_name ? u.first_name[0] : (u.fullName || "?").charAt(0)).toUpperCase()}
                        </span>
                        <div>
                          <strong>{u.first_name} {u.last_name}</strong>
                          <br /><span className="text-ink/70" style={{
                        fontSize: "0.75rem"
                      }}>{u.employeeId || u.employee_id || "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td>{u.middle_name || '—'}</td>
                    <td>{u.email}<br /><span className="text-ink/70" style={{
                    fontSize: "0.75rem"
                  }}>@{u.username || '—'}</span></td>
                    <td>{u.role?.name}</td>
                    <td>{u.branch?.name || "—"}</td>
                    <td className="text-ink/70" style={{
                  fontSize: "0.82rem"
                }}>
                      {u.lastLogin ? formatDisplayDateTime(u.lastLogin) : "Never"}
                    </td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="table-actions">
                      {can('users.edit', 'users.activate') ? (
                        <button className="icon-action-button" type="button" title="Edit" onClick={() => openEdit(u)}><NavIcon name="edit" /></button>
                      ) : null}
                      {can('users.disable', 'users.activate') ? (
                        <button className="icon-action-button danger" type="button" title="Disable" onClick={() => deactivateUser(u.id)}><NavIcon name="ban" /></button>
                      ) : null}
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </div><Pagination {...pagination_users} /></>
      </section>

      {showModal && <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
          <div className="panel form-panel" style={{
        width: '100%',
        maxWidth: 600,
        background: '#fff',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <h3>{editingUser ? 'Edit User' : 'Create User'}</h3>
            </div>
            <form onSubmit={handleSave} style={{
          padding: '0 20px 20px'
        }}>
              <div className="grid two-up" style={{
            marginBottom: 16
          }}>
                <div className="form-group"><label>First Name</label><input required value={formData.first_name} onChange={e => setFormData({
                ...formData,
                first_name: e.target.value
              })} /></div>
                <div className="form-group"><label>Middle Name</label><input value={formData.middle_name} onChange={e => setFormData({
                ...formData,
                middle_name: e.target.value
              })} placeholder="(Optional)" /></div>
                <div className="form-group"><label>Last Name</label><input required value={formData.last_name} onChange={e => setFormData({
                ...formData,
                last_name: e.target.value
              })} /></div>
                <div className="form-group"><label>Username</label><input required value={formData.username} onChange={e => setFormData({
                ...formData,
                username: e.target.value
              })} /></div>
                <div className="form-group"><label>Email</label><input required type="email" value={formData.email} onChange={e => setFormData({
                ...formData,
                email: e.target.value
              })} /></div>
                <div className="form-group">
                  <label>Password {editingUser && <span className="text-ink/70">(leave blank to keep)</span>}</label>
                  <input type="password" required={!editingUser} value={formData.password} onChange={e => setFormData({
                ...formData,
                password: e.target.value
              })} />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select required value={formData.role_id} onChange={e => setFormData({
                ...formData,
                role_id: e.target.value
              })}>
                    <option value="">Select Role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Branch <span className="text-ink/70">(optional)</span></label>
                  <select value={formData.branch_id} onChange={e => setFormData({
                ...formData,
                branch_id: e.target.value
              })}>
                    <option value="">No Branch (Head Office)</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name || b.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Employee ID</label><input value={formData.employee_id} onChange={e => setFormData({
                ...formData,
                employee_id: e.target.value
              })} /></div>
                <div className="form-group"><label>Contact Number</label><input value={formData.contact_number} onChange={e => setFormData({
                ...formData,
                contact_number: e.target.value
              })} /></div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={formData.status} onChange={e => setFormData({
                ...formData,
                status: e.target.value
              })}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end'
          }}>
                <button className="button secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="button" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// ── Security Monitoring (auto-updating dashboard for background detectors) ──
function SecurityMonitoringPage({ showToast }) {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [sweeping, setSweeping] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const params = { limit: 40 };
    if (severityFilter !== 'ALL') params.severity = severityFilter;
    if (statusFilter !== 'ALL') params.status = statusFilter;

    const [sumRes, evtRes] = await Promise.all([
      fetchSecuritySummary(),
      fetchSecurityEvents(params),
    ]);
    if (sumRes.success) setSummary(sumRes.data);
    else if (!silent) showToast(sumRes.message || 'Failed to load security summary.', 'error');
    if (evtRes.success) setEvents(evtRes.data || []);
    else if (!silent) showToast(evtRes.message || 'Failed to load security events.', 'error');
    setLastRefreshed(new Date());
    if (!silent) setLoading(false);
  }, [severityFilter, statusFilter, showToast]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ silent: true }), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const onStatusChange = async (eventId, status) => {
    const result = await updateSecurityEventStatus(eventId, status);
    if (result.success) {
      showToast(`Event marked ${status}.`, 'success');
      load({ silent: true });
    } else {
      showToast(result.message || 'Update failed.', 'error');
    }
  };

  const onSweep = async () => {
    setSweeping(true);
    const result = await runSecuritySweep();
    setSweeping(false);
    if (result.success) {
      showToast(result.message || 'Security sweep completed.', 'success');
      load({ silent: true });
    } else {
      showToast(result.message || 'Sweep failed.', 'error');
    }
  };

  const mapEventExportRow = (e) => ({
    event_id: e.event_id,
    detected_at: e.created_at ? formatDisplayDateTime(e.created_at) : '',
    threat_type: e.threat_type || '',
    severity: e.severity || '',
    status: e.status || '',
    title: e.title || '',
    description: e.description || '',
    detection_method: e.detection_method || '',
    source_ip: e.source_ip || '',
    user: e.user_name || (e.user_id ? `User #${e.user_id}` : ''),
    affected_resource: e.affected_resource || '',
    auto_action: e.auto_action || '',
  });

  const exportSecurityResults = () => {
    const rows = events.map(mapEventExportRow);
    const filterLabel = [
      severityFilter !== 'ALL' ? `Severity: ${severityFilter}` : null,
      statusFilter !== 'ALL' ? `Status: ${statusFilter}` : null,
    ].filter(Boolean).join(' · ') || 'All events';

    if (exportRows(rows, {
      format: 'pdf',
      filename: 'corvex-security-results.pdf',
      title: 'Security Monitoring Results',
      subtitle: filterLabel,
    })) {
      showToast('Security results exported as PDF.', 'success');
    } else {
      showToast('Nothing to export.', 'error');
    }
  };

  const exportSingleEventResult = (event) => {
    if (!event) return;
    const rows = [mapEventExportRow(event)];
    const ok = exportRows(rows, {
      format: 'pdf',
      filename: `corvex-security-event-${event.event_id}.pdf`,
      title: 'Security Event Result',
      subtitle: `${event.threat_type || 'Threat'} · ${event.severity || ''} · ${event.status || ''}`,
    });
    if (ok) showToast('Event result exported as PDF.', 'success');
    else showToast('Nothing to export.', 'error');
  };

  const totals = summary?.totals || {};
  const health = summary?.health || [];
  const monitorOverall = summary?.monitorOverall || 'Unavailable';
  const pagination_events = usePagination(events, 8);
  const paginated_events = pagination_events.paginatedData;

  if (loading && !summary) return <LoadingState message="Loading security monitoring..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3 style={{ margin: 0 }}>Automatic Security Monitoring</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Background detectors run continuously on the API server — no manual scan required.
              {lastRefreshed ? ` Last refreshed ${formatDisplayDateTime(lastRefreshed)}.` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`rp-pill`} title="Monitor health">
              Monitor: {monitorOverall}
            </span>
            <button className="button secondary" type="button" onClick={() => load()} disabled={loading}>
              Refresh
            </button>
            {can('security.manage') ? (
              <button className="button" type="button" onClick={onSweep} disabled={sweeping}>
                {sweeping ? 'Running…' : 'Run Detectors Now'}
              </button>
            ) : null}
          </div>
        </div>

        <Stats stats={[
          { label: 'Open Incidents', value: String(totals.open_count ?? 0) },
          { label: 'Critical Open', value: String(totals.critical_open ?? 0) },
          { label: 'High Open', value: String(totals.high_open ?? 0) },
          { label: 'Events (24h)', value: String(totals.last_24h ?? 0) },
          { label: 'Active Sensors', value: `${summary?.monitorActiveComponents ?? 0}/${summary?.monitorComponentCount ?? 0}` },
          { label: 'Urgent Open', value: String(summary?.urgentOpen ?? 0) },
        ]} />
      </section>

      <div className="grid two-up" style={{ gap: 14, marginTop: 14 }}>
        <section className="panel content-panel">
          <div className="list-section-header">
            <h3>Monitoring Health</h3>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Status</th>
                  <th>Last Run</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {health.length ? health.map((h) => (
                  <tr key={h.component}>
                    <td><strong>{String(h.component).replace(/_/g, ' ')}</strong></td>
                    <td><StatusBadge status={h.status} /></td>
                    <td>{h.last_run_at ? formatDisplayDateTime(h.last_run_at) : '—'}</td>
                    <td title={h.detail || ''}>{h.detail || '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>No health data yet. Ensure the API server is running.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel content-panel">
          <div className="list-section-header">
            <h3>Recent Detections</h3>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Threat</th>
                  <th>Severity</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.recent || []).length ? summary.recent.map((e) => (
                  <tr key={e.event_id}>
                    <td>{formatDisplayDateTime(e.created_at)}</td>
                    <td>{e.threat_type}</td>
                    <td><StatusBadge status={e.severity} /></td>
                    <td title={e.title}>{e.title}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4}>No security events recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel content-panel" style={{ marginTop: 14 }}>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar sec-event-log-toolbar">
          <h3 className="sec-event-log-title">Security Event Log</h3>
          <div className="list-section-controls audit-logs-filters sec-event-log-filters">
            <select
              className="filter-select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filter severity"
            >
              <option value="ALL">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter status"
            >
              <option value="ALL">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Resolved">Resolved</option>
              <option value="False Positive">False Positive</option>
            </select>
            <button
              className="button"
              type="button"
              onClick={exportSecurityResults}
              disabled={!events.length}
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Detected</th>
                <th>Threat Type</th>
                <th>Severity</th>
                <th>Title / Evidence</th>
                <th>Source</th>
                <th>Auto Action</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated_events.length ? paginated_events.map((e) => (
                <tr key={e.event_id}>
                  <td>{formatDisplayDateTime(e.created_at)}</td>
                  <td>{e.threat_type}</td>
                  <td><StatusBadge status={e.severity} /></td>
                  <td>
                    <strong>{e.title}</strong>
                    <div style={{ fontSize: '0.78rem', color: textMuted, marginTop: 2 }}>
                      {e.detection_method}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: textMuted }} title={e.description}>
                      {String(e.description || '').slice(0, 120)}{String(e.description || '').length > 120 ? '…' : ''}
                    </div>
                  </td>
                  <td>
                    {e.source_ip || '—'}
                    {e.user_name ? <div style={{ fontSize: '0.75rem', color: textMuted }}>{e.user_name}</div> : null}
                  </td>
                  <td>{e.auto_action || '—'}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="table-actions">
                    {can('security.manage') && e.status === 'Open' ? (
                      <button className="button ghost" type="button" onClick={() => onStatusChange(e.event_id, 'Investigating')}>Investigate</button>
                    ) : null}
                    {can('security.manage') && (e.status === 'Open' || e.status === 'Investigating') ? (
                      <button className="button ghost" type="button" onClick={() => onStatusChange(e.event_id, 'Resolved')}>Resolve</button>
                    ) : null}
                    {can('security.manage') && e.status !== 'False Positive' ? (
                      <button className="button ghost" type="button" onClick={() => onStatusChange(e.event_id, 'False Positive')}>False Positive</button>
                    ) : null}
                    {can('security.events', 'security.view') ? (
                      <button
                        className="button ghost"
                        type="button"
                        title="Export this result as PDF"
                        onClick={() => exportSingleEventResult(e)}
                      >
                        Export PDF
                      </button>
                    ) : null}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8}>No events match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination_events} />
      </section>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export function SuperAdminPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to navigate." />;
  const p = {
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...p} />;
    case 'users':
      return <UsersPage {...p} />;
    case 'roles':
      return <RolesPage {...p} />;
    case 'settings':
      return <SettingsPage {...p} />;
    case 'backup':
      return <BackupPage {...p} />;
    case 'monitoring':
      return <MonitoringPage {...p} />;
    case 'security':
      return <SecurityMonitoringPage {...p} />;
    case 'auditLogs':
      return <AuditLogsPage {...p} />;
    case 'notifications':
      return (
        <NotificationsInbox
          navigate={navigate}
          showToast={showToast}
          canManage={can('notifications.manage')}
        />
      );
    case 'profile':
      return <ProfilePage {...p} />;
    default:
      return <EmptyState title="Page not found" />;
  }
}