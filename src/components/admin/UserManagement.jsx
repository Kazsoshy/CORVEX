import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '../../api/apiClient';
import { Pagination } from '../shared/Pagination';
import { useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';

const USERS_PATH = '/operating-manager/admin/users';
const BRANCH_ROLE_SLUGS = new Set(['branch_manager', 'inventory_staff', 'sales_staff', 'collector']);
const NON_ASSIGNABLE_ROLE_SLUGS = new Set(['super_admin', 'operating_manager', 'customer', 'client']);

export const EMAIL_LOCKED_MESSAGE = 'Email address is managed through the account security process and cannot be modified from User Management.';
export const PASSWORD_LOCKED_MESSAGE = 'Password management is handled through the secure account recovery process.';

function fullName(user) {
  return [user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ').trim() || 'User';
}

function roleId(role) {
  return role?.id ?? role?.role_id;
}

function roleName(role) {
  return role?.name ?? role?.role_name;
}

function branchId(branch) {
  return branch?.branch_id ?? branch?.id;
}

function branchName(branch) {
  return branch?.branch_name ?? branch?.name;
}

function errorMessage(err, fallback) {
  return err?.response?.data?.message || fallback;
}

function buildUserDetailRows(user) {
  if (!user) return [];
  const rows = [
    { key: 'emp', label: 'Employee ID', value: user.employee_id || '—' },
    { key: 'name', label: 'Full Name', value: fullName(user) },
    { key: 'email', label: 'Email', value: user.email || '—' },
    { key: 'phone', label: 'Contact Number', value: formatPhone(user.contact_number || user.phone) },
    { key: 'role', label: 'Role', value: user.role?.name || '—' },
    { key: 'branch', label: 'Branch', value: user.branch?.name || '—' },
    { key: 'status', label: 'Status', value: <StatusBadge status={user.status} /> },
  ];
  if (user.status !== 'Active' && user.status_reason) {
    rows.push({ key: 'reason', label: 'Disable Reason', value: user.status_reason });
  }
  if (user.status_changed_at) {
    rows.push({
      key: 'status-changed',
      label: 'Status Changed',
      value: `${formatDisplayDateTime(user.status_changed_at)}${user.status_changed_by_name ? ` by ${user.status_changed_by_name}` : ' (system)'}`,
    });
  }
  rows.push(
    { key: 'password', label: 'Password', value: user.must_change_password ? 'Temporary — change required at next sign-in' : 'Set by employee' },
    { key: 'login', label: 'Last Sign-in', value: user.last_login ? formatDisplayDateTime(user.last_login) : 'Never signed in' },
    { key: 'created', label: 'Date Created', value: formatDisplayDate(user.created_at) },
  );
  return rows;
}

/** Portals to <body> so the overlay covers the sidebar instead of sitting in the page's stacking context. */
function ModalOverlay({ onDismiss, children }) {
  return createPortal(
    <div className="modal-overlay" onClick={onDismiss}>{children}</div>,
    document.body
  );
}

// ── Row actions menu (fixed-position so table scrolling never clips it) ───────

function RowActionsMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || 0;
    const fitsBelow = rect.bottom + menuHeight + 8 < window.innerHeight;
    setPos({
      top: fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="button ghost user-row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}
      >
        ⋮
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="panel user-row-menu"
          style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
          onClick={(event) => event.stopPropagation()}
        >
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`button ghost user-row-menu-item${item.danger ? ' danger-text' : ''}`}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </>
  );
}

// ── Open responsibilities panel (shared by Disable and role/branch changes) ───

function DependencyPanel({
  user,
  dependencies,
  candidates,
  reassignTo,
  onReassignTo,
  acknowledged,
  onAcknowledge,
  actionLabel = 'disabling this account',
}) {
  if (!dependencies) return null;
  const items = dependencies.items || [];
  const blocking = items.filter((i) => i.kind === 'blocking');
  const reassign = items.filter((i) => i.kind === 'reassign');
  const handover = items.filter((i) => i.kind === 'handover');
  const branchLabel = user?.branch?.name || 'this branch';

  if (!items.length) {
    return (
      <div className="user-dependency-box ok">
        <strong>No open work.</strong> Nothing needs to be handed over before {actionLabel}. Completed transactions and history stay linked to this employee.
      </div>
    );
  }

  return (
    <div className="user-dependency-stack">
      {blocking.length ? (
        <div className="user-dependency-box blocking">
          <strong>Must be resolved first</strong>
          <ul>
            {blocking.map((item) => (
              <li key={item.key}>
                <span>{item.label}: <strong>{item.count}</strong></span>
                <small>{item.resolution}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reassign.length ? (
        <div className="user-dependency-box reassign">
          <strong>Will be reassigned</strong>
          <ul>
            {reassign.map((item) => (
              <li key={item.key}>
                <span>{item.label}: <strong>{item.count}</strong></span>
              </li>
            ))}
          </ul>
          {candidates?.length ? (
            <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
              <label htmlFor="reassign-target">Reassign open work to <span className="required">*</span></label>
              <select
                id="reassign-target"
                className="filter-select"
                value={reassignTo}
                onChange={(e) => onReassignTo(e.target.value)}
              >
                <option value="">Select a {user?.role?.name || 'replacement'} in {branchLabel}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.employeeId ? ` (${c.employeeId})` : ''}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="form-error" style={{ marginBottom: 0 }}>
              No other active {user?.role?.name || 'employee'} works in {branchLabel}. Create or enable one first, then come back.
            </p>
          )}
        </div>
      ) : null}

      {handover.length ? (
        <div className="user-dependency-box handover">
          <strong>Stays with the branch</strong>
          <ul>
            {handover.map((item) => (
              <li key={item.key}>
                <span>{item.label}: <strong>{item.count}</strong></span>
                <small>{item.resolution}</small>
              </li>
            ))}
          </ul>
          <label className="user-dependency-ack">
            <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} />
            <span>I understand these items will wait in the {branchLabel} queue until a new Branch Manager is assigned.</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function dependencyReady(dependencies, candidates, reassignTo, acknowledged) {
  const items = dependencies?.items || [];
  if (items.some((i) => i.kind === 'blocking')) return false;
  if (items.some((i) => i.kind === 'reassign') && (!candidates?.length || !reassignTo)) return false;
  if (items.some((i) => i.kind === 'handover') && !acknowledged) return false;
  return true;
}

function UserIdentityHeader({ user }) {
  return (
    <div className="user-identity-header">
      <div>
        <strong>{fullName(user)}</strong>
        <span>{user.employee_id || '—'}</span>
      </div>
      <div>
        <span>{user.role?.name || '—'}</span>
        <span>{user.branch?.name || 'No branch'}</span>
      </div>
    </div>
  );
}

// ── Disable / Enable / Temporary password modals ─────────────────────────────

function DisableUserModal({ user, onClose, onDone, showToast }) {
  const [loading, setLoading] = useState(true);
  const [dependencies, setDependencies] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [reason, setReason] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadDependencies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/users/${user.user_id}/dependencies`);
      setDependencies(res.data?.data?.dependencies || null);
      setCandidates(res.data?.data?.candidates || []);
    } catch (err) {
      setError(errorMessage(err, 'Could not check this employee\'s open work.'));
    } finally {
      setLoading(false);
    }
  }, [user.user_id]);

  useEffect(() => { loadDependencies(); }, [loadDependencies]);

  const ready = !loading && dependencies && reason.trim().length >= 5
    && dependencyReady(dependencies, candidates, reassignTo, acknowledged);

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/users/${user.user_id}/disable`, {
        reason: reason.trim(),
        reassign_to_user_id: reassignTo ? Number(reassignTo) : undefined,
        acknowledge_handover: acknowledged,
      });
      showToast(`${fullName(user)} disabled. Sign-in is blocked and active sessions were ended.`, 'success');
      onDone();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.dependencies) setDependencies(data.dependencies);
      setError(errorMessage(err, 'Failed to disable this account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onDismiss={() => !submitting && onClose()}>
      <div className="modal-content" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-labelledby="disable-user-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="disable-user-title" style={{ marginTop: 0 }}>Disable Account</h3>
        <UserIdentityHeader user={user} />
        <p className="text-ink/70" style={{ fontSize: '0.88rem' }}>
          Disabling blocks sign-in immediately and ends every active session. The email address, sales, collections, approvals, and audit history are kept. The account can be enabled again later.
        </p>
        {loading ? <LoadingState message="Checking open work..." /> : (
          <DependencyPanel
            user={user}
            dependencies={dependencies}
            candidates={candidates}
            reassignTo={reassignTo}
            onReassignTo={setReassignTo}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
          />
        )}
        <div className="form-group" style={{ marginTop: 12 }}>
          <label htmlFor="disable-reason">Reason <span className="required">*</span></label>
          <textarea
            id="disable-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Resigned effective Nov 30; transferred to another company"
          />
          <small className="text-ink/70">Recorded in the audit log and shown in the account details.</small>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="button danger" type="button" disabled={!ready || submitting} onClick={submit}>
            {submitting ? 'Disabling…' : 'Disable Account'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EnableUserModal({ user, onClose, onDone, showToast }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post(`/users/${user.user_id}/enable`, { reason: reason.trim() || undefined });
      showToast(`${fullName(user)} enabled. They can sign in again with their existing role.`, 'success');
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Failed to enable this account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onDismiss={() => !submitting && onClose()}>
      <div className="modal-content" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-labelledby="enable-user-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="enable-user-title" style={{ marginTop: 0 }}>Enable Account</h3>
        <UserIdentityHeader user={user} />
        {user.status_reason ? (
          <p className="text-ink/70" style={{ fontSize: '0.88rem' }}>Disabled because: {user.status_reason}</p>
        ) : null}
        <p className="text-ink/70" style={{ fontSize: '0.88rem' }}>
          The employee signs in with their existing password, role, and branch. Previously reassigned work is not moved back automatically.
        </p>
        <div className="form-group">
          <label htmlFor="enable-reason">Reason (optional)</label>
          <input id="enable-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Returned from leave" />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="button" type="button" disabled={submitting} onClick={submit}>
            {submitting ? 'Enabling…' : 'Enable Account'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function CredentialNotice({ user, credential, title, onClose }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const password = credential?.temporaryPassword || '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setRevealed(true);
    }
  };

  return (
    <ModalOverlay>
      <div className="modal-content" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-labelledby="credential-title">
        <h3 id="credential-title" style={{ marginTop: 0 }}>{title}</h3>
        <UserIdentityHeader user={user} />
        {password ? (
          <>
            <p style={{ fontSize: '0.9rem' }}>
              Give this temporary password to <strong>{fullName(user)}</strong> in person or through a secure channel. It is shown <strong>only once</strong> and is not stored in readable form.
            </p>
            <div className="credential-box">
              <code aria-label="Temporary password">{revealed ? password : '•'.repeat(password.length)}</code>
              <button type="button" className="button ghost" onClick={() => setRevealed((v) => !v)}>{revealed ? 'Hide' : 'Show'}</button>
              <button type="button" className="button secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="text-ink/70" style={{ fontSize: '0.85rem' }}>
              Sign-in email: <strong>{user.email}</strong>. The employee must set a new password the first time they sign in.
            </p>
          </>
        ) : (
          <p style={{ fontSize: '0.9rem' }}>
            The account was created with the password you set. The employee must change it the first time they sign in.
          </p>
        )}
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>I have handed this over securely</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function TemporaryPasswordModal({ user, onClose, showToast }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState(null);

  if (credential) {
    return <CredentialNotice user={user} credential={credential} title="Temporary Password Issued" onClose={onClose} />;
  }

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.post(`/users/${user.user_id}/temporary-password`, { reason: reason.trim() });
      showToast('Temporary password issued. The employee\'s active sessions were ended.', 'success');
      setCredential(res.data?.initialCredential || null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to issue a temporary password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalOverlay onDismiss={() => !submitting && onClose()}>
      <div className="modal-content" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-labelledby="temp-pw-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="temp-pw-title" style={{ marginTop: 0 }}>Issue Temporary Password</h3>
        <UserIdentityHeader user={user} />
        <p className="text-ink/70" style={{ fontSize: '0.88rem' }}>
          Use this only when the employee cannot sign in (forgotten password or lost initial credentials). Their current password stops working, all their sessions end, and they must set a new password at next sign-in. This action is audited.
        </p>
        <div className="form-group">
          <label htmlFor="temp-pw-reason">Reason <span className="required">*</span></label>
          <input id="temp-pw-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Employee forgot password; identity verified in person" />
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="button secondary" type="button" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="button" type="button" disabled={submitting || reason.trim().length < 5} onClick={submit}>
            {submitting ? 'Issuing…' : 'Issue Temporary Password'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── User list ────────────────────────────────────────────────────────────────

const SORTABLE = [
  { key: 'employee_id', label: 'Employee ID', className: 'cell-emp' },
  { key: 'name', label: 'Name', className: 'cell-name' },
  { key: 'role', label: 'Role', className: 'cell-role' },
  { key: 'branch', label: 'Branch', className: 'cell-branch' },
];

export function UserListPage({ navigate, showToast }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sort, setSort] = useState({ key: 'created_at', order: 'desc' });
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [disableTarget, setDisableTarget] = useState(null);
  const [enableTarget, setEnableTarget] = useState(null);
  const [tempPasswordTarget, setTempPasswordTarget] = useState(null);
  const [credentialNotice, setCredentialNotice] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterResetKey = `${search}|${roleFilter}|${branchFilter}|${statusFilter}|${sort.key}|${sort.order}`;
  const pagination = useServerPagination({ totalRecords, pageSize: DEFAULT_PAGE_SIZE, resetKey: filterResetKey });
  const { currentPage } = pagination;

  useEffect(() => {
    let active = true;
    Promise.allSettled([apiClient.get('/roles'), apiClient.get('/branches')]).then(([rolesRes, branchesRes]) => {
      if (!active) return;
      if (rolesRes.status === 'fulfilled' && rolesRes.value.data?.success) {
        setRoles((rolesRes.value.data.data?.roles || []).filter((r) => !NON_ASSIGNABLE_ROLE_SLUGS.has(r.slug)));
      }
      if (branchesRes.status === 'fulfilled' && branchesRes.value.data?.success) {
        setBranches(branchesRes.value.data.data || []);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const params = { page: currentPage, limit: DEFAULT_PAGE_SIZE, sort: sort.key, order: sort.order };
    if (search) params.search = search;
    if (roleFilter !== 'All') params.role = roleFilter;
    if (branchFilter !== 'All') params.branch_id = branchFilter;
    if (statusFilter !== 'All') params.status = statusFilter;
    setLoading(true);
    apiClient.get('/users', { params })
      .then((res) => {
        if (!active) return;
        // Defense in depth: never render org-admin / portal accounts on OM User Management
        // even if an older API build still returns them.
        const raw = res.data?.data || [];
        const rows = raw.filter((u) => !NON_ASSIGNABLE_ROLE_SLUGS.has(u?.role?.slug));
        const apiTotal = Number(res.data?.pagination?.total) || 0;
        setUsers(rows);
        setTotalRecords(Math.max(0, apiTotal - (raw.length - rows.length)));
      })
      .catch((err) => {
        if (!active) return;
        setUsers([]);
        setTotalRecords(0);
        showToast(errorMessage(err, 'Failed to load users.'), 'error');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentPage, search, roleFilter, branchFilter, statusFilter, sort, reloadKey, showToast]);

  const refresh = () => setReloadKey((k) => k + 1);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key
      ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
      : { key, order: 'asc' }));
  };

  const sortHeader = (key, label) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        className={`user-sort-button${active ? ' active' : ''}`}
        onClick={() => toggleSort(key)}
        aria-label={`Sort by ${label}${active ? ` (${sort.order === 'asc' ? 'ascending' : 'descending'})` : ''}`}
      >
        {label}
        <span aria-hidden="true">{active ? (sort.order === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    );
  };

  const openViewUser = async (user) => {
    setViewingUser(user);
    setViewLoading(true);
    try {
      const res = await apiClient.get(`/users/${user.user_id}`);
      if (res.data?.success) setViewingUser(res.data.data);
    } catch (err) {
      showToast(errorMessage(err, 'Failed to load user details.'), 'error');
      setViewingUser(null);
    } finally {
      setViewLoading(false);
    }
  };

  const hasFilters = search || roleFilter !== 'All' || branchFilter !== 'All' || statusFilter !== 'All';

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3 style={{ margin: 0 }}>
              Employees <span className="text-ink/70" style={{ fontWeight: 400, fontSize: '0.88rem' }}>({totalRecords})</span>
            </h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Branch staff accounts across all branches. Operating Manager and Super Admin accounts are managed separately.
            </p>
          </div>
          <button className="button" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} type="button" onClick={() => setShowAddUserModal(true)}>
            + Add User
          </button>
        </div>

        <div className="list-section-controls" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="filter-input search"
            type="search"
            placeholder="Search name, email, or Employee ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search employees"
          />
          <select className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role filter">
            <option value="All">All Roles</option>
            {roles.map((r) => <option key={roleId(r)} value={r.slug}>{roleName(r)}</option>)}
          </select>
          <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Branch filter">
            <option value="All">All Branches</option>
            {branches.map((b) => <option key={branchId(b)} value={branchId(b)}>{branchName(b)}</option>)}
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Disabled</option>
          </select>
        </div>

        {loading && !users.length ? <LoadingState message="Loading users..." /> : totalRecords ? (
          <>
            <div className="corvex-table-wrapper" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="corvex-table corvex-table-employees">
                <thead>
                  <tr>
                    {SORTABLE.map((col) => <th key={col.key} className={col.className}>{sortHeader(col.key, col.label)}</th>)}
                    <th className="cell-status">Status</th>
                    <th className="cell-created">{sortHeader('created_at', 'Date Created')}</th>
                    <th className="cell-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const name = fullName(u);
                    const isActive = u.status === 'Active';
                    return (
                      <tr key={u.user_id} className="clickable-row" onClick={() => openViewUser(u)}>
                        <td className="cell-emp"><code>{u.employee_id || '—'}</code></td>
                        <td className="cell-name">
                          <strong>{name}</strong>
                          <span className="user-meta-id" title={u.email}>{u.email}</span>
                        </td>
                        <td className="cell-role">{u.role?.name || '—'}</td>
                        <td className="cell-branch">{u.branch?.name || '—'}</td>
                        <td className="cell-status">
                          <StatusBadge status={isActive ? 'Active' : 'Inactive'} />
                          {isActive && u.must_change_password ? <span className="user-meta-id">Awaiting first sign-in</span> : null}
                        </td>
                        <td className="cell-created">{formatDisplayDate(u.created_at)}</td>
                        <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu
                            label={`Actions for ${name}`}
                            items={[
                              { key: 'view', label: 'View Details', onSelect: () => openViewUser(u) },
                              { key: 'edit', label: 'Edit User', onSelect: () => setEditingUserId(u.user_id) },
                              isActive
                                ? { key: 'temp', label: 'Issue Temporary Password', onSelect: () => setTempPasswordTarget(u) }
                                : null,
                              isActive
                                ? { key: 'disable', label: 'Disable Account', danger: true, onSelect: () => setDisableTarget(u) }
                                : { key: 'enable', label: 'Enable Account', onSelect: () => setEnableTarget(u) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title="No employees found"
            description={hasFilters ? 'Adjust your search or filters.' : 'Add the first employee account.'}
          />
        )}
      </section>

      {viewingUser ? (
        <ModalOverlay onDismiss={() => !viewLoading && setViewingUser(null)}>
          <div className="modal-content" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-labelledby="user-view-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="user-view-title" style={{ marginTop: 0 }}>Employee Details</h3>
            {viewLoading ? <LoadingState message="Loading user details..." /> : <DetailRowsTable rows={buildUserDetailRows(viewingUser)} />}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="button secondary" type="button" disabled={viewLoading} onClick={() => setViewingUser(null)}>Close</button>
              <button
                className="button"
                type="button"
                disabled={viewLoading}
                onClick={() => { const id = viewingUser.user_id; setViewingUser(null); setEditingUserId(id); }}
              >
                Edit User
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      {showAddUserModal ? (
        <ModalOverlay>
          <div className="modal-content modal-content--wide">
            <UserFormPage
              navigate={navigate}
              showToast={showToast}
              isModal
              onCancel={() => setShowAddUserModal(false)}
              onSuccess={({ user, credential }) => {
                setShowAddUserModal(false);
                setCredentialNotice({ user, credential });
                refresh();
              }}
            />
          </div>
        </ModalOverlay>
      ) : null}

      {editingUserId ? (
        <ModalOverlay>
          <div className="modal-content modal-content--wide">
            <UserFormPage
              userId={editingUserId}
              navigate={navigate}
              showToast={showToast}
              isModal
              onCancel={() => setEditingUserId(null)}
              onSuccess={() => { setEditingUserId(null); refresh(); }}
            />
          </div>
        </ModalOverlay>
      ) : null}

      {disableTarget ? (
        <DisableUserModal
          user={disableTarget}
          showToast={showToast}
          onClose={() => setDisableTarget(null)}
          onDone={() => { setDisableTarget(null); refresh(); }}
        />
      ) : null}
      {enableTarget ? (
        <EnableUserModal
          user={enableTarget}
          showToast={showToast}
          onClose={() => setEnableTarget(null)}
          onDone={() => { setEnableTarget(null); refresh(); }}
        />
      ) : null}
      {tempPasswordTarget ? (
        <TemporaryPasswordModal
          user={tempPasswordTarget}
          showToast={showToast}
          onClose={() => { setTempPasswordTarget(null); refresh(); }}
        />
      ) : null}
      {credentialNotice ? (
        <CredentialNotice
          user={credentialNotice.user}
          credential={credentialNotice.credential}
          title="Account Created"
          onClose={() => setCredentialNotice(null)}
        />
      ) : null}
    </div>
  );
}

// ── Add / Edit form ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  contact_number: '',
  role_id: '',
  branch_id: '',
};

export function UserFormPage({ userId, navigate, showToast, isModal = false, onCancel, onSuccess }) {
  const isEdit = Boolean(userId);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [slots, setSlots] = useState([]);
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [dependencies, setDependencies] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [createdNotice, setCreatedNotice] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const requests = [
          apiClient.get('/branches'),
          apiClient.get('/roles'),
          apiClient.get('/users/branch-manager-slots'),
        ];
        if (isEdit) requests.push(apiClient.get(`/users/${userId}`));
        // allSettled so a slots/branches hiccup does not blank the Role dropdown
        const [branchesRes, rolesRes, slotsRes, userRes] = await Promise.allSettled(requests);
        if (!active) return;

        if (branchesRes.status === 'fulfilled' && branchesRes.value.data?.success) {
          setBranches(branchesRes.value.data.data || []);
        }
        if (rolesRes.status === 'fulfilled' && rolesRes.value.data?.success) {
          const list = rolesRes.value.data.data?.roles || rolesRes.value.data.roles || [];
          setRoles(list.filter((r) => r?.slug && !NON_ASSIGNABLE_ROLE_SLUGS.has(r.slug)));
        } else {
          setRoles([]);
          showToast(errorMessage(rolesRes.reason, 'Failed to load roles for assignment.'), 'error');
        }
        if (slotsRes.status === 'fulfilled' && slotsRes.value.data?.success) {
          setSlots(slotsRes.value.data.data || []);
        }
        if (isEdit) {
          if (userRes?.status === 'fulfilled' && userRes.value.data?.success) {
            const u = userRes.value.data.data;
            setOriginal(u);
            setForm({
              first_name: u.first_name || '',
              middle_name: u.middle_name || '',
              last_name: u.last_name || '',
              email: u.email || '',
              contact_number: u.contact_number || u.phone || '',
              role_id: u.role_id != null ? String(u.role_id) : (u.role?.id != null ? String(u.role.id) : ''),
              branch_id: u.branch_id != null ? String(u.branch_id) : '',
            });
          } else {
            showToast(errorMessage(userRes?.reason, 'Failed to load this employee.'), 'error');
          }
        }
      } catch (err) {
        showToast(errorMessage(err, 'Failed to load the user form.'), 'error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [isEdit, userId, showToast]);

  const assignableRoles = useMemo(() => {
    const byId = new Map(roles.map((r) => [String(roleId(r)), r]));
    // Keep the employee's current role visible on edit even if the catalog briefly omitted it
    if (original?.role && original.role_id != null && !byId.has(String(original.role_id))) {
      byId.set(String(original.role_id), {
        id: original.role_id,
        name: original.role.name,
        slug: original.role.slug,
      });
    }
    return [...byId.values()];
  }, [roles, original]);

  const selectedRole = useMemo(
    () => assignableRoles.find((r) => String(roleId(r)) === String(form.role_id)) || null,
    [assignableRoles, form.role_id]
  );
  const roleSlug = selectedRole?.slug || original?.role?.slug || '';
  const needsBranch = BRANCH_ROLE_SLUGS.has(roleSlug);
  const isBranchManagerRole = roleSlug === 'branch_manager';
  const slotByBranch = useMemo(() => new Map(slots.map((s) => [String(s.branchId), s])), [slots]);

  const branchOccupant = (id) => {
    const slot = slotByBranch.get(String(id));
    if (!slot?.manager) return null;
    if (original && Number(slot.manager.id) === Number(original.user_id)) return null;
    return slot.manager;
  };

  const assignmentChanged = isEdit && original && (
    String(form.role_id) !== String(original.role_id || '')
    || (needsBranch && String(form.branch_id) !== String(original.branch_id || ''))
  );

  useEffect(() => {
    if (!assignmentChanged || original?.status !== 'Active') {
      setDependencies(null);
      setCandidates([]);
      return undefined;
    }
    let active = true;
    setDepsLoading(true);
    apiClient.get(`/users/${original.user_id}/dependencies`)
      .then((res) => {
        if (!active) return;
        setDependencies(res.data?.data?.dependencies || null);
        setCandidates(res.data?.data?.candidates || []);
      })
      .catch(() => { if (active) setDependencies(null); })
      .finally(() => { if (active) setDepsLoading(false); });
    return () => { active = false; };
  }, [assignmentChanged, original]);

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'role_id') {
        const nextSlug = assignableRoles.find((r) => String(roleId(r)) === String(value))?.slug;
        if (!BRANCH_ROLE_SLUGS.has(nextSlug)) next.branch_id = '';
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setServerError('');
  };

  const validate = () => {
    const next = {};
    if (!form.first_name.trim()) next.first_name = 'First name is required.';
    if (!form.last_name.trim()) next.last_name = 'Last name is required.';
    if (!isEdit) {
      if (!form.email.trim()) next.email = 'Email is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    }
    if (form.contact_number.trim()) {
      const digits = form.contact_number.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) next.contact_number = 'Enter a valid contact number (7–15 digits).';
    }
    if (!form.role_id) next.role_id = 'Select a role.';
    if (needsBranch && !form.branch_id) next.branch_id = 'Select the branch this employee works in.';
    if (isBranchManagerRole && form.branch_id && branchOccupant(form.branch_id)) {
      next.branch_id = 'This branch already has an active Branch Manager.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const depsBlocking = assignmentChanged && original?.status === 'Active'
    && (depsLoading || (dependencies && !dependencyReady(dependencies, candidates, reassignTo, acknowledged)));

  const handleSubmit = async () => {
    if (!validate() || depsBlocking) return;
    setSubmitting(true);
    setServerError('');
    const payload = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      contact_number: form.contact_number.trim() || null,
      role_id: Number(form.role_id),
      branch_id: needsBranch ? Number(form.branch_id) : null,
    };
    try {
      if (isEdit) {
        if (assignmentChanged) {
          if (reassignTo) payload.reassign_to_user_id = Number(reassignTo);
          payload.acknowledge_handover = acknowledged;
        }
        await apiClient.put(`/users/${userId}`, payload);
        showToast(assignmentChanged
          ? 'User updated. Their sessions were ended so the new role or branch takes effect at next sign-in.'
          : 'User updated successfully.', 'success');
        if (onSuccess) onSuccess();
        else navigate(USERS_PATH);
      } else {
        const res = await apiClient.post('/users', { ...payload, email: form.email.trim().toLowerCase() });
        const result = { user: res.data?.data, credential: res.data?.initialCredential };
        showToast('User created. Status: Active.', 'success');
        if (onSuccess) onSuccess(result);
        else setCreatedNotice(result);
      }
    } catch (err) {
      const data = err?.response?.data;
      if (data?.dependencies) setDependencies(data.dependencies);
      if (data?.code === 'BRANCH_MANAGER_EXISTS') setErrors((prev) => ({ ...prev, branch_id: data.message }));
      if (data?.code === 'EMAIL_IN_USE') setErrors((prev) => ({ ...prev, email: data.message }));
      setServerError(errorMessage(err, 'Failed to save user.'));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => (onCancel ? onCancel() : navigate(USERS_PATH));

  if (createdNotice) {
    return (
      <CredentialNotice
        user={createdNotice.user}
        credential={createdNotice.credential}
        title="Account Created"
        onClose={() => navigate(USERS_PATH)}
      />
    );
  }

  if (loading) {
    return isModal ? <LoadingState message="Loading user form..." /> : <div className="page"><LoadingState message="Loading..." /></div>;
  }

  const title = isEdit ? 'Edit User' : 'Add New User';
  return (
    <div className={isModal ? '' : 'page'}>
      <section className={isModal ? '' : 'panel form-panel content-panel'}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {isEdit && original ? (
          <p className="text-ink/70" style={{ margin: '-4px 0 12px', fontSize: '0.85rem' }}>
            Current status: <StatusBadge status={original.status === 'Active' ? 'Active' : 'Inactive'} /> — change it with Disable or Enable from the actions menu.
          </p>
        ) : (
          <p className="text-ink/70" style={{ margin: '-4px 0 12px', fontSize: '0.85rem' }}>
            New accounts start as Active. A temporary password is generated and shown once after saving; the employee must change it at first sign-in.
          </p>
        )}

        <fieldset className="user-form-section">
          <legend>Personal &amp; Contact</legend>
          <div className="grid two-up">
            <div className="form-group">
              <label htmlFor="uf-emp">Employee ID</label>
              <input id="uf-emp" value={original?.employee_id || ''} readOnly disabled placeholder="Assigned automatically when saved" />
              <small className="text-ink/70">System-generated and permanent.</small>
            </div>
            <div className="form-group">
              <label htmlFor="uf-email">Email {isEdit ? null : <span className="required">*</span>}</label>
              <input
                id="uf-email"
                type="email"
                value={form.email}
                readOnly={isEdit}
                disabled={isEdit}
                onChange={(e) => update('email', e.target.value)}
                placeholder="name@corvex.ph"
                autoComplete="off"
              />
              {isEdit ? <small className="text-ink/70">{EMAIL_LOCKED_MESSAGE}</small> : <small className="text-ink/70">Used to sign in. Must be unique.</small>}
              {errors.email ? <p className="form-error">{errors.email}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="uf-first">First Name <span className="required">*</span></label>
              <input id="uf-first" maxLength={50} value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
              {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="uf-middle">Middle Name</label>
              <input id="uf-middle" maxLength={50} value={form.middle_name} onChange={(e) => update('middle_name', e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-group">
              <label htmlFor="uf-last">Last Name <span className="required">*</span></label>
              <input id="uf-last" maxLength={50} value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
              {errors.last_name ? <p className="form-error">{errors.last_name}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="uf-contact">Contact Number</label>
              <input id="uf-contact" inputMode="tel" maxLength={20} value={form.contact_number} onChange={(e) => update('contact_number', e.target.value)} placeholder="09XX XXX XXXX" />
              {errors.contact_number ? <p className="form-error">{errors.contact_number}</p> : null}
            </div>
          </div>
        </fieldset>

        <fieldset className="user-form-section">
          <legend>Organizational Assignment</legend>
          <div className="grid two-up">
            <div className="form-group">
              <label htmlFor="uf-role">Role <span className="required">*</span></label>
              <select
                id="uf-role"
                className="filter-select"
                value={form.role_id}
                onChange={(e) => update('role_id', e.target.value)}
                disabled={!assignableRoles.length}
              >
                <option value="">{assignableRoles.length ? 'Select role' : 'No roles available'}</option>
                {assignableRoles.map((r) => (
                  <option key={String(roleId(r))} value={String(roleId(r))}>{roleName(r)}</option>
                ))}
              </select>
              {!assignableRoles.length ? (
                <p className="form-error">Roles could not be loaded. Close and reopen this form, or refresh the page.</p>
              ) : null}
              {errors.role_id ? <p className="form-error">{errors.role_id}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="uf-branch">Branch {needsBranch ? <span className="required">*</span> : null}</label>
              <select
                id="uf-branch"
                className="filter-select"
                value={needsBranch ? form.branch_id : ''}
                onChange={(e) => update('branch_id', e.target.value)}
                disabled={!needsBranch}
              >
                <option value="">{needsBranch ? 'Select branch' : 'Select a role first'}</option>
                {needsBranch ? branches.map((b) => {
                  const occupant = isBranchManagerRole ? branchOccupant(branchId(b)) : null;
                  const inactive = b.status && b.status !== 'Active';
                  return (
                    <option key={String(branchId(b))} value={String(branchId(b))} disabled={Boolean(occupant) || inactive}>
                      {branchName(b)}
                      {occupant ? ` — managed by ${occupant.name}${occupant.employeeId ? ` (${occupant.employeeId})` : ''}` : ''}
                      {inactive ? ' — inactive' : ''}
                    </option>
                  );
                }) : null}
              </select>
              {isBranchManagerRole ? (
                <small className="text-ink/70">Each branch has one active Branch Manager. Branches that already have one are unavailable.</small>
              ) : !needsBranch && form.role_id ? (
                <small className="text-ink/70">This role is not tied to a single branch.</small>
              ) : (
                <small className="text-ink/70">Branch staff roles require a home branch.</small>
              )}
              {errors.branch_id ? <p className="form-error">{errors.branch_id}</p> : null}
            </div>
          </div>

          {assignmentChanged && original?.status === 'Active' ? (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.88rem' }}>
                <strong>Role or branch change.</strong> Open work tied to the current assignment is checked first, and the employee is signed out so the new access applies at their next sign-in.
              </p>
              {depsLoading ? <LoadingState message="Checking open work..." /> : (
                <DependencyPanel
                  user={original}
                  dependencies={dependencies}
                  candidates={candidates}
                  reassignTo={reassignTo}
                  onReassignTo={setReassignTo}
                  acknowledged={acknowledged}
                  onAcknowledge={setAcknowledged}
                  actionLabel="changing this assignment"
                />
              )}
            </div>
          ) : null}
        </fieldset>

        {isEdit ? (
          <fieldset className="user-form-section">
            <legend>Account Security</legend>
            <p className="text-ink/70" style={{ margin: 0, fontSize: '0.88rem' }}>{PASSWORD_LOCKED_MESSAGE}</p>
            <p className="text-ink/70" style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
              If the employee cannot sign in, use <strong>Issue Temporary Password</strong> from the actions menu.
            </p>
          </fieldset>
        ) : null}

        {serverError ? <p className="form-error" role="alert">{serverError}</p> : null}
      </section>
      <div className={isModal ? 'modal-actions' : 'flex justify-end gap-2 mt-2'}>
        <button className="button secondary" type="button" disabled={submitting} onClick={cancel}>Cancel</button>
        <button className="button" type="button" disabled={submitting || depsBlocking} onClick={handleSubmit}>
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
        </button>
      </div>
    </div>
  );
}
