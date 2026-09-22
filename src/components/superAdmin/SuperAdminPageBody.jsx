import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';
import { AUDIT_LOGS, BACKUP_HISTORY, SYSTEM_SETTINGS, SUPER_ADMIN_PROFILE } from '../../data/adminMockData';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import { StatusBadge } from '../StatusBadge';
import { formatDisplayDateTime } from '../../utils/formatters.js';
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
function MetricBar({
  label,
  value,
  max = 100,
  color = '#093850'
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
        color: '#64748b'
      }}>{value}{max === 100 ? '%' : ' ms'}</span>
      </div>
      <div style={{
      height: 8,
      background: '#f1f5f9',
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
  const pagination_userStats_byRole = usePagination(userStats.byRole);
  const paginated_userStats_byRole = pagination_userStats_byRole.paginatedData;
  const pagination_branches = usePagination(branches);
  const paginated_branches = pagination_branches.paginatedData;
  const pagination_auditLogs = usePagination(auditLogs);
  const paginated_auditLogs = pagination_auditLogs.paginatedData;
  if (loading) return <LoadingState message="Loading system dashboard..." />;
  const dbColor = health?.dbStatus === 'Online' ? '#059669' : '#dc2626';
  return <div className="relative z-10 grid gap-[22px] w-full">
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
                  color: '#059669'
                }}>{r.active}</td>
                    <td style={{
                  color: '#dc2626'
                }}>{r.inactive}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_userStats_byRole} /></>
        </Card> : null}

      {/* Branch directory â€” from branches table with full fields */}
      {branches.length ? <Card title="Branch Directory" sub="Source: branches table â€” branch_id, branch_name, address, latitude, longitude, contact_no, email, status, created_at">
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
                    <td>{b.contact_no}</td>
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
          {health?.memoryUsage != null ? <MetricBar label="Memory Usage" value={health.memoryUsage} color="#8b5cf6" /> : null}
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

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Quick Access</h3></div>
        <div className="quick-link-grid">
          {[{
          label: 'System Settings',
          to: '/super-admin/settings',
          icon: 'form'
        }, {
          label: 'User Management',
          to: '/super-admin/users',
          icon: 'accounts'
        }, {
          label: 'Role & Permissions',
          to: '/super-admin/roles',
          icon: 'accounts'
        }, {
          label: 'Backup & Restore',
          to: '/super-admin/backup',
          icon: 'history'
        }, {
          label: 'Database Monitoring',
          to: '/super-admin/monitoring',
          icon: 'reports'
        }, {
          label: 'Audit Logs',
          to: '/super-admin/audit-logs',
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
              <span className="quick-link-arrow">â†’</span>
            </button>)}
        </div>
      </section>
    </div>;
}

// â”€â”€ Role & Permission Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ──────────────────────────────────────────────────────────────────────────────
// Role & Permission Management
// ──────────────────────────────────────────────────────────────────────────────
function RolesPage({
  showToast
}) {
  const [tab, setTab] = useState('matrix'); // matrix, roles, permissions
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]); // Array of role objects with permissions object

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
      const res = await apiClient.get('/roles');
      if (res.data.success) {
        setRolePermissions(res.data.data.roles);
        setRoles(res.data.data.roles); // roles table view
        setPermissions(res.data.data.permissions); // permissions table view
      }
    } catch (err) {
      showToast('Failed to load roles data.', 'error');
    }
    setLoading(false);
  }, [showToast]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // MATRIX 
  const togglePermission = (roleIndex, permId) => {
    const role = rolePermissions[roleIndex];
    if (role.slug === 'super_admin') return;
    setRolePermissions(prev => prev.map((r, i) => {
      if (i === roleIndex) {
        return {
          ...r,
          permissions: {
            ...r.permissions,
            [permId]: !r.permissions[permId]
          }
        };
      }
      return r;
    }));
  };
  const savePermissions = async () => {
    try {
      // Find what changed? Actually, just saving the current state for all roles (or only changed ones, but let's just do all or find a way)
      // For simplicity, we might just save all, but API endpoint /api/roles/:id/permissions handles one role at a time.
      for (const role of rolePermissions) {
        if (role.slug === 'super_admin') continue;
        await apiClient.put(`/roles/${role.id}/permissions`, {
          permissions: role.permissions
        });
      }
      showToast('Permissions saved successfully.', 'success');
      fetchData();
    } catch (err) {
      showToast('Failed to save permissions.', 'error');
    }
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
    if (role.slug === 'super_admin') return showToast('Cannot archive super admin.', 'error');
    if (!window.confirm(`Archive role ${role.name}?`)) return;
    try {
      await apiClient.delete(`/roles/${role.id}`);
      showToast('Role archived.', 'success');
      fetchData();
    } catch (err) {
      showToast('Failed to archive role.', 'error');
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
    if (!window.confirm(`Archive permission ${perm.label}?`)) return;
    try {
      await apiClient.delete(`/permissions/${perm.permission_id}`);
      showToast('Permission archived.', 'success');
      fetchData();
    } catch (err) {
      showToast('Failed to archive permission.', 'error');
    }
  };
  const pagination_roles = usePagination(roles);
  const paginated_roles = pagination_roles.paginatedData;
  const pagination_permissions = usePagination(permissions);
  const paginated_permissions = pagination_permissions.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <div style={{
      display: 'flex',
      gap: 10,
      marginBottom: 20
    }}>
        <button className={tab === 'matrix' ? 'button' : 'button ghost'} onClick={() => setTab('matrix')}>Matrix</button>
        <button className={tab === 'roles' ? 'button' : 'button ghost'} onClick={() => setTab('roles')}>Roles</button>
        <button className={tab === 'permissions' ? 'button' : 'button ghost'} onClick={() => setTab('permissions')}>Permissions</button>
      </div>

      {loading ? <LoadingState message="Loading roles & permissions..." /> : <>
          {tab === 'matrix' && <>
              <section className="panel content-panel relative overflow-hidden" style={{
          overflowX: 'auto'
        }}>
                <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
                  <div>
                    <h3>Role Permission Matrix</h3>
                    <p className="text-ink/70" style={{
                margin: '2px 0 0',
                fontSize: '0.85rem'
              }}>Super Admin row is read-only.</p>
                  </div>
                  <button className="button" type="button" onClick={savePermissions}>Save Permissions</button>
                </div>
                <table className="corvex-table" style={{
            minWidth: 720
          }}>
                  <thead>
                    <tr>
                      <th>Role</th>
                      {permissions.map(p => <th key={p.permission_id} title={p.description}>{p.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rolePermissions.map((r, roleIdx) => <tr key={r.id}>
                        <td><strong>{r.name}</strong></td>
                        {permissions.map(p => <td key={p.permission_id} style={{
                  textAlign: 'center'
                }}>
                            <input type="checkbox" checked={r.permissions[p.permission_id] || false} disabled={r.slug === 'super_admin'} onChange={() => togglePermission(roleIdx, p.permission_id)} style={{
                    width: 16,
                    height: 16,
                    accentColor: '#093850',
                    cursor: r.slug === 'super_admin' ? 'not-allowed' : 'pointer'
                  }} />
                          </td>)}
                      </tr>)}
                  </tbody>
                </table>
              </section>
            </>}

          {tab === 'roles' && <>
              <section className="panel content-panel relative overflow-hidden">
                <div className="list-section-header">
                  <h3>Roles</h3>
                  <button className="button" type="button" onClick={() => openRoleModal()}>Add Role</button>
                </div>
                <><div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead><tr><th>ID</th><th>Role Name</th><th>Slug</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr></thead>
                    <tbody>
                      {paginated_roles.map(r => <tr key={r.id}>
                          <td>{r.id}</td>
                          <td><strong>{r.name}</strong></td>
                          <td><code>{r.slug}</code></td>
                          <td>{formatDisplayDateTime(r.created_at)}</td>
                          <td>{formatDisplayDateTime(r.updated_at)}</td>
                          <td className="table-actions">
                            <button className="icon-action-button" title="Edit" onClick={() => openRoleModal(r)}><NavIcon name="edit" /></button>
                            <button className="icon-action-button danger" title="Archive" disabled={r.slug === 'super_admin'} onClick={() => deleteRole(r)}><NavIcon name="archive" /></button>
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
                  <button className="button" type="button" onClick={() => openPermModal()}>Add Permission</button>
                </div>
                <><div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead><tr><th>ID</th><th>Label</th><th>Description</th><th>Created At</th><th>Updated At</th><th>Actions</th></tr></thead>
                    <tbody>
                      {paginated_permissions.map(p => <tr key={p.permission_id}>
                          <td>{p.permission_id}</td>
                          <td><strong>{p.label}</strong></td>
                          <td>{p.description}</td>
                          <td>{formatDisplayDateTime(p.created_at)}</td>
                          <td>{p.updated_at ? formatDisplayDateTime(p.updated_at) : '—'}</td>
                          <td className="table-actions">
                            <button className="icon-action-button" title="Edit" onClick={() => openPermModal(p)}><NavIcon name="edit" /></button>
                            <button className="icon-action-button danger" title="Archive" onClick={() => deletePerm(p)}><NavIcon name="archive" /></button>
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
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setModalType(null)}>Cancel</button>
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="submit">Save</button>
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
              border: '1px solid #cbd5e1',
              borderRadius: 8
            }} /></div>
              <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 16
          }}>
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setModalType(null)}>Cancel</button>
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// â”€â”€ System Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SettingsPage({
  showToast
}) {
  const [settings, setSettings] = useState({
    ...SYSTEM_SETTINGS
  });
  const set = (k, v) => setSettings(p => ({
    ...p,
    [k]: v
  }));
  const [confirmReset, setConfirmReset] = useState(false);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Company Information</h3></div>
        <div className="grid two-up">
          <div className="form-group"><label>Company Name</label><input value={settings.companyName} onChange={e => set('companyName', e.target.value)} /></div>
          <div className="form-group"><label>Company Email</label><input type="email" value={settings.companyEmail} onChange={e => set('companyEmail', e.target.value)} /></div>
          <div className="form-group"><label>Logo Upload</label><input type="file" accept="image/*" /></div>
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
        <div style={{
        display: 'flex',
        gap: 24
      }}>
          <label className="toggle-label"><input type="checkbox" checked={settings.notificationsEmail} onChange={e => set('notificationsEmail', e.target.checked)} />Email Notifications</label>
          <label className="toggle-label"><input type="checkbox" checked={settings.notificationsSms} onChange={e => set('notificationsSms', e.target.checked)} />SMS Notifications</label>
          <label className="toggle-label"><input type="checkbox" checked={settings.smsEnabled} onChange={e => set('smsEnabled', e.target.checked)} />SMS / OTP Enabled</label>
        </div>
      </section>

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
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" style={{
          background: '#dc2626'
        }} onClick={() => {
          showToast('Settings restored to defaults.', 'success');
          setSettings({
            ...SYSTEM_SETTINGS
          });
          setConfirmReset(false);
        }}>Confirm Reset</button>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </section>}

      <div className="flex justify-end gap-2 mt-2">
        <button className="button secondary" type="button" onClick={() => setConfirmReset(true)}>Restore Defaults</button>
        <button className="button" type="button" onClick={() => showToast('Settings saved.', 'success')}>Save Settings</button>
      </div>
    </div>;
}

