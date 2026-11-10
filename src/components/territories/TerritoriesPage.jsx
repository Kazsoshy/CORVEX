import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../shared/EmptyState';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';
import LeafletMap from '../common/LeafletMap';
import {
  fetchTerritories,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  fetchAssignableUsers,
} from '../../api/territoriesService';
import { getCurrentUser } from '../../api/authService';
import apiClient from '../../api/apiClient';

const DEFAULT_RADIUS = 800;
const DEFAULT_CENTER = [7.1907, 125.4553];

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

function getBranchLabel(branch) {
  return String(branch?.branch_name || branch?.name || '').trim();
}

function getBranchId(branch) {
  return branch?.branch_id ?? branch?.id ?? null;
}

function emptyForm(branchId = '') {
  return {
    territory_name: '',
    branch_id: branchId || '',
    status: 'Active',
    notes: '',
    latitude: '',
    longitude: '',
    radius_meters: String(DEFAULT_RADIUS),
    default_sales_agent_id: '',
    default_collector_id: '',
  };
}

export function TerritoriesPage({ showToast, navigate, opsBase }) {
  const currentUser = getCurrentUser();
  const userBranchId = currentUser?.branch?.id ?? currentUser?.branchId ?? null;
  const canListAllBranches = ['super_admin', 'operating_manager'].includes(currentUser?.role?.slug);
  const isBranchManager = userBranchId != null && currentUser?.role?.slug === 'branch_manager';

  const [territories, setTerritories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [salesAgents, setSalesAgents] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState(isBranchManager ? String(userBranchId) : '');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyForm(isBranchManager ? userBranchId : ''));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const lockedBranchId = isBranchManager ? userBranchId : null;

  async function loadTerritories() {
    try {
      setLoading(true);
      const params = { status: 'all' };
      if (canListAllBranches && branchFilter) params.branch_id = branchFilter;
      const data = await fetchTerritories(params);
      if (data.success) setTerritories(data.data || []);
      else showToast?.(data.message || 'Failed to load territories', 'error');
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to load territories', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadStaffForBranch(branchId) {
    if (!branchId) {
      setSalesAgents([]);
      setCollectors([]);
      return;
    }
    try {
      const [saRes, colRes] = await Promise.all([
        fetchAssignableUsers({ branch_id: branchId, role: 'sales_staff' }),
        fetchAssignableUsers({ branch_id: branchId, role: 'collector' }),
      ]);
      setSalesAgents(saRes?.success ? (saRes.data || []) : []);
      setCollectors(colRes?.success ? (colRes.data || []) : []);
    } catch {
      setSalesAgents([]);
      setCollectors([]);
    }
  }

  useEffect(() => {
    loadTerritories();
  }, [branchFilter]);

  useEffect(() => {
    let cancelled = false;
    async function loadBranches() {
      if (!canListAllBranches) return;
      try {
        const branchesRes = await apiClient.get('/branches');
        if (!cancelled && branchesRes.data?.success) {
          setBranches(branchesRes.data.data || []);
        }
      } catch {
        /* optional for BM */
      }
    }
    loadBranches();
    return () => { cancelled = true; };
  }, [canListAllBranches]);

  useEffect(() => {
    const branchId = form.branch_id || lockedBranchId;
    loadStaffForBranch(branchId);
  }, [form.branch_id, lockedBranchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (territories || []).filter((row) => {
      if (statusFilter !== 'all' && String(row.status || 'Active') !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.territory_name,
        row.branch_name,
        row.default_sales_agent_name,
        row.default_collector_name,
        row.coverage_area,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [territories, search, statusFilter]);

  const pagination = usePagination(filtered);

  const formBranchId = Number(form.branch_id || lockedBranchId) || null;
  const hasPin = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude));
  const mapCenter = hasPin ? [Number(form.latitude), Number(form.longitude)] : DEFAULT_CENTER;
  const mapMarkers = hasPin
    ? [{ id: 'territory-pin', position: mapCenter, label: 'T', color: '#1A4162', popup: form.territory_name || 'Territory center' }]
    : [];
  const mapCircles = hasPin
    ? [{
      id: 'territory-radius',
      center: mapCenter,
      radius: Number(form.radius_meters) || DEFAULT_RADIUS,
      color: '#1A4162',
      fillOpacity: 0.14,
      popup: 'Approximate Territory Coverage',
    }]
    : [];

  function openCreate() {
    setEditing(null);
    setErrors({});
    setForm(emptyForm(lockedBranchId || branchFilter || ''));
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setErrors({});
    setForm({
      territory_name: row.territory_name || '',
      branch_id: row.branch_id || '',
      status: row.status || 'Active',
      notes: row.coverage_area || '',
      latitude: row.latitude != null ? String(row.latitude) : '',
      longitude: row.longitude != null ? String(row.longitude) : '',
      radius_meters: String(row.radius_meters || DEFAULT_RADIUS),
      default_sales_agent_id: row.default_sales_agent_id != null ? String(row.default_sales_agent_id) : '',
      default_collector_id: row.default_collector_id != null ? String(row.default_collector_id) : '',
    });
    setShowForm(true);
  }

  function validateClient() {
    const next = {};
    if (!String(form.territory_name || '').trim()) next.territory_name = 'Required';
    const branchId = lockedBranchId || form.branch_id;
    if (!branchId) next.branch_id = 'Required';
    if (form.status === 'Active') {
      if (!Number.isFinite(Number(form.latitude))) next.latitude = 'Required for Active territories';
      if (!Number.isFinite(Number(form.longitude))) next.longitude = 'Required for Active territories';
      if (!form.default_sales_agent_id) next.default_sales_agent_id = 'Required for Active territories';
      if (!form.default_collector_id) next.default_collector_id = 'Required for Active territories';
    }
    const radius = Number(form.radius_meters);
    if (!Number.isFinite(radius) || radius < 100 || radius > 20000) {
      next.radius_meters = 'Radius must be 100–20000 meters';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validateClient()) {
      showToast?.('Complete the required territory fields.', 'error');
      return;
    }
    const payload = {
      territory_name: form.territory_name.trim(),
      branch_id: Number(lockedBranchId || form.branch_id),
      status: form.status,
      notes: form.notes.trim() || null,
      coverage_area: form.notes.trim() || null,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      radius_meters: Number(form.radius_meters) || DEFAULT_RADIUS,
      default_sales_agent_id: form.default_sales_agent_id ? Number(form.default_sales_agent_id) : null,
      default_collector_id: form.default_collector_id ? Number(form.default_collector_id) : null,
    };

    setSubmitting(true);
    try {
      const result = editing
        ? await updateTerritory(editing.territory_id, payload)
        : await createTerritory(payload);
      if (!result.success) {
        showToast?.(result.message || 'Failed to save territory.', 'error');
        return;
      }
      showToast?.(result.message || (editing ? 'Territory updated.' : 'Territory created.'), 'success');
      setShowForm(false);
      setEditing(null);
      await loadTerritories();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to save territory.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(row) {
    if (!window.confirm(`Deactivate “${row.territory_name}”? It will leave historical records intact but cannot receive new assignments.`)) {
      return;
    }
    try {
      const result = await deleteTerritory(row.territory_id);
      if (!result.success) {
        showToast?.(result.message || 'Failed to deactivate territory.', 'error');
        return;
      }
      showToast?.(result.message || 'Territory deactivated.', 'success');
      await loadTerritories();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Failed to deactivate territory.', 'error');
    }
  }

  function openCustomers(row) {
    if (!navigate || !opsBase) return;
    navigate(`${opsBase}/customers?territory=${encodeURIComponent(row.territory_id)}`);
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="list-section-header">
          <div>
            <h3>Branch Territories</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Define your branch&apos;s permanent coverage zones and their assigned Sales Agents and Collectors.
            </p>
          </div>
          <button className="button" type="button" onClick={openCreate}>
            New Territory
          </button>
        </div>

        <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="filter-input"
            type="search"
            placeholder="Search territory, staff, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          {canListAllBranches ? (
            <select
              className="filter-select"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="Branch filter"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={getBranchId(branch)} value={getBranchId(branch)}>
                  {getBranchLabel(branch)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      {showForm ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <div>
              <h3>{editing ? 'Edit Territory' : 'Create Territory'}</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Permanent coverage zone — not a daily dispatch schedule.
              </p>
            </div>
            <button className="button secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>

          <h4 className="subsection-title">Territory Information</h4>
          <div className="account-detail-grid two-up">
            <div className="form-group">
              <label htmlFor="terr-name">Territory Name *</label>
              <input
                id="terr-name"
                value={form.territory_name}
                onChange={(e) => setForm((prev) => ({ ...prev, territory_name: e.target.value }))}
              />
              {errors.territory_name ? <p className="form-error">{errors.territory_name}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="terr-branch">Branch *</label>
              {isBranchManager ? (
                <input
                  id="terr-branch"
                  value={currentUser?.branch?.name || `Branch #${userBranchId}`}
                  disabled
                />
              ) : (
                <select
                  id="terr-branch"
                  className="filter-select"
                  value={form.branch_id}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    branch_id: e.target.value,
                    default_sales_agent_id: '',
                    default_collector_id: '',
                  }))}
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={getBranchId(branch)} value={getBranchId(branch)}>
                      {getBranchLabel(branch)}
                    </option>
                  ))}
                </select>
              )}
              {errors.branch_id ? <p className="form-error">{errors.branch_id}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="terr-status">Status *</label>
              <select
                id="terr-status"
                className="filter-select"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="terr-notes">Notes</label>
              <textarea
                id="terr-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Operational instructions for this coverage zone"
              />
            </div>
          </div>

          <h4 className="subsection-title">Geographic Coverage</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            Click the map to set the territory center. The circle is approximate operational coverage — not a surveyed boundary.
          </p>
          <div style={{ height: 320, marginBottom: 12, borderRadius: 8, overflow: 'hidden' }}>
            <LeafletMap
              center={mapCenter}
              zoom={hasPin ? 14 : 12}
              markers={mapMarkers}
              circles={mapCircles}
              onMapClick={({ lat, lng }) => {
                setForm((prev) => ({
                  ...prev,
                  latitude: String(Number(lat.toFixed(7))),
                  longitude: String(Number(lng.toFixed(7))),
                }));
              }}
            />
          </div>
          <div className="account-detail-grid two-up">
            <div className="form-group">
              <label htmlFor="terr-lat">Latitude *</label>
              <input
                id="terr-lat"
                value={form.latitude}
                onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))}
              />
              {errors.latitude ? <p className="form-error">{errors.latitude}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="terr-lng">Longitude *</label>
              <input
                id="terr-lng"
                value={form.longitude}
                onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))}
              />
              {errors.longitude ? <p className="form-error">{errors.longitude}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="terr-radius">Coverage Radius (meters) *</label>
              <input
                id="terr-radius"
                type="number"
                min={100}
                max={20000}
                step={50}
                value={form.radius_meters}
                onChange={(e) => setForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
              />
              {errors.radius_meters ? <p className="form-error">{errors.radius_meters}</p> : null}
            </div>
          </div>

          <h4 className="subsection-title">Default Personnel</h4>
          <div className="account-detail-grid two-up">
            <div className="form-group">
              <label htmlFor="terr-sa">Default Sales Agent *</label>
              <select
                id="terr-sa"
                className="filter-select"
                value={form.default_sales_agent_id}
                onChange={(e) => setForm((prev) => ({ ...prev, default_sales_agent_id: e.target.value }))}
                disabled={!formBranchId}
              >
                <option value="">Select Sales Agent</option>
                {salesAgents.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {formatPersonName(user) || `User #${user.user_id}`}
                  </option>
                ))}
              </select>
              {errors.default_sales_agent_id ? <p className="form-error">{errors.default_sales_agent_id}</p> : null}
            </div>
            <div className="form-group">
              <label htmlFor="terr-col">Default Collector *</label>
              <select
                id="terr-col"
                className="filter-select"
                value={form.default_collector_id}
                onChange={(e) => setForm((prev) => ({ ...prev, default_collector_id: e.target.value }))}
                disabled={!formBranchId}
              >
                <option value="">Select Collector</option>
                {collectors.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {formatPersonName(user) || `User #${user.user_id}`}
                  </option>
                ))}
              </select>
              {errors.default_collector_id ? <p className="form-error">{errors.default_collector_id}</p> : null}
            </div>
          </div>

          <div className="flex gap-2" style={{ marginTop: 16 }}>
            <button className="button" type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Saving…' : (editing ? 'Save Changes' : 'Create Territory')}
            </button>
            <button className="button secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        {loading ? (
          <p className="muted">Loading territories…</p>
        ) : !filtered.length ? (
          <EmptyState
            title="No territories found"
            description="Create an Active territory with a map pin, coverage radius, and default Sales Agent / Collector."
            actionLabel="New Territory"
            onAction={openCreate}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Territory</th>
                    {canListAllBranches ? <th>Branch</th> : null}
                    <th>Default Sales Agent</th>
                    <th>Default Collector</th>
                    <th>Customers</th>
                    <th>Coverage</th>
                    <th>Map Location</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((row) => (
                    <tr key={row.territory_id}>
                      <td>
                        <strong>{row.territory_name}</strong>
                        {row.coverage_area ? (
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.coverage_area}</div>
                        ) : null}
                      </td>
                      {canListAllBranches ? <td>{row.branch_name || '—'}</td> : null}
                      <td>{row.default_sales_agent_name || '—'}</td>
                      <td>{row.default_collector_name || '—'}</td>
                      <td>
                        {navigate && opsBase ? (
                          <button
                            type="button"
                            className="button ghost"
                            style={{ padding: 0 }}
                            onClick={() => openCustomers(row)}
                          >
                            {row.customer_count ?? 0}
                          </button>
                        ) : (row.customer_count ?? 0)}
                      </td>
                      <td>{row.radius_meters ? `${row.radius_meters} m` : '—'}</td>
                      <td>{row.map_location || (row.latitude != null ? 'Pin Set' : 'Missing')}</td>
                      <td><StatusBadge status={row.status || 'Active'} /></td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button className="button secondary" type="button" onClick={() => openEdit(row)}>Edit</button>
                          {String(row.status || 'Active') === 'Active' ? (
                            <button className="button ghost" type="button" onClick={() => handleDeactivate(row)}>
                              Deactivate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        )}
      </section>
    </div>
  );
}
