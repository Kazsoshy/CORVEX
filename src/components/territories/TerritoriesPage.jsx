import { useEffect, useMemo, useRef, useState } from 'react';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import {
  fetchTerritories,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  fetchAssignableUsers,
} from '../../api/territoriesService';
import { getCurrentUser } from '../../api/authService';
import apiClient from '../../api/apiClient';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';

function formatPersonName(user) {
  if (!user) return '';
  const fromParts = [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ').trim();
  const candidates = [user.user_name, user.full_name, fromParts, user.name];
  for (const value of candidates) {
    const name = String(value || '').trim();
    if (!name) continue;
    if (/^\d+$/.test(name)) continue;
    return name;
  }
  return '';
}

function getAssignedUsers(territory) {
  const list = Array.isArray(territory?.assigned_users) ? territory.assigned_users : [];
  if (list.length > 0) return list;
  if (territory?.assigned_user_name || territory?.assigned_user) {
    return [{
      user_id: territory.assigned_user,
      user_name: territory.assigned_user_name,
      role_name: territory.role_name,
    }];
  }
  return [];
}

function getBranchLabel(branch) {
  return String(branch?.branch_name || branch?.name || '').trim();
}

function getBranchId(branch) {
  return branch?.branch_id ?? branch?.id ?? null;
}

export function TerritoriesPage({ showToast }) {
  const currentUser = getCurrentUser();
  const [territories, setTerritories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [branchSuggestionsOpen, setBranchSuggestionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [branchQuery, setBranchQuery] = useState('');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const searchRef = useRef(null);
  const branchFieldRef = useRef(null);
  const userFieldRef = useRef(null);

  const userBranchId = currentUser?.branch?.id ?? currentUser?.branchId ?? null;
  const canListAllUsers = ['super_admin', 'operating_manager'].includes(currentUser?.role?.slug);
  const isBranchManager = userBranchId != null && currentUser?.role?.slug === 'branch_manager';

  const [form, setForm] = useState({
    territory_name: '',
    branch_id: isBranchManager ? userBranchId : '',
    coverage_area: '',
  });

  const loadTerritories = async () => {
    try {
      setLoading(true);
      const data = await fetchTerritories({});
      if (data.success) {
        setTerritories(data.data || []);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load territories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTerritories();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLookups() {
      try {
        const branchesRes = await apiClient.get('/branches');
        if (!cancelled && branchesRes.data?.success) {
          setBranches(branchesRes.data.data || []);
        }
      } catch {
        /* Branch managers / OM still work from territory branch_name values */
      }

      try {
        if (canListAllUsers) {
          const usersRes = await apiClient.get('/users', { params: { limit: 200, status: 'Active' } });
          if (!cancelled && usersRes.data?.success) {
            setUsers(usersRes.data.data || []);
          }
        } else {
          const data = await fetchAssignableUsers();
          if (!cancelled && data?.success) {
            setUsers(data.data || []);
          }
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 404) {
          showToast?.('Restart the API server (port 5000) to load territory user lookup.', 'error');
        }
        /* Assignable users are optional; territory rows still include assigned names */
      }
    }
    loadLookups();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDocClick = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setBranchSuggestionsOpen(false);
      }
      if (branchFieldRef.current && !branchFieldRef.current.contains(event.target)) {
        setBranchMenuOpen(false);
      }
      if (userFieldRef.current && !userFieldRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const branchOptions = useMemo(() => {
    const map = new Map();
    branches.forEach((b) => {
      const id = getBranchId(b);
      const name = getBranchLabel(b);
      if (id != null && name) map.set(String(id), { branch_id: Number(id), branch_name: name });
    });
    territories.forEach((t) => {
      if (t.branch_id == null) return;
      const key = String(t.branch_id);
      if (!map.has(key) && t.branch_name) {
        map.set(key, { branch_id: Number(t.branch_id), branch_name: t.branch_name });
      }
    });
    return [...map.values()].sort((a, b) => a.branch_name.localeCompare(b.branch_name));
  }, [branches, territories]);

  const branchNameSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const names = branchOptions.map((b) => b.branch_name);
    if (!query) return names.slice(0, 8);
    return names.filter((name) => name.toLowerCase().includes(query)).slice(0, 8);
  }, [branchOptions, search]);

  const filteredTerritories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return territories;
    return territories.filter((t) => {
      const branch = String(t.branch_name || '').toLowerCase();
      const territory = String(t.territory_name || '').toLowerCase();
      const coverage = String(t.coverage_area || '').toLowerCase();
      return branch.includes(query) || territory.includes(query) || coverage.includes(query);
    });
  }, [territories, search]);

  const pagination = usePagination(filteredTerritories);
  const paginatedTerritories = pagination.paginatedData;

  const formBranchSuggestions = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    if (!query) return branchOptions.slice(0, 8);
    return branchOptions
      .filter((b) => b.branch_name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [branchOptions, branchQuery]);

  const assignableUsers = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      const id = u.user_id ?? u.id;
      const name = formatPersonName(u);
      if (id == null || !name) return;
      map.set(String(id), {
        user_id: Number(id),
        user_name: name,
        role_name: u.role?.name || u.role_name || '—',
      });
    });
    territories.forEach((t) => {
      getAssignedUsers(t).forEach((u) => {
        const id = u.user_id;
        const name = formatPersonName(u);
        if (id == null || !name || map.has(String(id))) return;
        map.set(String(id), {
          user_id: Number(id),
          user_name: name,
          role_name: u.role_name || '—',
        });
      });
    });
    return [...map.values()].sort((a, b) => a.user_name.localeCompare(b.user_name));
  }, [users, territories]);

  const userSuggestions = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    const selectedIds = new Set(selectedUsers.map((u) => String(u.user_id)));
    return assignableUsers
      .filter((u) => !selectedIds.has(String(u.user_id)))
      .filter((u) => !query || u.user_name.toLowerCase().includes(query) || String(u.role_name || '').toLowerCase().includes(query))
      .slice(0, 8);
  }, [assignableUsers, selectedUsers, userQuery]);

  const handleAdd = () => {
    setForm({
      territory_name: '',
      branch_id: isBranchManager ? userBranchId : '',
      coverage_area: '',
    });
    setBranchQuery(isBranchManager
      ? (branchOptions.find((b) => Number(b.branch_id) === Number(userBranchId))?.branch_name || '')
      : '');
    setSelectedUsers([]);
    setUserQuery('');
    setEditing(null);
    setErrors({});
    setShowForm(true);
  };

  const handleEdit = (t) => {
    const assigned = getAssignedUsers(t)
      .map((u) => ({
        user_id: Number(u.user_id),
        user_name: formatPersonName(u) || 'Unnamed user',
        role_name: u.role_name || '—',
      }))
      .filter((u) => Number.isFinite(u.user_id));

    setForm({
      territory_name: t.territory_name,
      branch_id: t.branch_id,
      coverage_area: t.coverage_area || '',
    });
    setBranchQuery(t.branch_name || '');
    setSelectedUsers(assigned);
    setUserQuery('');
    setEditing(t);
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setShowForm(false);
    setEditing(null);
    setErrors({});
    setBranchMenuOpen(false);
    setUserMenuOpen(false);
  };

  const updateFormField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field] && !current.submit) return current;
      const next = { ...current };
      delete next[field];
      delete next.submit;
      return next;
    });
  };

  const selectBranch = (branch) => {
    updateFormField('branch_id', String(branch.branch_id));
    setBranchQuery(branch.branch_name);
    setBranchMenuOpen(false);
  };

  const resolveBranchFromQuery = (queryValue = branchQuery) => {
    const query = String(queryValue || '').trim().toLowerCase();
    if (!query) return null;
    const exact = branchOptions.find((b) => b.branch_name.toLowerCase() === query);
    return exact || null;
  };

  const addAssignedUser = (user) => {
    setSelectedUsers((current) => {
      if (current.some((u) => Number(u.user_id) === Number(user.user_id))) return current;
      return [...current, user];
    });
    setUserQuery('');
    setUserMenuOpen(false);
    setErrors((current) => {
      if (!current.assigned_users && !current.submit) return current;
      const next = { ...current };
      delete next.assigned_users;
      delete next.submit;
      return next;
    });
  };

  const removeAssignedUser = (userId) => {
    setSelectedUsers((current) => current.filter((u) => Number(u.user_id) !== Number(userId)));
  };

  const validateForm = () => {
    const nextErrors = {};
    const territoryName = form.territory_name.trim();
    const matchedBranch = !isBranchManager ? resolveBranchFromQuery() : null;
    const branchId = isBranchManager ? form.branch_id : (matchedBranch?.branch_id || form.branch_id);

    if (!territoryName) {
      nextErrors.territory_name = 'Territory name is required.';
    }

    if (!isBranchManager && !branchId) {
      nextErrors.branch_id = 'Select a branch by name.';
    } else if (!isBranchManager && (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0)) {
      nextErrors.branch_id = 'Select a valid branch from the suggestions.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? { branchId } : null;
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Are you sure you want to archive this territory?')) return;
    try {
      await deleteTerritory(id);
      showToast('Territory archived successfully', 'success');
      loadTerritories();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to archive territory', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateForm();
    if (!validation) return;

    try {
      setSubmitting(true);
      const payload = {
        territory_name: form.territory_name.trim(),
        branch_id: Number(validation.branchId),
        coverage_area: form.coverage_area.trim(),
        assigned_users: selectedUsers.map((u) => u.user_id),
      };
      if (editing) {
        await updateTerritory(editing.territory_id, payload);
        showToast('Territory updated successfully', 'success');
      } else {
        await createTerritory(payload);
        showToast('Territory created successfully', 'success');
      }
      setShowForm(false);
      setEditing(null);
      setErrors({});
      loadTerritories();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save territory.';
      setErrors({ submit: message });
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const applyBranchSuggestion = (name) => {
    setSearch(name);
    setBranchSuggestionsOpen(false);
  };

  return (
    <div className="page-container">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Territories</h3>
        </div>
        <div className="list-section-toolbar">
          <p className="list-section-subtitle">Manage sales territories and coverage areas</p>
          <div className="list-section-actions territory-toolbar-actions">
            <div className="search-bar territory-branch-search" ref={searchRef}>
              <NavIcon name="search" />
              <input
                className="search-input"
                type="search"
                placeholder="Search by branch name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setBranchSuggestionsOpen(true);
                }}
                onFocus={() => setBranchSuggestionsOpen(true)}
                aria-label="Search territories by branch name"
                aria-autocomplete="list"
                aria-expanded={branchSuggestionsOpen && branchNameSuggestions.length > 0}
                autoComplete="off"
              />
              {branchSuggestionsOpen && branchNameSuggestions.length > 0 ? (
                <ul className="search-suggestions" role="listbox">
                  {branchNameSuggestions.map((name) => (
                    <li key={name} role="option">
                      <button
                        type="button"
                        className="search-suggestion-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyBranchSuggestion(name)}
                      >
                        <NavIcon name="search" />
                        <span>{name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button className="button" type="button" onClick={handleAdd}>Add Territory</button>
          </div>
        </div>

        <div className="corvex-table-wrapper">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Territory Name</th>
                <th>Branch</th>
                <th>Assigned User</th>
                <th>Role</th>
                <th>Coverage Area</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>Loading...</td></tr>
              ) : filteredTerritories.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}><EmptyState title="No territories found" /></td></tr>
              ) : (
                paginatedTerritories.map((t) => {
                  const assigned = getAssignedUsers(t);
                  return (
                    <tr key={t.territory_id}>
                      <td>{t.territory_id}</td>
                      <td>{t.territory_name}</td>
                      <td>{t.branch_name || `Branch #${t.branch_id}`}</td>
                      <td>
                        {assigned.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {assigned.map((u) => {
                              const name = formatPersonName(u);
                              return (
                                <span key={u.user_id || name} className="text-blue font-medium text-xs">
                                  {name || 'Unnamed user'}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-ink/50">Unassigned</span>
                        )}
                      </td>
                      <td>
                        {assigned.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {assigned.map((u) => (
                              <span key={`role-${u.user_id}`} className="text-xs">
                                {u.role_name || '—'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink/50">—</span>
                        )}
                      </td>
                      <td>{t.coverage_area || '—'}</td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Edit" onClick={() => handleEdit(t)}>
                          <NavIcon name="edit" />
                        </button>
                        <button className="icon-action-button danger" type="button" title="Archive" onClick={() => handleArchive(t.territory_id)}>
                          <NavIcon name="archive" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination {...pagination} />
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="territory-form-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <h3 id="territory-form-title">{editing ? 'Edit Territory' : 'Add Territory'}</h3>
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="territory-name">Territory Name <span aria-hidden="true">*</span></label>
                <input
                  id="territory-name"
                  type="text"
                  value={form.territory_name}
                  onChange={(e) => updateFormField('territory_name', e.target.value)}
                  placeholder="e.g. North District"
                  aria-invalid={Boolean(errors.territory_name)}
                  aria-describedby={errors.territory_name ? 'territory-name-error' : undefined}
                  autoFocus
                />
                {errors.territory_name && <p id="territory-name-error" className="form-error">{errors.territory_name}</p>}
              </div>

              {!isBranchManager && (
                <div className="form-group" ref={branchFieldRef}>
                  <label htmlFor="territory-branch">Branch <span aria-hidden="true">*</span></label>
                  <div className="search-bar territory-inline-search">
                    <NavIcon name="search" />
                    <input
                      id="territory-branch"
                      className="search-input"
                      type="text"
                      value={branchQuery}
                      onChange={(e) => {
                        setBranchQuery(e.target.value);
                        updateFormField('branch_id', '');
                        setBranchMenuOpen(true);
                      }}
                      onFocus={() => setBranchMenuOpen(true)}
                      placeholder="Search by branch name..."
                      aria-invalid={Boolean(errors.branch_id)}
                      aria-describedby={errors.branch_id ? 'territory-branch-error' : undefined}
                      aria-autocomplete="list"
                      autoComplete="off"
                    />
                    {branchMenuOpen && formBranchSuggestions.length > 0 ? (
                      <ul className="search-suggestions" role="listbox">
                        {formBranchSuggestions.map((branch) => (
                          <li key={branch.branch_id} role="option">
                            <button
                              type="button"
                              className="search-suggestion-item"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectBranch(branch)}
                            >
                              <span>{branch.branch_name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {errors.branch_id && <p id="territory-branch-error" className="form-error">{errors.branch_id}</p>}
                </div>
              )}

              <div className="form-group" ref={userFieldRef}>
                <label htmlFor="territory-users">Assigned User (Optional)</label>
                {selectedUsers.length > 0 ? (
                  <div className="territory-user-chips">
                    {selectedUsers.map((u) => (
                      <span key={u.user_id} className="territory-user-chip">
                        {u.user_name}
                        <button
                          type="button"
                          className="territory-user-chip-remove"
                          aria-label={`Remove ${u.user_name}`}
                          onClick={() => removeAssignedUser(u.user_id)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="search-bar territory-inline-search">
                  <NavIcon name="search" />
                  <input
                    id="territory-users"
                    className="search-input"
                    type="text"
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      setUserMenuOpen(true);
                    }}
                    onFocus={() => setUserMenuOpen(true)}
                    placeholder="Search by user name..."
                    aria-invalid={Boolean(errors.assigned_users)}
                    aria-describedby={errors.assigned_users ? 'territory-users-error' : undefined}
                    aria-autocomplete="list"
                    autoComplete="off"
                  />
                  {userMenuOpen && userSuggestions.length > 0 ? (
                    <ul className="search-suggestions" role="listbox">
                      {userSuggestions.map((user) => (
                        <li key={user.user_id} role="option">
                          <button
                            type="button"
                            className="search-suggestion-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addAssignedUser(user)}
                          >
                            <span>{user.user_name}</span>
                            <span className="search-suggestion-meta">{user.role_name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {errors.assigned_users && <p id="territory-users-error" className="form-error">{errors.assigned_users}</p>}
              </div>

              <div className="form-group">
                <label htmlFor="territory-coverage">Coverage Area (Optional)</label>
                <textarea
                  id="territory-coverage"
                  value={form.coverage_area}
                  onChange={(e) => updateFormField('coverage_area', e.target.value)}
                  placeholder="e.g. Specific barangays or zip codes"
                  rows={3}
                />
              </div>

              {errors.submit && <p className="form-error" role="alert">{errors.submit}</p>}

              <div className="modal-actions">
                <button type="button" className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" onClick={closeForm} disabled={submitting}>Cancel</button>
                <button type="submit" className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" disabled={submitting}>
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Add Territory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