// â”€â”€ Backup & Restore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BackupPage({
  showToast
}) {
  const [confirmRestore, setConfirmRestore] = useState(null);
  const pagination_BACKUP_HISTORY = usePagination(BACKUP_HISTORY);
  const paginated_BACKUP_HISTORY = pagination_BACKUP_HISTORY.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <Stats stats={[{
      label: 'Total Backups',
      value: String(BACKUP_HISTORY.length)
    }, {
      label: 'Latest Backup',
      value: BACKUP_HISTORY[0]?.date ?? 'â€”'
    }, {
      label: 'Latest Size',
      value: BACKUP_HISTORY[0]?.size ?? 'â€”'
    }, {
      label: 'Schedule',
      value: 'Daily 02:00 AM'
    }]} />

      {confirmRestore && <section className="panel content-panel relative overflow-hidden" style={{
      borderColor: '#fca5a5',
      background: 'rgba(220,38,38,0.04)'
    }}>
          <p><strong>Warning:</strong> Restoring backup from <strong>{confirmRestore.date}</strong> will replace all current data. This cannot be undone.</p>
          <div style={{
        display: 'flex',
        gap: 10,
        marginTop: 12
      }}>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" style={{
          background: '#dc2626'
        }} onClick={() => {
          showToast(`Database restored from ${confirmRestore.date}.`, 'success');
          setConfirmRestore(null);
        }}>Confirm Restore</button>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setConfirmRestore(null)}>Cancel</button>
          </div>
        </section>}

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Backup History</h3>
          <button className="button" type="button" onClick={() => showToast('Manual backup started. This may take a few minutes.', 'success')}>Create Manual Backup</button>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Type</th><th>Date</th><th>Size</th><th>Created By</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {paginated_BACKUP_HISTORY.map(b => <tr key={b.id}>
                  <td>{b.type}</td><td>{b.date}</td><td>{b.size}</td><td>{b.by}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="table-actions">
                    <button className="icon-action-button" type="button" title="Download" onClick={() => showToast(`Downloading ${b.date} backup.`, 'success')}><NavIcon name="download" /></button>
                    <button className="icon-action-button" type="button" title="Restore" onClick={() => setConfirmRestore(b)}><NavIcon name="history" /></button>
                  </td>
                </tr>)}
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
  return <div className="relative z-10 grid gap-[22px] w-full">
      <Toolbar actions={[{
      label: loading ? 'Refreshing…' : 'Refresh',
      action: 'refresh'
    }]} onAction={action => {
      if (action.action === 'refresh') refresh();
    }} />

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

