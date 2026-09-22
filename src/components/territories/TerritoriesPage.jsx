import { useEffect, useState } from 'react';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../shared/EmptyState';
import { fetchTerritories, createTerritory, updateTerritory, deleteTerritory } from '../../api/territoriesService';
import { getCurrentUser } from '../../api/authService';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../shared/Pagination';

export function TerritoriesPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [territories, setTerritories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const pagination = usePagination(territories);
  const paginatedTerritories = pagination.paginatedData;
  
  // The user might be an operating manager (branchId = null) or branch manager (branchId = X)
  const isBranchManager = !!currentUser?.branchId;
  const [form, setForm] = useState({
    territory_name: '',
    branch_id: isBranchManager ? currentUser.branchId : '',
    assigned_users: '',
    coverage_area: '',
  });

  const loadTerritories = async () => {
    try {
      setLoading(true);
      const data = await fetchTerritories({ search });
      if (data.success) {
        setTerritories(data.data);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load territories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadTerritories, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAdd = () => {
    setForm({
      territory_name: '',
      branch_id: isBranchManager ? currentUser.branchId : '',
      assigned_users: '',
      coverage_area: '',
    });
    setEditing(null);
    setErrors({});
    setShowForm(true);
  };

  const handleEdit = (t) => {
    setForm({
      territory_name: t.territory_name,
      branch_id: t.branch_id,
      assigned_users: t.assigned_users ? t.assigned_users.map(u => u.user_id).join(', ') : '',
      coverage_area: t.coverage_area || '',
    });
    setEditing(t);
    setErrors({});
    setShowForm(true);
  };

  const closeForm = () => {
    if (submitting) return;
    setShowForm(false);
    setEditing(null);
    setErrors({});
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

  const validateForm = () => {
    const nextErrors = {};
    const territoryName = form.territory_name.trim();
    const assignedUserIds = form.assigned_users
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!territoryName) {
      nextErrors.territory_name = 'Territory name is required.';
    }

    if (!isBranchManager && !form.branch_id) {
      nextErrors.branch_id = 'Branch is required.';
    } else if (!isBranchManager && (!Number.isInteger(Number(form.branch_id)) || Number(form.branch_id) <= 0)) {
      nextErrors.branch_id = 'Enter a valid positive branch ID.';
    }

    if (assignedUserIds.some((id) => !/^\d+$/.test(id) || Number(id) <= 0)) {
      nextErrors.assigned_users = 'Enter positive user IDs separated by commas.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const payload = {
        ...form,
        territory_name: form.territory_name.trim(),
        branch_id: Number(form.branch_id),
        coverage_area: form.coverage_area.trim(),
        assigned_users: form.assigned_users ? form.assigned_users.split(',').map(s => s.trim()).filter(Boolean) : []
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

  return (
    <div className="page-container">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Territories</h3>
        </div>
        <div className="list-section-toolbar">
          <p className="list-section-subtitle">Manage sales territories and coverage areas</p>
          <div className="list-section-actions territory-toolbar-actions">
            <div className="search-bar">
              <NavIcon name="search" />
              <input
                className="search-input"
                type="search"
                placeholder="Search territories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
              ) : territories.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center' }}><EmptyState title="No territories found" /></td></tr>
              ) : (
                paginatedTerritories.map(t => (
                  <tr key={t.territory_id}>
                    <td>{t.territory_id}</td>
                    <td>{t.territory_name}</td>
                    <td>{t.branch_name || `Branch #${t.branch_id}`}</td>
                    <td>
                      {t.assigned_users && t.assigned_users.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {t.assigned_users.map(u => (
                            <span key={u.user_id} className="text-blue font-medium text-xs">
                              {u.user_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-ink/50">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {t.assigned_users && t.assigned_users.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {t.assigned_users.map(u => (
                            <span key={u.user_id} className="text-xs">
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
                ))
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
                <div className="form-group">
                  <label htmlFor="territory-branch">Branch ID <span aria-hidden="true">*</span></label>
                  <input
                    id="territory-branch"
                    type="number"
                    min="1"
                    step="1"
                    value={form.branch_id}
                    onChange={(e) => updateFormField('branch_id', e.target.value)}
                    placeholder="Enter Branch ID"
                    aria-invalid={Boolean(errors.branch_id)}
                    aria-describedby={errors.branch_id ? 'territory-branch-error' : undefined}
                  />
                  {errors.branch_id && <p id="territory-branch-error" className="form-error">{errors.branch_id}</p>}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="territory-users">Assigned User IDs (Optional)</label>
                <input
                  id="territory-users"
                  type="text"
                  value={form.assigned_users}
                  onChange={(e) => updateFormField('assigned_users', e.target.value)}
                  placeholder="e.g. 1, 3, 5"
                  aria-invalid={Boolean(errors.assigned_users)}
                  aria-describedby={errors.assigned_users ? 'territory-users-error' : undefined}
                />
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
