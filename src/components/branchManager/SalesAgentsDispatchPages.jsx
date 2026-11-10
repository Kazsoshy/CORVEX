import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Stats } from '../shared/StatsGrid';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { formatCurrency, formatDisplayDate, formatPhone } from '../../data/branchManagerMockData';
import { getCurrentUser } from '../../api/authService.js';
import { fetchTerritories } from '../../api/territoriesService.js';
import {
  getBranchStaff,
  getBranchSalesAgentDetail,
  getSalesAgentAreaAssignments,
  assignSalesAgentArea,
  fetchBranchProducts,
} from '../../api/branchManagerService.js';

function manilaDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isOrgScopeUser(user) {
  return ['operating_manager', 'super_admin'].includes(user?.role?.slug);
}

function productLabel(product) {
  return product?.name || product?.product_name || `Product #${product?.id || product?.product_id}`;
}

export function SalesAgentsDispatchRoster({ navigate, opsBase, showToast }) {
  const currentUser = getCurrentUser();
  const orgScope = isOrgScopeUser(currentUser);
  const [dispatchDate, setDispatchDate] = useState(manilaDateInputValue);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [workStatus, setWorkStatus] = useState('all');
  const [activeStatus, setActiveStatus] = useState('Active');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getBranchStaff({ date: dispatchDate });
      if (cancelled) return;
      if (result.success) setAgents(result.data?.salesAgents || []);
      else {
        setAgents([]);
        showToast?.('Failed to load sales agents.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dispatchDate, showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (agents || []).filter((a) => {
      if (activeStatus !== 'all' && String(a.status || 'Active') !== activeStatus) return false;
      if (workStatus !== 'all' && String(a.workStatus || 'No Assignment') !== workStatus) return false;
      if (areaFilter === 'has' && !(Number(a.areasAssignedToday) > 0)) return false;
      if (areaFilter === 'none' && Number(a.areasAssignedToday) > 0) return false;
      if (!q) return true;
      const hay = [a.name, a.email, a.employeeCode, a.phone, a.branchName]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [agents, search, areaFilter, workStatus, activeStatus]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  if (loading) return <LoadingState variant="dashboard" message="Loading sales agent dispatch roster..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Sales Agents</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {orgScope
                ? 'Manage Sales Agents across branches and assign daily canvassing areas.'
                : `Manage Sales Agents for ${currentUser?.branch?.name || 'your branch'} and assign their daily canvassing areas.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="flex flex-col gap-1 text-sm">
            Work date
            <input type="date" className="input" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm" style={{ minWidth: 220 }}>
            Search
            <input
              className="input"
              placeholder="Name, employee ID, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Area today
            <select className="filter-select" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="has">Has Area Today</option>
              <option value="none">No Area Today</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Work status
            <select className="filter-select" value={workStatus} onChange={(e) => setWorkStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="No Assignment">No Assignment</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Account status
            <select className="filter-select" value={activeStatus} onChange={(e) => setActiveStatus(e.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {!filtered.length ? (
          <EmptyState
            title="No Sales Agents are currently registered under your branch"
            description={orgScope
              ? 'No sales agents match the current filters.'
              : 'Contact the Operating Manager to create a Sales Agent account.'}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Sales Agent</th>
                    <th>Employee Information</th>
                    <th>Contact</th>
                    {orgScope ? <th>Branch</th> : null}
                    <th>Owned Customers</th>
                    <th>Areas Assigned</th>
                    <th>Work Status</th>
                    <th>Sales Today</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      className="clickable-row"
                      onClick={() => navigate(`${opsBase}/field-operations/sales/${a.id}?date=${encodeURIComponent(dispatchDate)}`)}
                    >
                      <td><strong>{a.name}</strong></td>
                      <td>
                        <div>{a.employeeCode || '—'}</div>
                        <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{a.email || '—'}</div>
                      </td>
                      <td>{a.phone ? formatPhone(a.phone) : '—'}</td>
                      {orgScope ? <td>{a.branchName || '—'}</td> : null}
                      <td>{a.ownedCustomers ?? a.customersAssigned ?? 0}</td>
                      <td>{a.areasAssignedToday ?? 0}</td>
                      <td><StatusBadge status={a.workStatus || 'No Assignment'} /></td>
                      <td>
                        {(a.salesTodayCount ?? 0) > 0
                          ? `${a.salesTodayCount} · ${formatCurrency(a.salesTodayAmount || 0)}`
                          : '—'}
                      </td>
                      <td><StatusBadge status={a.status || 'Active'} /></td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => navigate(`${opsBase}/field-operations/sales/${a.id}?date=${encodeURIComponent(dispatchDate)}`)}
                        >
                          Open Dispatch
                        </button>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View on Field Map"
                          onClick={() => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(a.id)}`)}
                        >
                          <NavIcon name="map" />
                        </button>
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

export function SalesAgentDispatchDetailPage({
  agentId,
  navigate,
  opsBase,
  showToast,
}) {
  const searchDate = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('date')
    : null;
  const [workDate, setWorkDate] = useState(searchDate || manilaDateInputValue());
  const [detail, setDetail] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [form, setForm] = useState({
    territory_id: '',
    area_name: '',
    work_date: searchDate || manilaDateInputValue(),
    coverage_notes: '',
    product_ids: [],
    latitude: '',
    longitude: '',
    radius_meters: '800',
    confirm_spatial_overlap: false,
  });

  async function reload(date) {
    if (!agentId) {
      setDetail(null);
      setLoadError('Missing sales agent id.');
      return;
    }
    const [detailResult, assignmentResult] = await Promise.all([
      getBranchSalesAgentDetail(agentId, { work_date: date }),
      getSalesAgentAreaAssignments(agentId),
    ]);
    if (detailResult.success) {
      setDetail(detailResult.data);
      setLoadError(null);
    } else {
      setDetail(null);
      setLoadError(detailResult.message || 'Sales agent detail could not be loaded.');
    }
    if (assignmentResult.success) setAssignments(assignmentResult.data || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [territoryResult, productResult] = await Promise.all([
        fetchTerritories({}),
        fetchBranchProducts({ limit: 100 }),
      ]);
      if (!cancelled) {
        if (territoryResult?.success) setTerritories(territoryResult.data || []);
        else if (Array.isArray(territoryResult)) setTerritories(territoryResult);
        else if (Array.isArray(territoryResult?.data)) setTerritories(territoryResult.data);
        else setTerritories([]);

        const productRows = productResult?.data || productResult?.products || [];
        setProducts(Array.isArray(productRows)
          ? productRows.map((row) => ({
            ...row,
            id: row.id ?? row.product_id,
            name: row.name || row.product_name,
          }))
          : []);
      }
      await reload(workDate);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, workDate]);

  const profile = detail?.profile;
  const todayAreas = detail?.areas || [];
  const dispatchStats = detail?.dispatchStats || {};
  const customerBook = detail?.customerBook || [];
  const paginationAreas = usePagination(todayAreas);
  const paginationHistory = usePagination(assignments);
  const paginationCustomers = usePagination(customerBook);

  const branchTerritories = useMemo(() => {
    if (!profile?.branchId) return territories;
    return (territories || []).filter((t) => (
      t.branch_id == null || Number(t.branch_id) === Number(profile.branchId)
    ));
  }, [territories, profile?.branchId]);

  const mapCenter = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude))
    ? [Number(form.latitude), Number(form.longitude)]
    : [7.1907, 125.4553];
  const formHasPin = Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude));

  function handleTerritoryChange(territoryId) {
    const territory = branchTerritories.find((t) => String(t.territory_id) === String(territoryId));
    setForm((prev) => ({
      ...prev,
      territory_id: territoryId,
      area_name: territory?.territory_name || prev.area_name,
      coverage_notes: territory?.coverage_area || prev.coverage_notes,
      latitude: territory?.latitude != null ? String(territory.latitude) : prev.latitude,
      longitude: territory?.longitude != null ? String(territory.longitude) : prev.longitude,
      radius_meters: territory?.radius_meters != null ? String(territory.radius_meters) : prev.radius_meters,
    }));
  }

  function toggleProduct(productId) {
    const id = Number(productId);
    setForm((prev) => {
      const set = new Set(prev.product_ids.map(Number));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, product_ids: [...set] };
    });
  }

  async function handleAssign({ confirmSpatial = false, confirmOwnerException = false } = {}) {
    if (!form.work_date) {
      showToast?.('Work date is required.', 'error');
      return;
    }
    if (!form.territory_id && !form.area_name.trim()) {
      showToast?.('Choose an Active territory (preferred) or enter an exception area name.', 'error');
      return;
    }
    const lat = form.latitude === '' ? null : Number(form.latitude);
    const lng = form.longitude === '' ? null : Number(form.longitude);
    if ((form.latitude !== '' || form.longitude !== '')
      && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      showToast?.('Enter both latitude and longitude, or clear both.', 'error');
      return;
    }

    setAssigning(true);
    const result = await assignSalesAgentArea(agentId, {
      territory_id: form.territory_id ? Number(form.territory_id) : undefined,
      area_name: form.area_name.trim() || undefined,
      work_date: form.work_date,
      coverage_notes: form.coverage_notes.trim() || undefined,
      product_ids: form.product_ids.map(Number),
      latitude: lat,
      longitude: lng,
      radius_meters: Number(form.radius_meters) || 800,
      confirm_spatial_overlap: confirmSpatial || form.confirm_spatial_overlap,
      confirm_default_owner_exception: confirmOwnerException,
    });
    setAssigning(false);

    if (!result.success) {
      if (result.data?.requiresDefaultOwnerConfirmation) {
        const proceed = window.confirm(`${result.message}\n\nAssign this Sales Agent for the work date only? (Does not change permanent territory ownership.)`);
        if (proceed) {
          await handleAssign({ confirmSpatial, confirmOwnerException: true });
        }
        return;
      }
      if (result.data?.requiresConfirmation) {
        const proceed = window.confirm(`${result.message}\n\nCreate the assignment anyway?`);
        if (proceed) {
          await handleAssign({ confirmSpatial: true, confirmOwnerException });
        }
        return;
      }
      showToast?.(result.message || 'Failed to assign area.', 'error');
      return;
    }

    showToast?.(result.message || 'Area assigned.', 'success');
    if (result.meta && result.meta.hasMapLocation === false) {
      showToast?.('Assignment saved without a map location.', 'info');
    }
    setForm((prev) => ({
      ...prev,
      coverage_notes: '',
      product_ids: [],
      latitude: '',
      longitude: '',
      confirm_spatial_overlap: false,
      area_name: prev.territory_id
        ? (branchTerritories.find((t) => String(t.territory_id) === String(prev.territory_id))?.territory_name || '')
        : '',
    }));
    if (form.work_date !== workDate) setWorkDate(form.work_date);
    else await reload(workDate);
  }

  if (loading) return <LoadingState variant="detail" message="Loading sales agent dispatch..." />;
  if (!profile) {
    return (
      <EmptyState
        title="Sales agent not found"
        description={loadError || 'This sales agent is not available for your branch.'}
        actionLabel="Back"
        onAction={() => navigate(`${opsBase}/field-operations/sales`)}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start">
          <div>
            <h3>{profile.name}</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Operational profile for canvassing area dispatch — not an HR record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              Work date
              <input
                type="date"
                className="input"
                value={workDate}
                onChange={(e) => {
                  setWorkDate(e.target.value);
                  setForm((prev) => ({ ...prev, work_date: e.target.value }));
                }}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(agentId)}`)}
            >
              View on Field Map
            </button>
          </div>
        </div>
        <div className="corvex-table-wrapper" style={{ marginTop: 16 }}>
          <table className="corvex-table">
            <tbody>
              <tr><th>Full Name</th><td>{profile.name}</td></tr>
              <tr><th>Employee ID</th><td>{profile.employeeCode || '—'}</td></tr>
              <tr><th>Email</th><td>{profile.email || '—'}</td></tr>
              <tr><th>Phone Number</th><td>{profile.phone ? formatPhone(profile.phone) : '—'}</td></tr>
              <tr><th>Account Status</th><td><StatusBadge status={profile.status || 'Active'} /></td></tr>
              <tr><th>Branch</th><td>{profile.branchName || '—'}</td></tr>
              <tr><th>Date Joined</th><td>{profile.joinedAt ? formatDisplayDate(profile.joinedAt) : '—'}</td></tr>
              <tr>
                <th>Owned Customers</th>
                <td>
                  {profile.ownedCustomers ?? 0}
                  <span className="text-ink/70"> (permanent book via assigned sales agent)</span>
                </td>
              </tr>
              <tr><th>Work Status</th><td><StatusBadge status={profile.workStatus || 'No Assignment'} /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <Stats stats={[
        { label: 'Areas Assigned', value: String(dispatchStats.areasAssigned ?? todayAreas.length ?? 0) },
        { label: 'Areas Completed', value: String(dispatchStats.areasCompleted ?? 0) },
        { label: 'Areas In Progress', value: String(dispatchStats.areasInProgress ?? 0) },
        { label: 'Field Reports', value: String(dispatchStats.fieldReports ?? 0) },
        { label: 'Products to Push', value: String(dispatchStats.productsAssigned ?? 0) },
        { label: 'Areas with Map Pin', value: String(dispatchStats.areasWithMapLocation ?? 0) },
        {
          label: 'Sales Logged Today',
          value: (dispatchStats.salesLoggedToday ?? 0) > 0
            ? `${dispatchStats.salesLoggedToday} · ${formatCurrency(dispatchStats.salesAmountToday || 0)}`
            : '0',
        },
      ]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Assign Canvass Area</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Tell this Sales Agent where to work, which products to promote, and the map location for the area.
            </p>
          </div>
        </div>

        <div className="list-section-controls" style={{ flexWrap: 'wrap', gap: 8 }}>
          <select
            className="filter-select"
            value={form.territory_id}
            onChange={(e) => handleTerritoryChange(e.target.value)}
            aria-label="Territory"
          >
            <option value="">Select Active territory</option>
            {branchTerritories.filter((t) => String(t.status || 'Active') === 'Active').map((t) => (
              <option key={t.territory_id} value={t.territory_id}>
                {t.territory_name}
                {t.default_sales_agent_name ? ` · Default SA: ${t.default_sales_agent_name}` : ''}
              </option>
            ))}
          </select>
          <input
            className="filter-input"
            type="text"
            placeholder="Area / location name"
            value={form.area_name}
            onChange={(e) => setForm((prev) => ({ ...prev, area_name: e.target.value }))}
          />
          <input
            className="filter-input"
            type="date"
            value={form.work_date}
            onChange={(e) => setForm((prev) => ({ ...prev, work_date: e.target.value }))}
          />
          <input
            className="filter-input"
            type="number"
            min={100}
            max={20000}
            step={50}
            placeholder="Radius (m)"
            value={form.radius_meters}
            onChange={(e) => setForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
            aria-label="Coverage radius meters"
          />
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <label htmlFor={`area-notes-${agentId}`}>Assignment notes</label>
          <textarea
            id={`area-notes-${agentId}`}
            rows={2}
            placeholder="Canvassing objectives, target customer types, reminders…"
            value={form.coverage_notes}
            onChange={(e) => setForm((prev) => ({ ...prev, coverage_notes: e.target.value }))}
          />
        </div>

        <div className="form-group" style={{ marginTop: 8 }}>
          <label>Products to push</label>
          {products.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 180, overflow: 'auto', padding: 8, border: '1px solid #E2E8F0', borderRadius: 8 }}>
              {products.map((product) => {
                const id = Number(product.id || product.product_id);
                return (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.product_ids.map(Number).includes(id)}
                      onChange={() => toggleProduct(id)}
                    />
                    <span>{productLabel(product)}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="muted">No active products available to assign.</p>
          )}
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Map location</label>
          <p className="muted" style={{ marginTop: 0 }}>
            Click the map to set the canvassing pin. Leave empty for &quot;No map location assigned.&quot; The branch depot is not used as a silent substitute.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <input
              className="filter-input"
              type="number"
              step="any"
              placeholder="Latitude"
              value={form.latitude}
              onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))}
            />
            <input
              className="filter-input"
              type="number"
              step="any"
              placeholder="Longitude"
              value={form.longitude}
              onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))}
            />
            <button
              className="button ghost"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, latitude: '', longitude: '' }))}
            >
              Clear pin
            </button>
          </div>
          <LeafletMap
            center={mapCenter}
            zoom={13}
            height={280}
            onMapClick={({ lat, lng }) => setForm((prev) => ({
              ...prev,
              latitude: String(Number(lat).toFixed(7)),
              longitude: String(Number(lng).toFixed(7)),
            }))}
            markers={formHasPin ? [{
              id: 'draft-pin',
              position: [Number(form.latitude), Number(form.longitude)],
              label: 'A',
              color: '#153450',
              popup: 'Proposed canvassing location',
            }] : []}
            circles={formHasPin ? [{
              id: 'draft-radius',
              center: [Number(form.latitude), Number(form.longitude)],
              radius: Number(form.radius_meters) || 800,
              color: '#153450',
            }] : []}
          />
          {!formHasPin ? <p className="muted" style={{ marginTop: 8 }}>No map location assigned.</p> : null}
        </div>

        <div className="flex justify-end mt-3">
          <button className="button" type="button" disabled={assigning} onClick={() => handleAssign()}>
            {assigning ? 'Assigning…' : 'Assign Area'}
          </button>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Areas for {formatDisplayDate(workDate)} <span className="text-ink/70">({todayAreas.length})</span></h3>
        </div>
        {todayAreas.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Area / Territory</th>
                    <th>Work Date</th>
                    <th>Products</th>
                    <th>Map Location</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationAreas.paginatedData.map((row) => {
                    const hasPin = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
                    return (
                      <tr key={row.assignment_id}>
                        <td>
                          <strong>{row.area_name}</strong>
                          {row.territory_name ? <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.territory_name}</div> : null}
                        </td>
                        <td>{formatDisplayDate(row.work_date)}</td>
                        <td>
                          {(row.products_to_push || []).length
                            ? (row.products_to_push || []).map((p) => p.product_name).join(', ')
                            : '—'}
                        </td>
                        <td>{hasPin ? 'Has Map Pin' : 'No Map Location'}</td>
                        <td><StatusBadge status={row.status} /></td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.coverage_notes || ''}>
                          {row.coverage_notes || '—'}
                        </td>
                        <td>
                          <button className="button ghost" type="button" onClick={() => setSelectedAssignment(row)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationAreas} />
          </>
        ) : (
          <EmptyState
            title="No area assignments for this date"
            description="Assign a territory or area so this Sales Agent can canvass."
          />
        )}
      </section>

      {selectedAssignment ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex justify-between gap-4 items-start mb-3">
            <div>
              <h3>Assignment Details</h3>
              <p className="muted" style={{ marginTop: 4 }}>Same record the Sales Agent sees on Today&apos;s Schedule.</p>
            </div>
            <button className="button ghost" type="button" onClick={() => setSelectedAssignment(null)}>Close</button>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <tbody>
                <tr><th>Area</th><td>{selectedAssignment.area_name}</td></tr>
                <tr><th>Territory</th><td>{selectedAssignment.territory_name || '—'}</td></tr>
                <tr><th>Work Date</th><td>{formatDisplayDate(selectedAssignment.work_date)}</td></tr>
                <tr><th>Status</th><td><StatusBadge status={selectedAssignment.status} /></td></tr>
                <tr><th>Notes</th><td>{selectedAssignment.coverage_notes || '—'}</td></tr>
                <tr>
                  <th>Products</th>
                  <td>
                    {(selectedAssignment.products_to_push || []).length
                      ? (selectedAssignment.products_to_push || []).map((p) => p.product_name).join(', ')
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th>Map Location</th>
                  <td>
                    {Number.isFinite(Number(selectedAssignment.latitude)) && Number.isFinite(Number(selectedAssignment.longitude))
                      ? `${selectedAssignment.latitude}, ${selectedAssignment.longitude} · ${selectedAssignment.radius_meters || 800} m`
                      : 'No map location assigned.'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {Number.isFinite(Number(selectedAssignment.latitude)) && Number.isFinite(Number(selectedAssignment.longitude)) ? (
            <div style={{ marginTop: 12 }}>
              <LeafletMap
                center={[Number(selectedAssignment.latitude), Number(selectedAssignment.longitude)]}
                zoom={14}
                height={260}
                markers={[{
                  id: `assign-${selectedAssignment.assignment_id}`,
                  position: [Number(selectedAssignment.latitude), Number(selectedAssignment.longitude)],
                  label: 'A',
                  color: '#153450',
                  popup: selectedAssignment.area_name,
                }]}
                circles={[{
                  id: `radius-${selectedAssignment.assignment_id}`,
                  center: [Number(selectedAssignment.latitude), Number(selectedAssignment.longitude)],
                  radius: Number(selectedAssignment.radius_meters) || 800,
                  color: '#153450',
                }]}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Assignment History <span className="text-ink/70">({assignments.length})</span></h3>
        </div>
        {assignments.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Area / Territory</th>
                    <th>Work Date</th>
                    <th>Products</th>
                    <th>Map Location</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationHistory.paginatedData.map((row) => (
                    <tr key={`hist-${row.assignment_id}`} className="clickable-row" onClick={() => setSelectedAssignment(row)}>
                      <td><strong>{row.area_name}</strong></td>
                      <td>{formatDisplayDate(row.work_date)}</td>
                      <td>
                        {(row.products_to_push || []).length
                          ? (row.products_to_push || []).map((p) => p.product_name).join(', ')
                          : '—'}
                      </td>
                      <td>
                        {Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
                          ? 'Has Map Pin'
                          : 'No Map Location'}
                      </td>
                      <td><StatusBadge status={row.status} /></td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.coverage_notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationHistory} />
          </>
        ) : (
          <EmptyState title="No assignment history" description="Published area assignments will appear here." />
        )}
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Customer Book <span className="text-ink/70">({customerBook.length})</span></h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Permanent customers assigned to this Sales Agent. This is separate from daily canvassing areas.
            </p>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate(`${opsBase}/customers`)}
          >
            Open Customers
          </button>
        </div>
        {customerBook.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Code</th>
                    <th>Contact</th>
                    <th>Address / Area</th>
                    <th>Outstanding</th>
                    <th>Standing</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationCustomers.paginatedData.map((c) => (
                    <tr key={c.customerId}>
                      <td><strong>{c.customerName}</strong></td>
                      <td>{c.customerCode || '—'}</td>
                      <td>{c.contactPhone ? formatPhone(c.contactPhone) : '—'}</td>
                      <td>
                        <div>{c.address || '—'}</div>
                        {c.territoryName ? <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{c.territoryName}</div> : null}
                      </td>
                      <td>{formatCurrency(c.outstandingBalance || 0)}</td>
                      <td><StatusBadge status={c.paymentStanding || 'Current'} /></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => navigate(`${opsBase}/customers/${c.customerId}`)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationCustomers} />
          </>
        ) : (
          <EmptyState
            title="No permanently assigned customers"
            description="Customers created or assigned to this agent will appear in the customer book."
          />
        )}
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations/sales`)}>
          Back to Sales Agents
        </button>
      </div>
    </div>
  );
}
