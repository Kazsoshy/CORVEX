import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { RowActionsMenu } from '../shared/RowActionMenu';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';
import LeafletMap from '../common/LeafletMap';
import { formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../utils/formatters.js';
import { getCurrentUser } from '../../api/authService.js';
import { fetchTerritories } from '../../api/territoriesService.js';
import {
  getBranchStaff,
  getBranchSalesAgentDetail,
  getSalesAreaAssignmentHistory,
  assignSalesAgentArea,
  updateSalesAgentAreaAssignment,
} from '../../api/branchManagerService.js';

const DAVAO_CENTER = [7.1907, 125.4553];

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

function parseCoord(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapCenterFromPin(latitude, longitude, fallback = DAVAO_CENTER) {
  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  if (lat == null || lng == null) return fallback;
  if (lat === 0 && lng === 0) return fallback;
  return [lat, lng];
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const ROSTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'Unassigned', label: 'Unassigned' },
  { key: 'Assigned', label: 'Assigned' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Needs Attention', label: 'Needs Attention' },
  { key: 'Not Started', label: 'Not Started' },
  { key: 'Incomplete', label: 'Incomplete' },
];

export function SalesAgentsDispatchRoster({ navigate, opsBase, showToast }) {
  const currentUser = getCurrentUser();
  const orgScope = isOrgScopeUser(currentUser);
  const [dispatchDate, setDispatchDate] = useState(manilaDateInputValue);
  const [agents, setAgents] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [activeStatus, setActiveStatus] = useState('Active');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [staffResult, territoryResult] = await Promise.all([
        getBranchStaff({ date: dispatchDate }),
        fetchTerritories({}),
      ]);
      if (cancelled) return;
      if (staffResult.success) setAgents(staffResult.data?.salesAgents || []);
      else {
        setAgents([]);
        showToast?.('Failed to load sales agents.', 'error');
      }
      const territoryRows = territoryResult?.data || territoryResult || [];
      setTerritories(Array.isArray(territoryRows) ? territoryRows : []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dispatchDate, showToast]);

  const activeTerritories = useMemo(() => (
    (territories || []).filter((t) => String(t.status || 'Active') === 'Active')
  ), [territories]);

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (agents || []).filter((a) => {
      if (activeStatus !== 'all' && String(a.status || 'Active') !== activeStatus) return false;
      if (territoryFilter !== 'all') {
        const ids = Array.isArray(a.territoryIdsToday) ? a.territoryIdsToday : [];
        if (!ids.map(Number).includes(Number(territoryFilter))) return false;
      }
      if (!q) return true;
      const hay = [a.name, a.email, a.employeeCode, a.phone, a.branchName, a.assignedAreaNames]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [agents, search, territoryFilter, activeStatus]);

  const tabCounts = useMemo(() => {
    const counts = {
      all: baseFiltered.length,
      Unassigned: 0,
      Assigned: 0,
      'In Progress': 0,
      Completed: 0,
      'Needs Attention': 0,
      'Not Started': 0,
      Incomplete: 0,
    };
    for (const agent of baseFiltered) {
      const status = String(agent.workStatus || 'Unassigned');
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      else counts.Unassigned += 1;
    }
    return counts;
  }, [baseFiltered]);

  const filtered = useMemo(() => {
    if (statusTab === 'all') return baseFiltered;
    return baseFiltered.filter((a) => String(a.workStatus || 'Unassigned') === statusTab);
  }, [baseFiltered, statusTab]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  if (loading) return <LoadingState variant="dashboard" message="Loading sales agent dispatch..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Sales Agent Dispatch</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Daily canvassing coverage for the selected work date.
              {orgScope ? ' Organization-wide.' : ` Branch: ${currentUser?.branch?.name || 'your branch'}.`}
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/field-operations/sales/history`)}
          >
            Sales Assignment History
          </button>
        </div>

        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <label className="flex flex-col gap-1 text-sm">
              Work date
              <input
                type="date"
                className="filter-input"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => setDispatchDate(manilaDateInputValue())}
            >
              Today
            </button>
            <input
              className="filter-input search"
              type="search"
              placeholder="Search name, EMP id, or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sales agents"
            />
            <select
              className="filter-select"
              value={territoryFilter}
              onChange={(e) => setTerritoryFilter(e.target.value)}
              aria-label="Filter by territory"
            >
              <option value="all">All territories</option>
              {activeTerritories.map((t) => (
                <option key={t.territory_id || t.id} value={String(t.territory_id || t.id)}>
                  {t.territory_name || t.name}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value)}
              aria-label="Staff account status"
            >
              <option value="Active">Active accounts</option>
              <option value="Inactive">Inactive accounts</option>
              <option value="all">All accounts</option>
            </select>
          </div>
        </div>

        <div className="segmented-control" style={{ marginBottom: 16 }}>
          {ROSTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={statusTab === tab.key ? 'segment active' : 'segment'}
              onClick={() => setStatusTab(tab.key)}
            >
              {tab.label} ({tabCounts[tab.key] ?? 0})
            </button>
          ))}
        </div>

        {!filtered.length ? (
          <EmptyState
            title={agents.length ? 'No sales agents match the current filters' : 'No sales agents assigned to your branch'}
            description={agents.length
              ? 'Adjust search, territory, account status, or tab.'
              : (orgScope
                ? 'No sales agents match the current filters.'
                : 'Contact the Operating Manager to create a Sales Agent account.')}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Sales Agent</th>
                    {orgScope ? <th>Branch</th> : null}
                    <th>Assigned Area</th>
                    <th>Field Progress</th>
                    <th>Work Status</th>
                    <th>Account Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const status = String(a.workStatus || 'Unassigned');
                    const canMap = status !== 'Unassigned';
                    return (
                      <tr
                        key={a.id}
                        className="clickable-row"
                        onClick={() => navigate(`${opsBase}/field-operations/sales/${a.id}?date=${encodeURIComponent(dispatchDate)}`)}
                      >
                        <td>
                          <strong>{a.name}</strong>
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{a.employeeCode || '—'}</div>
                        </td>
                        {orgScope ? <td>{a.branchName || '—'}</td> : null}
                        <td>{a.assignedAreaNames || '—'}</td>
                        <td>{a.fieldProgressLabel || '—'}</td>
                        <td><StatusBadge status={status} /></td>
                        <td><StatusBadge status={a.status || 'Active'} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu
                            label={`Actions for ${a.name}`}
                            items={[
                              {
                                key: 'open',
                                label: 'Open Daily Dispatch',
                                onSelect: () => navigate(`${opsBase}/field-operations/sales/${a.id}?date=${encodeURIComponent(dispatchDate)}`),
                              },
                              canMap ? {
                                key: 'map',
                                label: 'View on Field Map',
                                onSelect: () => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(a.id)}&date=${encodeURIComponent(dispatchDate)}`),
                              } : null,
                              {
                                key: 'history',
                                label: 'Assignment History',
                                onSelect: () => navigate(`${opsBase}/field-operations/sales/${a.id}/history`),
                              },
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
        )}
      </section>
    </div>
  );
}

