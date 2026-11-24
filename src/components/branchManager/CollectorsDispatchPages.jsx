import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Stats } from '../shared/StatsGrid';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { StatusBadge } from '../StatusBadge';
import LeafletMap from '../common/LeafletMap';
import { formatCurrency, formatDisplayDate, formatPhone } from '../../utils/formatters.js';
import { getCurrentUser } from '../../api/authService.js';
import {
  getBranchStaff,
  getBranchCollectorDetail,
  fetchCollectorSawPriority,
  previewCollectorCollectionRoute,
  assignCollectorCollectionRoute,
  getCollectorRouteHistory,
  getCollectorRouteDetail,
} from '../../api/branchManagerService.js';
import { SpotCashPickupsPanel } from './SpotCashPickupsPanel.jsx';

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

function normalizeRouteStatus(status) {
  const value = String(status || 'No Route');
  if (value === 'Done') return 'Completed';
  return value;
}

function parseCoord(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validLatLng(lat, lng) {
  const a = parseCoord(lat);
  const b = parseCoord(lng);
  if (a == null || b == null) return null;
  if (a === 0 && b === 0) return null;
  return [a, b];
}

function assignmentStatusLabel(row, assignedIds) {
  if (row.assignment_block === 'assigned_to_other_collector') {
    return `Already assigned to ${row.assigned_collector_name || 'another collector'}`;
  }
  if (row.assignment_block === 'already_scheduled' || assignedIds.has(String(row.customer_id))) {
    return 'Already on this route';
  }
  if (row.book_status === 'unassigned') return 'Not in this Collector\'s permanent portfolio';
  if (row.book_status === 'own_book') return 'In permanent portfolio';
  return 'Eligible';
}

function roadProviderNote(provider) {
  if (provider === 'osrm') return 'Visiting order uses road-network travel times.';
  if (provider === 'haversine-fallback') {
    return 'Road routing unavailable — visiting order uses straight-line distances.';
  }
  if (provider === 'priority-order' || provider === 'saw-fallback') {
    return 'Visiting order follows priority ranking until road routing is available.';
  }
  return null;
}

function hasMapableStops(collector) {
  return Number(collector?.todayStops || 0) > 0 || Boolean(collector?.hasMapStops);
}

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
              className="button ghost user-row-menu-item"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
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

function deriveRosterSummary(collectors) {
  const list = Array.isArray(collectors) ? collectors : [];
  const active = list.filter((c) => String(c.status || 'Active') === 'Active');
  const counts = {
    totalActive: active.length,
    routesPublished: 0,
    unassigned: 0,
    plannedStops: 0,
    completedStops: 0,
    needsAttention: 0,
  };
  for (const collector of active) {
    const status = normalizeRouteStatus(collector.todayRouteStatus);
    counts.plannedStops += Number(collector.todayStops) || 0;
    counts.completedStops += Number(collector.todayCompleted) || 0;
    if (status === 'Needs Attention') counts.needsAttention += 1;
    if (status === 'No Route') counts.unassigned += 1;
    else if (status !== 'No Route') counts.routesPublished += 1;
  }
  return counts;
}

function buildMarkersFromRows(rows, {
  idKey = 'customer_id',
  labelKey = 'route_sequence',
  nameKey = 'customer_name',
  statusKey = 'status',
  color = '#093850',
} = {}) {
  return (rows || [])
    .map((row, index) => {
      const lat = row.latitude ?? row.lat ?? row.customer_latitude;
      const lng = row.longitude ?? row.lng ?? row.customer_longitude;
      const position = validLatLng(lat, lng);
      if (!position) return null;
      const stopLabel = row[labelKey] || row.stopNumber || row.stop_number || (index + 1);
      const name = row[nameKey] || row.customerName || row.account || 'Stop';
      const status = row[statusKey] || row.visit_status || '';
      return {
        id: `m-${row[idKey] || row.visitId || row.visit_id || index}`,
        position,
        label: String(stopLabel),
        color: status === 'Completed' ? '#10b981' : color,
        popup: `#${stopLabel} ${name}${status ? ` (${status})` : ''}`,
      };
    })
    .filter(Boolean);
}

export function CollectorsDispatchRoster({ navigate, opsBase, showToast }) {
  const currentUser = getCurrentUser();
  const orgScope = isOrgScopeUser(currentUser);
  const [dispatchDate, setDispatchDate] = useState(manilaDateInputValue);
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeStatus, setRouteStatus] = useState('all');
  const [activeStatus, setActiveStatus] = useState('Active');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getBranchStaff({ date: dispatchDate });
      if (cancelled) return;
      if (result.success) {
        setCollectors(result.data?.collectors || []);
      } else {
        setCollectors([]);
        showToast?.('Failed to load collectors.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [dispatchDate, showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (collectors || []).filter((c) => {
      if (activeStatus !== 'all' && String(c.status || 'Active') !== activeStatus) return false;
      const status = normalizeRouteStatus(c.todayRouteStatus);
      if (routeStatus !== 'all') {
        const wanted = normalizeRouteStatus(routeStatus);
        if (status !== wanted) return false;
      }
      if (!q) return true;
      const hay = [c.name, c.email, c.employeeCode, c.phone, c.branchName]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [collectors, search, routeStatus, activeStatus]);

  const summary = useMemo(() => deriveRosterSummary(collectors), [collectors]);
  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  if (loading) return <LoadingState variant="dashboard" message="Loading collector dispatch roster..." />;

  return (
    <div className="page">
      {!orgScope ? (
        <SpotCashPickupsPanel
          showToast={showToast}
          navigate={navigate}
          opsBase={opsBase}
        />
      ) : null}
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Collector Dispatch</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Daily collection route preparation and monitoring for the selected work date.
              {orgScope
                ? ' Organization-wide collectors.'
                : ` Branch: ${currentUser?.branch?.name || 'your branch'}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`${opsBase}/field-operations/collectors/history`)}
            >
              Collector Route History
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="flex flex-col gap-1 text-sm">
            Work date
            <input
              type="date"
              className="input"
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
            Route status
            <select className="filter-select" value={routeStatus} onChange={(e) => setRouteStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="No Route">No Route</option>
              <option value="Published">Published</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Needs Attention">Needs Attention</option>
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

        <Stats stats={[
          { label: 'Active Collectors', value: String(summary.totalActive) },
          { label: 'Routes Published', value: String(summary.routesPublished) },
          { label: 'Unassigned Collectors', value: String(summary.unassigned) },
          { label: 'Planned Stops', value: String(summary.plannedStops) },
          { label: 'Completed Stops', value: String(summary.completedStops) },
          { label: 'Needs Attention', value: String(summary.needsAttention) },
        ]} />

        {!filtered.length ? (
          <EmptyState
            title={collectors.length ? 'No collectors match the current filters' : 'No collectors are currently assigned to your branch'}
            description={collectors.length
              ? 'Adjust search, route status, or account status filters.'
              : (orgScope
                ? 'No collectors match the current filters.'
                : 'Contact the Operating Manager to create a Collector account.')}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Collector</th>
                    {orgScope ? <th>Branch</th> : null}
                    <th>Portfolio Customers</th>
                    <th>Today&apos;s Route</th>
                    <th>Stops</th>
                    <th>Completed</th>
                    <th>Remaining</th>
                    <th>Account Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const routeLabel = normalizeRouteStatus(c.todayRouteStatus);
                    const canMap = hasMapableStops(c);
                    return (
                      <tr
                        key={c.id}
                        className="clickable-row"
                        onClick={() => navigate(`${opsBase}/field-operations/collectors/${c.id}?date=${encodeURIComponent(dispatchDate)}`)}
                      >
                        <td>
                          <strong>{c.name}</strong>
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{c.employeeCode || '—'}</div>
                        </td>
                        {orgScope ? <td>{c.branchName || '—'}</td> : null}
                        <td>{c.accountBookSize ?? 0}</td>
                        <td><StatusBadge status={routeLabel} /></td>
                        <td>{c.todayStops ?? 0}</td>
                        <td>{c.todayCompleted ?? 0}</td>
                        <td>{c.todayRemaining ?? 0}</td>
                        <td><StatusBadge status={c.status || 'Active'} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <RowActionsMenu
                            label={`Actions for ${c.name}`}
                            items={[
                              {
                                key: 'open',
                                label: 'Open Dispatch',
                                onSelect: () => navigate(`${opsBase}/field-operations/collectors/${c.id}?date=${encodeURIComponent(dispatchDate)}`),
                              },
                              {
                                key: 'map',
                                label: canMap ? 'Map' : 'Map (no route)',
                                disabled: !canMap,
                                title: canMap
                                  ? 'Open Field Map for this collector'
                                  : 'No published route stops for this date',
                                onSelect: () => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(c.id)}&date=${encodeURIComponent(dispatchDate)}`),
                              },
                              {
                                key: 'history',
                                label: 'Route History',
                                onSelect: () => navigate(`${opsBase}/field-operations/collectors/${c.id}/history`),
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

export function CollectorDispatchDetailPage({
  collectorId,
  navigate,
  opsBase,
  showToast,
}) {
  const searchDate = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('date')
    : null;
  const [scheduledDate, setScheduledDate] = useState(searchDate || manilaDateInputValue());
  const [detail, setDetail] = useState(null);
  const [sawRows, setSawRows] = useState([]);
  const [sawMeta, setSawMeta] = useState(null);
  const [assignedIds, setAssignedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [previewRows, setPreviewRows] = useState([]);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);

  function syncDateInUrl(nextDate) {
    navigate(`${opsBase}/field-operations/collectors/${collectorId}?date=${encodeURIComponent(nextDate)}`);
  }

  async function reload(date) {
    if (!collectorId) {
      setDetail(null);
      setLoadError('Missing collector id.');
      return;
    }
    const [detailResult, sawRes] = await Promise.all([
      getBranchCollectorDetail(collectorId, { scheduled_date: date }),
      fetchCollectorSawPriority(collectorId, { scheduled_date: date }),
    ]);
    if (detailResult.success) {
      setDetail(detailResult.data);
      setLoadError(null);
    } else {
      setDetail(null);
      setLoadError(detailResult.message || 'Collector detail could not be loaded.');
    }
    if (sawRes.success) {
      setSawRows(sawRes.data || []);
      setSawMeta(sawRes.meta || null);
      setAssignedIds(new Set((sawRes.meta?.assignedCustomerIds || []).map(String)));
    } else {
      setSawRows([]);
      setSawMeta(null);
      setAssignedIds(new Set());
    }
    setPreviewRows([]);
    setPreviewMeta(null);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      await reload(scheduledDate);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorId, scheduledDate]);

  const profile = detail?.profile;
  const publishedRoute = detail?.publishedRoute || detail?.route || [];
  const routeStats = detail?.routeStats || {};
  const routeStatus = normalizeRouteStatus(profile?.todayRouteStatus || 'No Route');
  const eligibleRows = useMemo(
    () => sawRows.filter((row) => !row.assignment_block && !assignedIds.has(String(row.customer_id))),
    [sawRows, assignedIds]
  );
  const blockedRows = useMemo(
    () => sawRows.filter((row) => row.assignment_block || assignedIds.has(String(row.customer_id))),
    [sawRows, assignedIds]
  );
  const alreadyAssignedCount = useMemo(() => {
    const blockedAssigned = blockedRows.filter((row) => (
      row.assignment_block === 'already_scheduled'
      || row.assignment_block === 'assigned_to_other_collector'
      || assignedIds.has(String(row.customer_id))
    )).length;
    return Math.max(blockedAssigned, Number(routeStats.alreadyAssignedToday) || 0);
  }, [blockedRows, assignedIds, routeStats.alreadyAssignedToday]);

  const paginationSaw = usePagination(eligibleRows);
  const paginationRoute = usePagination(publishedRoute);
  const paginationPreview = usePagination(previewRows);
  const paginationBlocked = usePagination(blockedRows);

  const selectedRows = useMemo(
    () => sawRows.filter((row) => selectedIds.has(String(row.customer_id))),
    [sawRows, selectedIds]
  );

  const previewMarkers = useMemo(
    () => buildMarkersFromRows(previewRows.length ? previewRows : selectedRows, {
      color: '#1d4ed8',
    }),
    [previewRows, selectedRows]
  );
  const publishedMarkers = useMemo(
    () => (detail?.mapMarkers?.length
      ? detail.mapMarkers.filter((m) => validLatLng(m.position?.[0], m.position?.[1]))
      : buildMarkersFromRows(publishedRoute, {
        idKey: 'customerId',
        labelKey: 'stopNumber',
        nameKey: 'customerName',
      })),
    [detail?.mapMarkers, publishedRoute]
  );

  const mapMarkers = previewMarkers.length ? previewMarkers : publishedMarkers;
  const mapBounds = mapMarkers.map((m) => m.position);
  const mapCenter = mapMarkers[0]?.position || null;
  const missingCoordCount = (previewRows.length ? previewRows : (selectedIds.size ? selectedRows : publishedRoute))
    .filter((row) => !validLatLng(
      row.latitude ?? row.lat ?? row.customer_latitude,
      row.longitude ?? row.lng ?? row.customer_longitude
    )).length;

  function toggleSelected(customerId) {
    const id = String(customerId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreviewRows([]);
    setPreviewMeta(null);
  }

  function selectTopN(n = 5) {
    const picks = eligibleRows.slice(0, n).map((row) => String(row.customer_id));
    setSelectedIds(new Set(picks));
    setPreviewRows([]);
    setPreviewMeta(null);
  }

  async function runPreview(ids) {
    const customerIds = (ids || [...selectedIds]).map(Number);
    if (!customerIds.length) {
      showToast?.('Select customers to preview a route.', 'error');
      return;
    }
    setAssignBusy(true);
    const res = await previewCollectorCollectionRoute(collectorId, {
      scheduled_date: scheduledDate,
      customer_ids: customerIds,
    });
    setAssignBusy(false);
    if (res.success) {
      setPreviewRows(res.data || []);
      setPreviewMeta(res.meta || null);
      showToast?.('Route preview ready for review.', 'success');
    } else {
      showToast?.(res.message || 'Could not preview route.', 'error');
    }
  }

  async function publishRoute(ids) {
    const customerIds = (ids || [...selectedIds]).map(Number);
    if (!customerIds.length) {
      showToast?.('Select customers before publishing.', 'error');
      return;
    }
    setAssignBusy(true);
    const res = await assignCollectorCollectionRoute(collectorId, {
      scheduled_date: scheduledDate,
      customer_ids: customerIds,
    });
    setAssignBusy(false);
    if (res.success) {
      showToast?.(res.message || 'Route published.', 'success');
      setSelectedIds(new Set());
      setPreviewRows([]);
      setPreviewMeta(null);
      await reload(scheduledDate);
    } else {
      showToast?.(res.message || 'Could not publish route.', 'error');
      if (res.data?.skipped?.length) {
        await reload(scheduledDate);
      }
    }
  }

  if (loading) return <LoadingState variant="detail" message="Loading collector dispatch..." />;
  if (!profile) {
    return (
      <EmptyState
        title="Collector not found"
        description={loadError || 'This collector is not available for your branch.'}
        actionLabel="Back"
        onAction={() => navigate(`${opsBase}/field-operations/collectors`)}
      />
    );
  }

  const emptyBook = Boolean(sawMeta?.emptyBook);
  const portfolioCount = Number(routeStats.portfolioCustomers ?? routeStats.customersInBook ?? profile.accountBookSize ?? 0);
  const hasPublished = publishedRoute.length > 0;
  const allCompleted = hasPublished && publishedRoute.every((r) => r.status === 'Completed');
  const canSelect = !allCompleted;
  const selectedCount = selectedIds.size;
  const showOptimize = canSelect && selectedCount > 0;
  const showPublish = canSelect && selectedCount > 0;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start">
          <div>
            <h3>{profile.name}</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {profile.employeeCode || '—'}
              {' · '}
              {profile.branchName || '—'}
              {' · '}
              <StatusBadge status={profile.status || 'Active'} />
              {profile.email ? ` · ${profile.email}` : ''}
              {profile.phone ? ` · ${formatPhone(profile.phone)}` : ''}
            </p>
            <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
              Route status: <StatusBadge status={routeStatus} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="flex flex-col gap-1 text-sm">
              Work date
              <input
                type="date"
                className="input"
                value={scheduledDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setScheduledDate(next);
                  syncDateInUrl(next);
                }}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const today = manilaDateInputValue();
                setScheduledDate(today);
                syncDateInUrl(today);
              }}
            >
              Today
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`${opsBase}/field-operations/collectors/${collectorId}/history`)}
            >
              View Collector Route History
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => navigate(`${opsBase}/customers`)}
            >
              Customer Management
            </button>
          </div>
        </div>
      </section>

      <Stats stats={[
        { label: 'Portfolio Customers', value: String(portfolioCount) },
        { label: 'Eligible Customers', value: String(sawMeta?.stats?.ranked ?? eligibleRows.length ?? 0) },
        { label: 'Already Assigned Today', value: String(alreadyAssignedCount) },
        {
          label: hasPublished ? 'Published Stops' : 'Selected Stops',
          value: String(hasPublished ? (routeStats.publishedStops ?? publishedRoute.length) : selectedCount),
        },
        { label: 'Blocked Customers', value: String(sawMeta?.stats?.blocked ?? blockedRows.length ?? 0) },
      ]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Recommended Customers</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Suggested priority for {formatDisplayDate(scheduledDate)}. Review eligible customers, optimize, then publish.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {canSelect ? (
              <>
                <button className="button secondary" type="button" disabled={assignBusy || !eligibleRows.length} onClick={() => selectTopN(5)}>
                  Select Top 5
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={assignBusy || !showOptimize}
                  onClick={() => runPreview()}
                >
                  Optimize Route
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={assignBusy || !showPublish}
                  onClick={() => publishRoute()}
                >
                  Confirm &amp; Publish ({selectedCount})
                </button>
              </>
            ) : (
              <span className="muted">Route completed for this date — view published stops below.</span>
            )}
          </div>
        </div>

        {emptyBook && !sawRows.length ? (
          <EmptyState
            title="No customers are currently assigned to this Collector's permanent collection portfolio."
            description={sawMeta?.emptyBookMessage
              || 'Assign this Collector as Assigned Collector on customer records in Customer Management, then return here. Territories define geography, not portfolio ownership.'}
            actionLabel="Open Customer Management"
            onAction={() => navigate(`${opsBase}/customers`)}
          />
        ) : eligibleRows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Suggested Priority</th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Address / Area</th>
                    <th>Outstanding</th>
                    <th>Collection Standing</th>
                    <th>Map Location</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationSaw.paginatedData.map((row) => {
                    const id = String(row.customer_id);
                    const hasPin = Boolean(validLatLng(row.latitude ?? row.lat, row.longitude ?? row.lng));
                    return (
                      <tr key={id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            disabled={!canSelect}
                            title="Select for publish"
                            onChange={() => toggleSelected(id)}
                            aria-label={`Select ${row.customer_name}`}
                          />
                        </td>
                        <td><strong>#{row.rank}</strong></td>
                        <td>
                          <div>{row.customer_name}</div>
                          <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.customer_code || '—'}</div>
                        </td>
                        <td>{row.contact_number || row.phone || '—'}</td>
                        <td>{row.address || row.territory_name || '—'}</td>
                        <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                        <td>{row.days_overdue != null ? `${row.days_overdue} days overdue` : (row.due_date ? `Due ${formatDisplayDate(row.due_date)}` : '—')}</td>
                        <td>{hasPin ? 'Pin available' : 'Missing coordinates'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationSaw} />
          </>
        ) : blockedRows.length ? (
          <EmptyState
            title="Some eligible customers are already included in another route for this date."
            description="Inspect blocked customers below. Duplicate same-day assignments are not allowed."
            actionLabel={showBlocked ? 'Hide blocked' : 'Inspect blocked customers'}
            onAction={() => setShowBlocked((v) => !v)}
          />
        ) : (
          <EmptyState
            title="This Collector has customers in their portfolio, but none currently meets the dispatch eligibility rules for the selected date."
            description="Eligibility still requires an open balance, valid coordinates, and permanent portfolio ownership. Adjust customer records or try another work date."
            actionLabel="Open Customer Management"
            onAction={() => navigate(`${opsBase}/customers`)}
          />
        )}

        {blockedRows.length ? (
          <div style={{ marginTop: 16 }}>
            <button className="button ghost" type="button" onClick={() => setShowBlocked((v) => !v)}>
              {showBlocked ? 'Hide' : 'Show'} blocked customers ({blockedRows.length})
            </button>
            {showBlocked ? (
              <>
                <div className="corvex-table-wrapper" style={{ marginTop: 8 }}>
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Outstanding</th>
                        <th>Exclusion reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginationBlocked.paginatedData.map((row) => (
                        <tr key={`blocked-${row.customer_id}`}>
                          <td>
                            <div>{row.customer_name}</div>
                            <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.customer_code || '—'}</div>
                          </td>
                          <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                          <td>{assignmentStatusLabel(row, assignedIds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...paginationBlocked} />
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {previewRows.length ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3>Proposed Visiting Order</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                {roadProviderNote(previewMeta?.roadProvider) || 'Review the recommended stop order before publishing.'}
                {' '}Suggested priority remains separate from travel sequence.
              </p>
            </div>
            <button
              className="button"
              type="button"
              disabled={assignBusy || !canSelect}
              onClick={() => publishRoute(previewRows.map((r) => r.customer_id))}
            >
              Publish This Route
            </button>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Customer</th>
                  <th>Outstanding</th>
                  <th>Address</th>
                  <th>Map Location</th>
                </tr>
              </thead>
              <tbody>
                {paginationPreview.paginatedData.map((row) => {
                  const hasPin = Boolean(validLatLng(row.latitude ?? row.lat, row.longitude ?? row.lng));
                  return (
                    <tr key={row.customer_id}>
                      <td><strong>#{row.route_sequence || row.rank}</strong></td>
                      <td>{row.customer_name}</td>
                      <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                      <td>{row.address || '—'}</td>
                      <td>{hasPin ? 'Pin available' : 'Missing coordinates'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...paginationPreview} />
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>
              {allCompleted
                ? 'Completed Route'
                : hasPublished
                  ? 'Published Route'
                  : 'Route Map Preview'}
            </h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {hasPublished
                ? `Published collection visits for ${formatDisplayDate(scheduledDate)}. Visit completion is separate from payment posting.`
                : `Select eligible customers to preview the proposed collection route for ${formatDisplayDate(scheduledDate)}.`}
              {detail?.roadProvider ? ` ${roadProviderNote(detail.roadProvider) || ''}` : ''}
            </p>
          </div>
        </div>

        {publishedRoute.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Stop</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Outstanding</th>
                    <th>Visit Status</th>
                    <th>Visit Outcome</th>
                    <th>Scheduled Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationRoute.paginatedData.map((r) => (
                    <tr key={`${r.visitId || r.customerId}-${r.stopNumber}`}>
                      <td><strong>#{r.stopNumber}</strong></td>
                      <td>{r.customerName || r.account}</td>
                      <td>{r.address || '—'}</td>
                      <td>{r.outstandingBalance != null ? formatCurrency(r.outstandingBalance) : '—'}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.visitOutcome || r.visit_outcome || '—'}</td>
                      <td>{formatDisplayDate(r.scheduledDate || scheduledDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationRoute} />
          </>
        ) : (
          <EmptyState
            title="No published route for this date"
            description="Select eligible customers, review the proposed order, then confirm and publish. Empty routes cannot be published."
          />
        )}

        <div style={{ marginTop: 16 }}>
          {mapMarkers.length ? (
            <>
              <LeafletMap
                center={mapCenter}
                zoom={13}
                height={400}
                fitBounds={mapBounds}
                polylines={detail?.polylines || []}
                markers={mapMarkers}
              />
              {missingCoordCount > 0 ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  {missingCoordCount} selected/published stop(s) are missing valid coordinates and are omitted from the map.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No route locations available yet"
              description="Select eligible customers to preview the proposed collection route. The map only shows real customer coordinates — never a default pin."
            />
          )}
        </div>
      </section>

      <div className="flex justify-between gap-2 mt-4 flex-wrap">
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(`${opsBase}/field-operations/collectors/${collectorId}/history`)}
        >
          View Collector Route History
        </button>
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations/collectors`)}>
          Back to Collector Dispatch
        </button>
      </div>
    </div>
  );
}

export function CollectorRouteHistoryPage({
  navigate,
  opsBase,
  showToast,
  collectorId = null,
}) {
  const today = manilaDateInputValue();
  const [from, setFrom] = useState(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [collectorFilter, setCollectorFilter] = useState(collectorId ? String(collectorId) : 'all');
  const [collectors, setCollectors] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (collectorId) setCollectorFilter(String(collectorId));
  }, [collectorId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      const staffResult = await getBranchStaff({ date: today });
      if (cancelled) return;
      if (staffResult.success) setCollectors(staffResult.data?.collectors || []);
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
        collector_id: collectorFilter !== 'all' ? collectorFilter : undefined,
        limit: 300,
      };
      const result = await getCollectorRouteHistory(params);
      if (cancelled) return;
      if (result.success) setRows(result.data || []);
      else {
        setRows([]);
        showToast?.(result.message || 'Failed to load route history.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [from, to, status, collectorFilter, search, showToast]);

  const pagination = usePagination(rows);

  async function openDetails(row) {
    setDetailLoading(true);
    const result = await getCollectorRouteDetail(row.collector_id, row.work_date);
    setDetailLoading(false);
    if (result.success) setSelected(result.data);
    else showToast?.(result.message || 'Failed to load route detail.', 'error');
  }

  if (loading) return <LoadingState variant="dashboard" message="Loading collector route history..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Collector Route History</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              One record per dispatched collection route (collector + work date). Read-only. Visit outcomes are separate from payment posting.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(collectorId
              ? `${opsBase}/field-operations/collectors/${collectorId}`
              : `${opsBase}/field-operations/collectors`)}
          >
            Back to Dispatch
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="flex flex-col gap-1 text-sm">
            From
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {!collectorId ? (
            <label className="flex flex-col gap-1 text-sm">
              Collector
              <select className="filter-select" value={collectorFilter} onChange={(e) => setCollectorFilter(e.target.value)}>
                <option value="all">All</option>
                {collectors.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            Route status
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="Published">Published</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Needs Attention">Needs Attention</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm" style={{ minWidth: 200 }}>
            Search
            <input
              className="input"
              placeholder="Collector name or EMP id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {!rows.length ? (
          <EmptyState
            title="No collection routes in this range"
            description="Published routes for past work dates appear here as route-level records."
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Work Date</th>
                    <th>Collector</th>
                    <th>Planned Stops</th>
                    <th>Completed</th>
                    <th>Remaining</th>
                    <th>Route Status</th>
                    <th>Published By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedData.map((row) => (
                    <tr key={`${row.collector_id}-${row.work_date}`}>
                      <td>{formatDisplayDate(row.work_date)}</td>
                      <td>
                        <div>{row.collector_name}</div>
                        <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{row.collector_employee_id || '—'}</div>
                      </td>
                      <td>{row.planned_stops}</td>
                      <td>{row.completed}</td>
                      <td>{row.remaining}</td>
                      <td><StatusBadge status={normalizeRouteStatus(row.route_status)} /></td>
                      <td>{row.published_by || '—'}</td>
                      <td>
                        <button className="button secondary" type="button" onClick={() => openDetails(row)}>
                          View Details
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

      {detailLoading ? (
        <LoadingState variant="detail" message="Loading route detail..." />
      ) : null}

      {selected ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <div>
              <h3>Route Details — {formatDisplayDate(selected.work_date)}</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                {selected.collector_name}
                {' · '}
                <StatusBadge status={normalizeRouteStatus(selected.route_status)} />
                {' · '}
                {selected.planned_stops} stops
                {selected.completed_at ? ` · Completed ${formatDisplayDate(selected.completed_at)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`${opsBase}/field-operations/collectors/${selected.collector_id}?date=${encodeURIComponent(selected.work_date)}`)}
              >
                Open Daily Dispatch
              </button>
              <button className="button ghost" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Visit Status</th>
                  <th>Visit Outcome</th>
                  <th>Field Reports</th>
                  <th>Payment Amount</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {(selected.stops || []).map((stop) => (
                  <tr key={stop.visit_id}>
                    <td><strong>#{stop.stop_number}</strong></td>
                    <td>
                      <div>{stop.customer_name}</div>
                      <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{stop.customer_code || '—'}</div>
                    </td>
                    <td>{stop.address || '—'}</td>
                    <td><StatusBadge status={stop.status} /></td>
                    <td>{stop.visit_outcome || '—'}</td>
                    <td>{stop.field_report_count || 0}</td>
                    <td>{stop.payment_amount ? formatCurrency(stop.payment_amount) : '—'}</td>
                    <td>{formatCurrency(stop.outstanding_balance || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Visit outcome records field results. Payment amount reflects posted/pending collection transactions and is not required for a completed visit.
          </p>
        </section>
      ) : null}
    </div>
  );
}
