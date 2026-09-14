import { useEffect, useState } from 'react';
import { NavIcon } from '../../navIcons';
import { EmptyState } from '../collector/EmptyState';
import { fetchTerritories, createTerritory, updateTerritory, deleteTerritory } from '../../api/territoriesService';
import { getCurrentUser } from '../../api/authService';

export function TerritoriesPage({ navigate, showToast }) {
  const currentUser = getCurrentUser();
  const [territories, setTerritories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  
  // The user might be an operating manager (branchId = null) or branch manager (branchId = X)
  const isBranchManager = !!currentUser?.branchId;
  const [form, setForm] = useState({
    territory_name: '',
    branch_id: isBranchManager ? currentUser.branchId : '',
    assigned_user: '',
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
      assigned_user: '',
      coverage_area: '',
    });
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (t) => {
    setForm({
      territory_name: t.territory_name,
      branch_id: t.branch_id,
      assigned_user: t.assigned_user || '',
      coverage_area: t.coverage_area || '',
    });
    setEditing(t);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this territory?')) return;
    try {
      await deleteTerritory(id);
      showToast('Territory deleted successfully', 'success');
      loadTerritories();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete territory', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.territory_name) return showToast('Territory name is required', 'error');
    if (!isBranchManager && !form.branch_id) return showToast('Branch is required', 'error');

    try {
      if (editing) {
        await updateTerritory(editing.territory_id, form);
        showToast('Territory updated successfully', 'success');
      } else {
        await createTerritory(form);
        showToast('Territory created successfully', 'success');
      }
      setShowForm(false);
      loadTerritories();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save territory', 'error');
    }
  };

  return (
    <div className="page-container">
      <header className="page-toolbar">
        <div className="page-toolbar-main">
          <div className="page-toolbar-actions">
            <button className="button" type="button" onClick={handleAdd}>Add Territory</button>
          </div>
        </div>
      </header>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Territories</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>
              Manage sales territories and coverage areas
            </p>
          </div>
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
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Territory Name</th>
                <th>Branch</th>
                <th>Assigned User</th>
                <th>Coverage Area</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center' }}>Loading...</td></tr>
              ) : territories.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center' }}><EmptyState title="No territories found" /></td></tr>
              ) : (
                territories.map(t => (
                  <tr key={t.territory_id}>
                    <td>{t.territory_id}</td>
                    <td>{t.territory_name}</td>
                    <td>{t.branch_name || `Branch #${t.branch_id}`}</td>
                    <td>{t.assigned_user_name || (t.assigned_user ? `User #${t.assigned_user}` : 'Unassigned')}</td>
                    <td>{t.coverage_area || '—'}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="Edit" onClick={() => handleEdit(t)}>
                        <NavIcon name="edit" />
                      </button>
                      <button className="icon-action-button" type="button" title="Delete" onClick={() => handleDelete(t.territory_id)}>
                        <NavIcon name="delete" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>{editing ? 'Edit Territory' : 'Add Territory'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Territory Name</label>
                <input
                  type="text"
                  value={form.territory_name}
                  onChange={(e) => setForm({ ...form, territory_name: e.target.value })}
                  placeholder="e.g. North District"
                />
              </div>

              {!isBranchManager && (
                <div className="form-group">
                  <label>Branch ID</label>
                  <input
                    type="number"
                    value={form.branch_id}
                    onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    placeholder="Enter Branch ID"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Assigned User ID (Optional)</label>
                <input
                  type="number"
                  value={form.assigned_user}
                  onChange={(e) => setForm({ ...form, assigned_user: e.target.value })}
                  placeholder="Enter User ID"
                />
              </div>

              <div className="form-group">
                <label>Coverage Area (Optional)</label>
                <textarea
                  value={form.coverage_area}
                  onChange={(e) => setForm({ ...form, coverage_area: e.target.value })}
                  placeholder="e.g. Specific barangays or zip codes"
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="button">{editing ? 'Save Changes' : 'Create Territory'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