const DETAIL_TABS = [
  { key: 'areas', label: 'Areas Assigned' },
  { key: 'progress', label: 'Field Progress' },
  { key: 'reports', label: 'Field Reports' },
];

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
  const [territories, setTerritories] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [detailTab, setDetailTab] = useState('areas');
  const [extendDate, setExtendDate] = useState('');
  const [reassignAgentId, setReassignAgentId] = useState('');
  const [form, setForm] = useState({
    territory_id: '',
    area_name: '',
    work_date: searchDate || manilaDateInputValue(),
    end_date: searchDate || manilaDateInputValue(),
    coverage_notes: '',
    latitude: '',
    longitude: '',
    radius_meters: '800',
    confirm_spatial_overlap: false,
  });

  function syncDateInUrl(nextDate) {
    navigate(`${opsBase}/field-operations/sales/${agentId}?date=${encodeURIComponent(nextDate)}`);
  }

  async function reload(date) {
    if (!agentId) {
      setDetail(null);
      setLoadError('Missing sales agent id.');
      return;
    }
    const detailResult = await getBranchSalesAgentDetail(agentId, { work_date: date });
    if (detailResult.success) {
      setDetail(detailResult.data);
      setLoadError(null);
    } else {
      setDetail(null);
      setLoadError(detailResult.message || 'Sales agent detail could not be loaded.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [territoryResult, staffResult] = await Promise.all([
        fetchTerritories({}),
        getBranchStaff({ date: workDate }),
      ]);
      if (!cancelled) {
        if (territoryResult?.success) setTerritories(territoryResult.data || []);
        else if (Array.isArray(territoryResult)) setTerritories(territoryResult);
        else if (Array.isArray(territoryResult?.data)) setTerritories(territoryResult.data);
        else setTerritories([]);
        if (staffResult.success) setAgents(staffResult.data?.salesAgents || []);
      }
      await reload(workDate);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, workDate]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      work_date: workDate,
      end_date: prev.end_date < workDate ? workDate : (prev.end_date || workDate),
    }));
    setShowAssignForm(false);
    setSelectedAssignment(null);
  }, [workDate]);

  const profile = detail?.profile;
  const todayAreas = detail?.areas || [];
  const dispatchStats = detail?.dispatchStats || {};
  const fieldActivity = detail?.fieldActivity || [];
  const paginationAreas = usePagination(todayAreas);
  const paginationActivity = usePagination(fieldActivity);

  const branchTerritories = useMemo(() => {
    if (!profile?.branchId) return territories;
    return (territories || []).filter((t) => (
      t.branch_id == null || Number(t.branch_id) === Number(profile.branchId)
    ));
  }, [territories, profile?.branchId]);

  const activeTerritories = useMemo(
    () => branchTerritories.filter((t) => String(t.status || 'Active') === 'Active'),
    [branchTerritories]
  );

  const dayStatus = profile?.workStatus || 'Unassigned';
  const allDone = todayAreas.length > 0 && todayAreas.every((a) => a.status === 'Done');
  const anyInProgress = todayAreas.some((a) => a.status === 'In Progress');
  const showReadOnly = allDone;

  function applyTerritoryToForm(territoryId) {
    const territory = activeTerritories.find((t) => String(t.territory_id || t.id) === String(territoryId));
    if (!territory) {
      setForm((prev) => ({
        ...prev,
        territory_id: territoryId,
        area_name: '',
        latitude: '',
        longitude: '',
        radius_meters: '800',
      }));
      return;
    }
    const lat = territory.latitude ?? territory.lat;
    const lng = territory.longitude ?? territory.lng;
    setForm((prev) => ({
      ...prev,
      territory_id: String(territory.territory_id || territory.id),
      area_name: territory.territory_name || territory.name || '',
      coverage_notes: prev.coverage_notes || territory.coverage_area || '',
      latitude: lat != null && Number.isFinite(Number(lat)) ? String(lat) : '',
      longitude: lng != null && Number.isFinite(Number(lng)) ? String(lng) : '',
      radius_meters: String(territory.radius_meters || prev.radius_meters || 800),
    }));
  }

  async function handleAssign({ confirmSpatial = false } = {}) {
    if (!form.work_date) {
      showToast?.('Start date is required.', 'error');
      return;
    }
    if (!form.end_date || form.end_date < form.work_date) {
      showToast?.('End date must be on or after the start date.', 'error');
      return;
    }
    if (!form.territory_id) {
      showToast?.('Choose an Active territory. Canvass location follows the territory.', 'error');
      return;
    }
    const lat = parseCoord(form.latitude);
    const lng = parseCoord(form.longitude);

    setAssigning(true);
    const result = await assignSalesAgentArea(agentId, {
      territory_id: Number(form.territory_id),
      area_name: form.area_name.trim() || undefined,
      work_date: form.work_date,
      end_date: form.end_date,
      coverage_notes: form.coverage_notes.trim() || undefined,
      product_ids: [],
      latitude: lat,
      longitude: lng,
      radius_meters: Number(form.radius_meters) || 800,
      confirm_spatial_overlap: confirmSpatial || form.confirm_spatial_overlap,
    });
    setAssigning(false);

    if (!result.success) {
      if (result.data?.requiresConfirmation) {
        const proceed = window.confirm(`${result.message}\n\nCreate the assignment anyway?`);
        if (proceed) await handleAssign({ confirmSpatial: true });
        return;
      }
      showToast?.(result.message || 'Failed to assign area.', 'error');
      return;
    }

    showToast?.(result.message || 'Area assigned.', 'success');
    setShowAssignForm(false);
    setForm((prev) => ({
      ...prev,
      coverage_notes: '',
      latitude: '',
      longitude: '',
      confirm_spatial_overlap: false,
      area_name: '',
      territory_id: '',
      end_date: workDate,
    }));
    await reload(workDate);
  }

  async function handleExtend(assignment) {
    const nextEnd = extendDate || addDays(assignment.end_date || assignment.work_date, 1);
    if (nextEnd < (assignment.work_date || workDate)) {
      showToast?.('End date must be on or after the start date.', 'error');
      return;
    }
    setAssigning(true);
    const result = await updateSalesAgentAreaAssignment(agentId, assignment.assignment_id, {
      action: 'extend',
      end_date: nextEnd,
    });
    setAssigning(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to extend assignment.', 'error');
      return;
    }
    showToast?.(result.message || 'Assignment extended.', 'success');
    setSelectedAssignment(null);
    await reload(workDate);
  }

  async function handleReassign(assignment) {
    if (!reassignAgentId) {
      showToast?.('Choose a sales agent to reassign to.', 'error');
      return;
    }
    setAssigning(true);
    const result = await updateSalesAgentAreaAssignment(agentId, assignment.assignment_id, {
      action: 'reassign',
      sales_agent_id: Number(reassignAgentId),
      end_date: extendDate || assignment.end_date || assignment.work_date,
    });
    setAssigning(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to reassign.', 'error');
      return;
    }
    showToast?.(result.message || 'Assignment reassigned.', 'success');
    setSelectedAssignment(null);
    await reload(workDate);
  }

  function openAssignForm() {
    if (anyInProgress) {
      const ok = window.confirm('This agent already has work in progress. Create another area assignment?');
      if (!ok) return;
    }
    setForm((prev) => ({
      ...prev,
      work_date: workDate,
      end_date: workDate,
      territory_id: '',
      area_name: '',
      coverage_notes: '',
      latitude: '',
      longitude: '',
      radius_meters: '800',
    }));
    setShowAssignForm(true);
  }

  if (loading) return <LoadingState variant="detail" message="Loading daily dispatch..." />;
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

  const formMapCenter = mapCenterFromPin(form.latitude, form.longitude, DAVAO_CENTER);
  const formHasPin = parseCoord(form.latitude) != null && parseCoord(form.longitude) != null;

  return (
    <div className="page">
      <section className="panel dashboard-greeting mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start">
          <div>
            <p className="dashboard-eyebrow"><StatusBadge status={profile.status || 'Active'} /></p>
            <h2 style={{ margin: '4px 0' }}>{profile.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              <span style={{ fontFamily: 'monospace' }}>{profile.employeeCode || '—'}</span>
              {profile.branchName ? ` · ${profile.branchName}` : ''}
              {profile.email ? ` · ${profile.email}` : ''}
              {profile.phone ? ` · ${formatPhone(profile.phone)}` : ''}
            </p>
            <p className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
              Work status for {formatDisplayDate(workDate)}: <StatusBadge status={dayStatus} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-1 text-sm">
              Work date
              <input
                type="date"
                className="filter-input"
                value={workDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setWorkDate(next);
                  syncDateInUrl(next);
                }}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const today = manilaDateInputValue();
                setWorkDate(today);
                syncDateInUrl(today);
              }}
            >
              Today
            </button>
            {!showReadOnly ? (
              <button className="button" type="button" onClick={openAssignForm}>
                Assign Canvass Area
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="segmented-control" style={{ marginBottom: 16 }}>
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={detailTab === tab.key ? 'segment active' : 'segment'}
            onClick={() => setDetailTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'areas' ? ` (${dispatchStats.areasAssigned ?? todayAreas.length})` : ''}
            {tab.key === 'progress' ? ` (${dispatchStats.visitsCompleted ?? 0}/${dispatchStats.visitsPlanned ?? 0})` : ''}
            {tab.key === 'reports' ? ` (${dispatchStats.fieldReports ?? fieldActivity.length})` : ''}
          </button>
        ))}
      </div>

      {detailTab === 'areas' ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <div>
              <h3>Today&apos;s assigned area(s)</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                Coverage for {formatDisplayDate(workDate)}. Permanent customer book is separate from daily canvass.
              </p>
            </div>
          </div>
          {!todayAreas.length ? (
            <EmptyState
              title="No areas assigned for this date"
              description="Use Assign Canvass Area to publish canvassing work for a date range."
            />
          ) : (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Area / Territory</th>
                      <th>Coverage</th>
                      <th>Pin</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationAreas.paginatedData.map((area) => {
                      const hasPin = parseCoord(area.latitude) != null && parseCoord(area.longitude) != null;
                      const windowLabel = area.end_date && area.end_date !== area.work_date
                        ? `${formatDisplayDate(area.work_date)} – ${formatDisplayDate(area.end_date)}`
                        : formatDisplayDate(area.work_date);
                      return (
                        <tr key={area.assignment_id}>
                          <td>
                            <strong>{area.area_name}</strong>
                            <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>
                              {area.territory_name || '—'} · {windowLabel}
                            </div>
                          </td>
                          <td>{area.radius_meters || 800} m</td>
                          <td>{hasPin ? 'Pin set' : 'No pin'}</td>
                          <td><StatusBadge status={area.status} /></td>
                          <td>
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => {
                                setSelectedAssignment(area);
                                setExtendDate(area.end_date || area.work_date);
                                setReassignAgentId('');
                              }}
                            >
                              {area.status === 'Expired' || area.status === 'Not Started' || area.status === 'Incomplete'
                                ? 'Extend / Reassign'
                                : 'View'}
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
          )}
        </section>
      ) : null}

      {detailTab === 'progress' ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <h3>Field Progress</h3>
          </div>
          <p className="muted">
            Visits completed {dispatchStats.visitsCompleted ?? 0} of {dispatchStats.visitsPlanned ?? 0} planned for this date.
            Areas completed {dispatchStats.areasCompleted ?? 0} of {dispatchStats.areasAssigned ?? todayAreas.length}.
          </p>
          {!dispatchStats.visitsPlanned && !todayAreas.length ? (
            <EmptyState title="No field progress yet" description="Progress appears after areas are assigned and visits are recorded." />
          ) : null}
        </section>
      ) : null}

      {detailTab === 'reports' ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <h3>Field Reports</h3>
          </div>
          {!fieldActivity.length ? (
            <EmptyState title="No field reports for this date" description="Field Activity Reports linked to this agent and date appear here." />
          ) : (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Customer</th>
                      <th>Remarks</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationActivity.paginatedData.map((row) => (
                      <tr key={row.reportId}>
                        <td>{row.activityType || '—'}</td>
                        <td>{row.customerName || '—'}</td>
                        <td>{row.remarks || '—'}</td>
                        <td>{row.createdAt ? formatDisplayDateTime(row.createdAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationActivity} />
            </>
          )}
        </section>
      ) : null}

      {showAssignForm && !showReadOnly ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <div>
              <h3>Assign Canvass Area</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                Territory sets the canvassing location. Pin follows the territory and is not freely overridden.
              </p>
            </div>
            <button className="button ghost" type="button" onClick={() => setShowAssignForm(false)}>Cancel</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Territory (Active only)
              <select
                className="filter-select"
                value={form.territory_id}
                onChange={(e) => applyTerritoryToForm(e.target.value)}
              >
                <option value="">Select territory</option>
                {activeTerritories.map((t) => (
                  <option key={t.territory_id || t.id} value={String(t.territory_id || t.id)}>
                    {t.territory_name || t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Area name
              <input className="filter-input" value={form.area_name} readOnly />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Start date
              <input
                type="date"
                className="filter-input"
                value={form.work_date}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    work_date: next,
                    end_date: prev.end_date < next ? next : prev.end_date,
                  }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              End date
              <input
                type="date"
                className="filter-input"
                value={form.end_date}
                min={form.work_date}
                onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              Notes
              <textarea
                className="filter-input"
                rows={3}
                value={form.coverage_notes}
                onChange={(e) => setForm((prev) => ({ ...prev, coverage_notes: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Coverage radius (meters)
              <input
                className="filter-input"
                type="number"
                min={100}
                max={20000}
                value={form.radius_meters}
                onChange={(e) => setForm((prev) => ({ ...prev, radius_meters: e.target.value }))}
              />
            </label>
            <div className="text-sm muted" style={{ alignSelf: 'end' }}>
              Location: {formHasPin ? `${form.latitude}, ${form.longitude}` : 'Territory has no coordinates yet'}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            {formHasPin ? (
              <LeafletMap
                center={formMapCenter}
                zoom={14}
                height={280}
                markers={[{
                  id: 'territory-pin',
                  position: formMapCenter,
                  label: 'T',
                  color: '#153450',
                  popup: form.area_name || 'Territory location',
                }]}
                circles={[{
                  id: 'radius',
                  center: formMapCenter,
                  radius: Number(form.radius_meters) || 800,
                  color: '#153450',
                }]}
              />
            ) : (
              <EmptyState
                title="No territory coordinates"
                description="Select an Active territory that has map coordinates. The canvass pin always follows the territory."
              />
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button className="button" type="button" disabled={assigning} onClick={() => handleAssign()}>
              {assigning ? 'Assigning…' : 'Confirm Assignment'}
            </button>
          </div>
        </section>
      ) : null}

      {selectedAssignment ? (
        <section className="panel content-panel relative overflow-hidden mb-4">
          <div className="list-section-header">
            <div>
              <h3>{selectedAssignment.area_name}</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                <StatusBadge status={selectedAssignment.status} />
                {' · '}
                {formatDisplayDate(selectedAssignment.work_date)}
                {selectedAssignment.end_date && selectedAssignment.end_date !== selectedAssignment.work_date
                  ? ` – ${formatDisplayDate(selectedAssignment.end_date)}`
                  : ''}
              </p>
            </div>
            <button className="button ghost" type="button" onClick={() => setSelectedAssignment(null)}>Close</button>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <tbody>
                <tr><th>Territory</th><td>{selectedAssignment.territory_name || '—'}</td></tr>
                <tr><th>Notes</th><td>{selectedAssignment.coverage_notes || '—'}</td></tr>
                <tr><th>Radius</th><td>{selectedAssignment.radius_meters || 800} m</td></tr>
                <tr>
                  <th>Map</th>
                  <td>
                    {parseCoord(selectedAssignment.latitude) != null
                      ? `${selectedAssignment.latitude}, ${selectedAssignment.longitude}`
                      : 'No pin'}
                  </td>
                </tr>
                <tr><th>Started</th><td>{selectedAssignment.started_at ? formatDisplayDateTime(selectedAssignment.started_at) : '—'}</td></tr>
                <tr><th>Completed</th><td>{selectedAssignment.completed_at ? formatDisplayDateTime(selectedAssignment.completed_at) : '—'}</td></tr>
              </tbody>
            </table>
          </div>

          {selectedAssignment.status === 'Expired'
            || selectedAssignment.status === 'Not Started'
            || selectedAssignment.status === 'Incomplete'
            || selectedAssignment.status === 'Assigned'
            || selectedAssignment.status === 'In Progress' ? (
            <div className="grid gap-3 md:grid-cols-3" style={{ marginTop: 16 }}>
              <label className="flex flex-col gap-1 text-sm">
                Extend end date
                <input
                  type="date"
                  className="filter-input"
                  value={extendDate}
                  min={selectedAssignment.work_date}
                  onChange={(e) => setExtendDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Reassign to
                <select
                  className="filter-select"
                  value={reassignAgentId}
                  onChange={(e) => setReassignAgentId(e.target.value)}
                >
                  <option value="">Keep current agent</option>
                  {agents.filter((a) => String(a.id) !== String(agentId)).map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 items-end">
                <button className="button secondary" type="button" disabled={assigning} onClick={() => handleExtend(selectedAssignment)}>
                  Extend
                </button>
                <button className="button" type="button" disabled={assigning || !reassignAgentId} onClick={() => handleReassign(selectedAssignment)}>
                  Reassign
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex justify-between gap-2 mt-4 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/field-operations/sales/${agentId}/history`)}
          >
            Assignment History
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`${opsBase}/customers?agent=${encodeURIComponent(agentId)}`)}
          >
            View Assigned Customers
          </button>
        </div>
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations/sales`)}>
          Back to Sales Agent Dispatch
        </button>
      </div>
    </div>
  );
}

export function SalesAssignmentHistoryPage({
  navigate,
  opsBase,
  showToast,
  agentId = null,
}) {
  const today = manilaDateInputValue();
  const [from, setFrom] = useState(() => addDays(today, -14));
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('all');
  const [territoryId, setTerritoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState(agentId ? String(agentId) : 'all');
  const [agents, setAgents] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [reassignAgentId, setReassignAgentId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (agentId) setAgentFilter(String(agentId));
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      const [staffResult, territoryResult] = await Promise.all([
        getBranchStaff({ date: today }),
        fetchTerritories({}),
      ]);
      if (cancelled) return;
      if (staffResult.success) setAgents(staffResult.data?.salesAgents || []);
      const territoryRows = territoryResult?.data || territoryResult || [];
      setTerritories(Array.isArray(territoryRows) ? territoryRows : []);
    }
    loadMeta();
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = {
        from,
        to,
        search: search.trim() || undefined,
        status: status === 'all' ? undefined : status,
        territory_id: territoryId === 'all' ? undefined : territoryId,
        agent_id: agentFilter !== 'all' ? agentFilter : undefined,
        limit: 300,
      };
      const result = await getSalesAreaAssignmentHistory(params);
      if (cancelled) return;
      if (result.success) setRows(result.data || []);
      else {
        setRows([]);
        showToast?.(result.message || 'Failed to load assignment history.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [from, to, status, territoryId, agentFilter, search, showToast]);

  const pagination = usePagination(rows);
  const activeTerritories = useMemo(
    () => (territories || []).filter((t) => String(t.status || 'Active') === 'Active'),
    [territories]
  );

  async function handleExtend() {
    if (!selected) return;
    setBusy(true);
    const result = await updateSalesAgentAreaAssignment(selected.sales_agent_id, selected.assignment_id, {
      action: 'extend',
      end_date: extendDate || addDays(selected.end_date || selected.work_date, 1),
    });
    setBusy(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to extend.', 'error');
      return;
    }
    showToast?.(result.message || 'Extended.', 'success');
    setSelected(result.data);
    setRows((prev) => prev.map((row) => (
      row.assignment_id === result.data.assignment_id ? { ...row, ...result.data } : row
    )));
  }

  async function handleReassign() {
    if (!selected || !reassignAgentId) return;
    setBusy(true);
    const result = await updateSalesAgentAreaAssignment(selected.sales_agent_id, selected.assignment_id, {
      action: 'reassign',
      sales_agent_id: Number(reassignAgentId),
      end_date: extendDate || selected.end_date || selected.work_date,
    });
    setBusy(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to reassign.', 'error');
      return;
    }
    showToast?.(result.message || 'Reassigned.', 'success');
    setSelected(result.data);
  }

  if (loading) return <LoadingState variant="dashboard" message="Loading assignment history..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Sales Assignment History</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Route-level canvass assignments by coverage window. Not Started / Incomplete work can be extended or reassigned.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(agentId
              ? `${opsBase}/field-operations/sales/${agentId}`
              : `${opsBase}/field-operations/sales`)}
          >
            Back to Dispatch
          </button>
        </div>

        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <label className="flex flex-col gap-1 text-sm">
              From
              <input type="date" className="filter-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              To
              <input type="date" className="filter-input" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            {!agentId ? (
              <select className="filter-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                <option value="all">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={String(a.id)}>{a.name}</option>
                ))}
              </select>
            ) : null}
            <select className="filter-select" value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
              <option value="all">All territories</option>
              {activeTerritories.map((t) => (
                <option key={t.territory_id || t.id} value={String(t.territory_id || t.id)}>
                  {t.territory_name || t.name}
                </option>
              ))}
            </select>
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
              <option value="Not Started">Not Started</option>
              <option value="Incomplete">Incomplete</option>
            </select>
            <input
              className="filter-input search"
              type="search"
              placeholder="Search area, territory, or agent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search assignment history"
            />
          </div>
        </div>

        {!rows.length ? (
          <EmptyState
            title="No assignments in this range"
            description="Published canvass assignments overlapping the selected dates appear here."
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Coverage</th>
                    <th>Sales Agent</th>
                    <th>Area / Territory</th>
                    <th>Visits</th>
                    <th>Status</th>
                    <th>Field Reports</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((row) => {
                    const windowLabel = row.end_date && row.end_date !== row.work_date
                      ? `${formatDisplayDate(row.work_date)} – ${formatDisplayDate(row.end_date)}`
                      : formatDisplayDate(row.work_date);
                    return (
                      <tr key={row.assignment_id}>
                        <td>{windowLabel}</td>
                        <td>
                          <div>{row.sales_agent_name}</div>
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>
                            {row.sales_agent_employee_id || '—'}
                          </div>
                        </td>
                        <td>
                          <div>{row.area_name}</div>
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.territory_name || '—'}</div>
                        </td>
                        <td>
                          {(row.visits_completed ?? 0)}/{(row.visits_planned ?? 0)}
                        </td>
                        <td><StatusBadge status={row.status} /></td>
                        <td>{row.field_report_count ?? 0}</td>
                        <td>
                          <RowActionsMenu
                            label={`Actions for ${row.area_name}`}
                            items={[
                              {
                                key: 'details',
                                label: 'View Details',
                                onSelect: () => {
                                  setSelected(row);
                                  setExtendDate(row.end_date || row.work_date);
                                  setReassignAgentId('');
                                },
                              },
                              {
                                key: 'dispatch',
                                label: 'Open Daily Dispatch',
                                onSelect: () => navigate(
                                  `${opsBase}/field-operations/sales/${row.sales_agent_id}?date=${encodeURIComponent(row.work_date)}`
                                ),
                              },
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
        )}
      </section>

      {selected ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <div>
              <h3>Assignment Details</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                {selected.area_name} · <StatusBadge status={selected.status} />
              </p>
            </div>
            <button className="button ghost" type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <tbody>
                <tr>
                  <th>Coverage window</th>
                  <td>
                    {formatDisplayDate(selected.work_date)}
                    {selected.end_date && selected.end_date !== selected.work_date
                      ? ` – ${formatDisplayDate(selected.end_date)}`
                      : ''}
                  </td>
                </tr>
                <tr><th>Sales Agent</th><td>{selected.sales_agent_name} ({selected.sales_agent_employee_id || '—'})</td></tr>
                <tr><th>Assigned by</th><td>{selected.assigned_by_name || '—'}</td></tr>
                <tr><th>Territory</th><td>{selected.territory_name || '—'}</td></tr>
                <tr><th>Notes</th><td>{selected.coverage_notes || '—'}</td></tr>
                <tr>
                  <th>Map pin / radius</th>
                  <td>
                    {parseCoord(selected.latitude) != null
                      ? `${selected.latitude}, ${selected.longitude} · ${selected.radius_meters || 800} m`
                      : `No pin · ${selected.radius_meters || 800} m`}
                  </td>
                </tr>
                <tr><th>Visit progress</th><td>{selected.visits_completed ?? 0} / {selected.visits_planned ?? 0}</td></tr>
                <tr>
                  <th>Field reports</th>
                  <td>
                    {selected.field_report_count ?? 0}
                    {' '}
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => navigate(`${opsBase}/field-activity-reports?staff_id=${encodeURIComponent(selected.sales_agent_id)}`)}
                    >
                      Open FARs
                    </button>
                  </td>
                </tr>
                <tr><th>Started</th><td>{selected.started_at ? formatDisplayDateTime(selected.started_at) : '—'}</td></tr>
                <tr><th>Completed</th><td>{selected.completed_at ? formatDisplayDateTime(selected.completed_at) : '—'}</td></tr>
                <tr><th>Created</th><td>{selected.created_at ? formatDisplayDateTime(selected.created_at) : '—'}</td></tr>
                <tr><th>Updated</th><td>{selected.updated_at ? formatDisplayDateTime(selected.updated_at) : '—'}</td></tr>
              </tbody>
            </table>
          </div>

          {selected.status === 'Expired'
            || selected.status === 'Not Started'
            || selected.status === 'Incomplete'
            || selected.status === 'Assigned'
            || selected.status === 'In Progress' ? (
            <div className="grid gap-3 md:grid-cols-3" style={{ marginTop: 16 }}>
              <label className="flex flex-col gap-1 text-sm">
                Extend end date
                <input
                  type="date"
                  className="filter-input"
                  value={extendDate}
                  min={selected.work_date}
                  onChange={(e) => setExtendDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Reassign to
                <select
                  className="filter-select"
                  value={reassignAgentId}
                  onChange={(e) => setReassignAgentId(e.target.value)}
                >
                  <option value="">Select agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 items-end">
                <button className="button secondary" type="button" disabled={busy} onClick={handleExtend}>Extend</button>
                <button className="button" type="button" disabled={busy || !reassignAgentId} onClick={handleReassign}>Reassign</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