// ── Audit Logs ────────────────────────────────────────────────────────────────
function AuditLogsPage({
  showToast
}) {
  const pagination_AUDIT_LOGS = usePagination(AUDIT_LOGS);
  const paginated_AUDIT_LOGS = pagination_AUDIT_LOGS.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>System Audit Log</h3>
          <button className="button" type="button" onClick={() => showToast('Logs exported.', 'success')}>Export Logs</button>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>IP Address</th><th>Status</th></tr></thead>
            <tbody>
              {paginated_AUDIT_LOGS.map(l => <tr key={l.id}>
                  <td>{l.timestamp}</td><td>{l.user}</td><td>{l.action}</td><td>{l.module}</td><td>{l.ip}</td>
                  <td><StatusBadge status={l.status} /></td>
                </tr>)}
            </tbody>
          </table>
        </div><Pagination {...pagination_AUDIT_LOGS} /></>
      </section>
    </div>;
}
function ProfilePage({
  navigate,
  showToast
}) {
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Super Admin Profile</h3></div>
        <ul className="info-grid">
          <li><span className="info-item-label">Name</span><span className="info-item-value">{SUPER_ADMIN_PROFILE.name}</span></li>
          <li><span className="info-item-label">Employee ID</span><span className="info-item-value">{SUPER_ADMIN_PROFILE.employeeId}</span></li>
          <li><span className="info-item-label">Email</span><span className="info-item-value">{SUPER_ADMIN_PROFILE.email}</span></li>
          <li><span className="info-item-label">Phone</span><span className="info-item-value">{SUPER_ADMIN_PROFILE.phone}</span></li>
          <li><span className="info-item-label">Role</span><span className="info-item-value">{SUPER_ADMIN_PROFILE.role}</span></li>
        </ul>
        <div className="flex justify-end gap-2 mt-6">
          <button className="button ghost" type="button" onClick={() => {
          /* requestLogout() is not defined here but simulating logic */showToast('Logout clicked.', 'success');
        }}>Logout</button>
          <button className="button secondary" type="button" onClick={() => showToast('Change Password opened.', 'success')}>Change Password</button>
          <button className="button" type="button" onClick={() => showToast('Update Profile opened.', 'success')}>Update Profile</button>
        </div>
      </section>
    </div>;
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
      const [uRes, rRes, bRes] = await Promise.all([apiClient.get('/users?limit=100'), apiClient.get('/roles'), apiClient.get('/dashboard/branches') // using branches summary for dropdown
      ]);
      setUsers(uRes.data.data || []);
      setRoles(rRes.data.data.roles || []);
      setBranches(bRes.data.data || []);
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
    if (!window.confirm('Are you sure you want to deactivate this user?')) return;
    try {
      await apiClient.delete(`/users/${id}`);
      showToast('User deactivated.', 'success');
      fetchData();
    } catch (err) {
      showToast('Failed to deactivate user.', 'error');
    }
  };
  const pagination_users = usePagination(users);
  const paginated_users = pagination_users.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>User Directory</h3>
          <button className="button" type="button" onClick={openAdd}>Add User</button>
        </div>
        <><div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr><th>Name</th><th>Middle Name</th><th>Email / Username</th><th>Role</th><th>Branch</th><th>Last Login</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="7" style={{
                  textAlign: 'center',
                  padding: '20px'
                }}>Loading...</td></tr> : users.length === 0 ? <tr><td colSpan="7" style={{
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
                      background: "#093850",
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
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => openEdit(u)}><NavIcon name="edit" /></button>
                      <button className="icon-action-button danger" type="button" title="Deactivate" onClick={() => deactivateUser(u.id)}><NavIcon name="trash" /></button>
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
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end'
          }}>
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>}
    </div>;
}

// â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    case 'auditLogs':
      return <AuditLogsPage {...p} />;
    case 'notifications':
      return <EmptyState title="No notifications" description="System notifications will appear here." />;
    case 'profile':
      return <ProfilePage {...p} />;
    default:
      return <EmptyState title="Page not found" />;
  }
}