import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSalesAreaAssignmentById,
  fetchSalesAreaAssignmentCustomers,
  fetchSalesAreaAssignments,
  previewSalesAreaAssignmentRoute,
  updateSalesAreaAssignmentStatus,
} from '../../api/salesService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters.js';
import { openExternalNavigation } from '../../utils/mapsNavigation';
import { usePagination } from '../../hooks/usePagination';
import LeafletMap from '../common/LeafletMap';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { FindExistingCustomerModal } from './FindExistingCustomerModal';

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function statusColor(status) {
  if (status === 'Done') return '#153450';
  if (status === 'In Progress') return '#0B2133';
  if (status === 'Incomplete' || status === 'Not Started') return '#b45309';
  return '#64748b';
}

function hasCoords(assignment) {
  return Number.isFinite(Number(assignment?.latitude)) && Number.isFinite(Number(assignment?.longitude));
}

function coversToday(assignment, today = manilaToday()) {
  const start = String(assignment?.work_date || '');
  const end = String(assignment?.end_date || assignment?.work_date || '');
  if (!start) return false;
  return start <= today && end >= today;
}

function isTerminalStatus(status) {
  return status === 'Done' || status === 'Not Started' || status === 'Incomplete';
}

function formatDateRange(assignment) {
  const start = assignment?.work_date;
  const end = assignment?.end_date || assignment?.work_date;
  if (!start) return '—';
  if (!end || end === start) return formatDisplayDate(start);
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

function buildMapLayers(assignments) {
  const withGeo = (assignments || []).filter(hasCoords);
  const markers = withGeo.map((a) => ({
    id: `m-${a.assignment_id}`,
    position: [Number(a.latitude), Number(a.longitude)],
    label: String(a.area_name || '').slice(0, 1).toUpperCase() || 'A',
    color: statusColor(a.status),
    popup: `<strong>${a.area_name || 'Area'}</strong><br/>${formatDateRange(a)} · ${a.status || '—'}`,
  }));
  const circles = withGeo.map((a) => ({
    id: `c-${a.assignment_id}`,
    center: [Number(a.latitude), Number(a.longitude)],
    radius: Number(a.radius_meters) || 800,
    color: statusColor(a.status),
    fillColor: statusColor(a.status),
    popup: `<strong>${a.area_name || 'Area'}</strong><br/>${a.coverage_notes || 'Assigned canvass area'}`,
  }));
  const fitBounds = withGeo.flatMap((a) => {
    const lat = Number(a.latitude);
    const lng = Number(a.longitude);
    const delta = Math.max(0.004, (Number(a.radius_meters) || 800) / 111000);
    return [
      [lat - delta, lng - delta],
      [lat + delta, lng + delta],
    ];
  });
  const center = withGeo.length
    ? [
      withGeo.reduce((s, a) => s + Number(a.latitude), 0) / withGeo.length,
      withGeo.reduce((s, a) => s + Number(a.longitude), 0) / withGeo.length,
    ]
    : [7.1907, 125.4553];
  return { markers, circles, fitBounds, center };
}

function navigateToArea(assignment, showToast) {
  const ok = openExternalNavigation({
    latitude: assignment?.latitude,
    longitude: assignment?.longitude,
    address: assignment?.area_name || assignment?.coverage_notes,
  });
  if (!ok && showToast) {
    showToast('This assignment has no map pin yet. Ask your Branch Head to set a location.', 'error');
  }
}

/** Prefer live device GPS for agent→area routing; empty object falls back to branch on the server. */
function readDeviceStartCoords() {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolve({});
          return;
        }
        resolve({ start_lat: lat, start_lng: lng, start_source: 'device' });
      },
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

function RowActionMenu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    update();
    const onDoc = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', onDoc);
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

const SCOPE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'history', label: 'History' },
];

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'customers', label: 'Customers' },
  { key: 'route', label: 'Route and Map' },
  { key: 'activities', label: 'Field Activities' },
];

export function SchedulePage({ pageType, navigate, showToast }) {
  const [scope, setScope] = useState('today');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [startTarget, setStartTarget] = useState(null);
  const [starting, setStarting] = useState(false);
  const showMap = pageType === 'scheduleMap';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchSalesAreaAssignments({ scope });
      if (cancelled) return;
      if (result.success) {
        setAssignments(result.data || []);
      } else {
        setAssignments([]);
        setError(result.message || 'Failed to load area assignments.');
        if (showToast) showToast(result.message || 'Failed to load area assignments.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [scope, showToast]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assignments;
    return assignments.filter((row) => {
      const haystack = [
        row.area_name,
        row.coverage_notes,
        row.work_date,
        row.end_date,
        row.status,
        row.territory_name,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [assignments, search]);

  const pagination = usePagination(filtered, { resetKey: `${scope}|${search}` });
  const rows = pagination.paginatedData;
  const mapLayers = useMemo(() => buildMapLayers(filtered), [filtered]);

  const emptyCopy = scope === 'upcoming'
    ? { title: 'No upcoming area assignments', description: 'Future territories assigned by your Branch Head will appear here.' }
    : scope === 'history'
      ? { title: 'No past area assignments yet', description: 'Completed and auto-closed canvass days will show up in History.' }
      : { title: 'No area assigned for today — ask your Branch Head.', description: 'Your Branch Head assigns where you canvass. Check back once a territory is scheduled.' };

  const goList = () => navigate('/sales/schedule');
  const goMap = () => navigate('/sales/schedule/map');

  const confirmStart = async () => {
    if (!startTarget) return;
    setStarting(true);
    const result = await updateSalesAreaAssignmentStatus(startTarget.assignment_id, 'In Progress');
    setStarting(false);
    if (result.success) {
      showToast?.(result.message || 'Area started.', 'success');
      setStartTarget(null);
      setAssignments((prev) => prev.map((row) => (
        row.assignment_id === startTarget.assignment_id
          ? { ...row, ...(result.data || {}), status: 'In Progress' }
          : row
      )));
      navigate(`/sales/schedule/${startTarget.assignment_id}`);
    } else {
      showToast?.(result.message || 'Failed to start assignment.', 'error');
    }
  };

  if (loading) return <LoadingState message="Loading schedule..." />;
  if (error && !assignments.length) {
    return (
      <EmptyState
        title="Unable to load schedule"
        description={error}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Today&apos;s Schedule</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Territory or area assigned by your Branch Head — canvass and find customers here.
            </p>
          </div>
          <div className="list-section-actions">
            <div className="segmented-control">
              <button
                className={!showMap ? 'segment active' : 'segment'}
                type="button"
                onClick={goList}
              >
                List
              </button>
              <button
                className={showMap ? 'segment active' : 'segment'}
                type="button"
                onClick={goMap}
              >
                Map
              </button>
            </div>
          </div>
        </div>

        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <div className="segmented-control">
              {SCOPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  className={scope === option.key ? 'segment active' : 'segment'}
                  type="button"
                  onClick={() => setScope(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <input
              className="filter-input search"
              type="search"
              placeholder="Search area, notes, or date"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search area assignments"
            />
          </div>
        </div>

        {showMap ? (
          filtered.length && mapLayers.markers.length ? (
            <div style={{ marginTop: 8 }}>
              <LeafletMap
                center={mapLayers.center}
                zoom={13}
                height={460}
                markers={mapLayers.markers}
                circles={mapLayers.circles}
                fitBounds={mapLayers.fitBounds}
              />
            </div>
          ) : (
            <EmptyState
              title={filtered.length ? 'No map pins for these areas' : emptyCopy.title}
              description={
                filtered.length
                  ? 'Assigned areas need coordinates from your Branch Head before they appear on the map.'
                  : emptyCopy.description
              }
            />
          )
        ) : !assignments.length ? (
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
        ) : !filtered.length ? (
          <EmptyState
            title="No areas match these filters"
            description="Try another search or tab."
            actionLabel="Clear search"
            onAction={() => setSearch('')}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Area / Location</th>
                    <th>Coverage</th>
                    <th>Status</th>
                    <th>Notes from BM</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.assignment_id}
                      className="clickable-row"
                      onClick={() => navigate(`/sales/schedule/${row.assignment_id}`)}
                    >
                      <td><strong>{row.area_name || '—'}</strong></td>
                      <td>{formatDateRange(row)}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td
                        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={row.coverage_notes || ''}
                      >
                        {row.coverage_notes || '—'}
                      </td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu
                          items={[
                            {
                              key: 'open',
                              label: 'Open',
                              onSelect: () => navigate(`/sales/schedule/${row.assignment_id}`),
                            },
                            coversToday(row) && row.status === 'Assigned'
                              ? {
                                key: 'start',
                                label: 'Start Day',
                                onSelect: () => setStartTarget(row),
                              }
                              : null,
                            hasCoords(row)
                              ? {
                                key: 'map',
                                label: 'Open in Maps',
                                onSelect: () => navigateToArea(row, showToast),
                              }
                              : null,
                          ]}
                        />
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

      {startTarget ? (
        <div className="modal-overlay" onClick={() => !starting && setStartTarget(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>Start Day</h3>
            <p className="muted">
              Start covering <strong>{startTarget.area_name || 'this area'}</strong> now?
              Field actions unlock after you mark In Progress.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="button ghost" type="button" disabled={starting} onClick={() => setStartTarget(null)}>
                Cancel
              </button>
              <button className="button" type="button" disabled={starting} onClick={confirmStart}>
                {starting ? 'Starting…' : 'Start Day'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AreaAssignmentDetailPage({ assignmentId, navigate, showToast }) {
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [tab, setTab] = useState('overview');
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [routePreview, setRoutePreview] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [findModalOpen, setFindModalOpen] = useState(false);
  const today = manilaToday();

  const reload = async () => {
    if (!assignmentId) {
      setError('No assignment id provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchSalesAreaAssignmentById(assignmentId);
    if (result.success && result.data) {
      setAssignment(result.data);
    } else {
      setAssignment(null);
      setError(result.message || 'Area assignment not found.');
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [assignmentId]);

  useEffect(() => {
    if (!assignment || tab !== 'customers') return undefined;
    let cancelled = false;
    async function loadCustomers() {
      setCustomersLoading(true);
      const result = await fetchSalesAreaAssignmentCustomers(assignment.assignment_id);
      if (cancelled) return;
      if (result.success) setCustomers(result.data || []);
      else {
        setCustomers([]);
        showToast?.(result.message || 'Failed to load area customers.', 'error');
      }
      setCustomersLoading(false);
    }
    loadCustomers();
    return () => { cancelled = true; };
  }, [assignment?.assignment_id, tab, showToast]);

  useEffect(() => {
    if (!assignment || tab !== 'route' || assignment.status !== 'In Progress') return undefined;
    let cancelled = false;
    async function loadRoute() {
      setRouteLoading(true);
      const result = await previewSalesAreaAssignmentRoute(
        assignment.assignment_id,
        await readDeviceStartCoords()
      );
      if (cancelled) return;
      if (result.success) setRoutePreview(result.data);
      else {
        setRoutePreview(null);
        showToast?.(result.message || 'Failed to build route preview.', 'error');
      }
      setRouteLoading(false);
    }
    loadRoute();
    return () => { cancelled = true; };
  }, [assignment?.assignment_id, assignment?.status, tab, showToast]);

  const startDay = async () => {
    setUpdating(true);
    const result = await updateSalesAreaAssignmentStatus(assignmentId, 'In Progress');
    setUpdating(false);
    if (result.success && result.data) {
      showToast?.(result.message || 'Assignment updated.', 'success');
      setStartOpen(false);
      await reload();
    } else {
      showToast?.(result.message || 'Failed to update assignment.', 'error');
    }
  };

  const markDone = async () => {
    setUpdating(true);
    const result = await updateSalesAreaAssignmentStatus(assignmentId, 'Done');
    setUpdating(false);
    if (result.success && result.data) {
      showToast?.(result.message || 'Area marked as done.', 'success');
      setDoneOpen(false);
      await reload();
    } else {
      showToast?.(result.message || 'Failed to close out assignment.', 'error');
    }
  };

  if (loading) return <LoadingState message="Loading assigned area..." />;
  if (error || !assignment) {
    return (
      <EmptyState
        title="Assignment not found"
        description={error || 'This area assignment is not on your schedule.'}
        actionLabel="Back to Today's Schedule"
        onAction={() => navigate('/sales/schedule')}
      />
    );
  }

  const outcomes = assignment.outcomes || {};
  const activeWindow = coversToday(assignment, today);
  const isFuture = String(assignment.work_date || '') > today;
  const terminal = isTerminalStatus(assignment.status);
  const readOnly = terminal || !activeWindow;
  const canStart = activeWindow && assignment.status === 'Assigned';
  const canOperate = activeWindow && assignment.status === 'In Progress';
  const canonicalFar = outcomes.canonical_far || null;
  const farSubmitted = Boolean(outcomes.far_submitted || canonicalFar);
  const canComplete = canOperate && farSubmitted;
  const farHref = canonicalFar?.report_id
    ? `/sales/field-reports/${canonicalFar.report_id}`
    : `/sales/field-reports?assignmentId=${assignment.assignment_id}`;

  const salesRows = outcomes.sales || [];
  const customerRows = outcomes.customers || [];
  const reportRows = outcomes.field_reports_list || [];
  const activeReports = reportRows.filter((r) => !r.is_superseded);
  const supersededReports = reportRows.filter((r) => r.is_superseded);
  const ciRows = outcomes.credit_investigations_list || [];

  const areaLayers = buildMapLayers([assignment]);
  const routeMarkers = (routePreview?.stops || []).map((stop) => {
    const isOrigin = stop.kind === 'origin' || stop.sequence === 0;
    return {
      id: `stop-${stop.id}`,
      position: [Number(stop.lat), Number(stop.lng)],
      label: isOrigin ? 'S' : 'A',
      color: isOrigin ? '#0F766E' : '#0B2133',
      popup: `<strong>${stop.label || (isOrigin ? 'Start' : 'Canvassing area')}</strong>${
        isOrigin && stop.source ? `<br/><em>Origin: ${stop.source}</em>` : ''
      }`,
    };
  });
  const routePolylines = routePreview?.polyline?.length
    ? [{ id: 'visit-route', positions: routePreview.polyline, color: '#0B2133' }]
    : [];
  const routeFit = [
    ...areaLayers.fitBounds,
    ...routeMarkers.map((m) => m.position),
    ...(routePreview?.polyline || []),
  ];

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <div>
            <h3>{assignment.area_name || 'Assigned Area'}</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              {formatDateRange(assignment)} · <StatusBadge status={assignment.status} />
            </p>
            {isFuture ? (
              <p className="muted" style={{ marginTop: 4 }}>
                Upcoming assignment — start and field actions unlock when coverage begins.
              </p>
            ) : null}
            {terminal ? (
              <p className="muted" style={{ marginTop: 4 }}>
                This assignment is closed. Field actions are read-only.
              </p>
            ) : null}
          </div>
          <div className="list-section-actions flex flex-wrap gap-2">
            {canStart ? (
              <button className="button" type="button" disabled={updating} onClick={() => setStartOpen(true)}>
                Start Day
              </button>
            ) : null}
            {canOperate ? (
              <>
                <button
                  className="button"
                  type="button"
                  disabled={updating || !canComplete}
                  title={!canComplete ? 'Submit your Field Activity Report before completing this assignment.' : undefined}
                  onClick={() => setDoneOpen(true)}
                >
                  Mark Done
                </button>
                <button className="button secondary" type="button" onClick={() => navigate('/sales/log-sale')}>
                  Log Sale
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setFindModalOpen(true)}
                >
                  Add Customer
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => navigate(farHref)}
                >
                  {farSubmitted ? 'View / Edit FAR' : 'Submit FAR'}
                </button>
              </>
            ) : null}
            {terminal && canonicalFar?.report_id ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`/sales/field-reports/${canonicalFar.report_id}`)}
              >
                View FAR
              </button>
            ) : null}
          </div>
        </div>
        {canOperate && !farSubmitted ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Submit your Field Activity Report before completing this assignment. Sales and new customers are optional.
          </p>
        ) : null}
        {farSubmitted ? (
          <p className="muted" style={{ marginTop: 8 }}>
            Field Activity Report submitted{canonicalFar?.activity_type ? ` · ${canonicalFar.activity_type}` : ''}.
          </p>
        ) : null}

        <div className="segmented-control" style={{ marginTop: 12 }}>
          {DETAIL_TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={tab === option.key ? 'segment active' : 'segment'}
              onClick={() => setTab(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'overview' ? (
        <section className="panel content-panel">
          <DetailRowsTable
            rows={[
              { label: 'Area / Location', value: assignment.area_name || '—' },
              { label: 'Territory', value: assignment.territory_name || '—' },
              { label: 'Coverage window', value: formatDateRange(assignment) },
              { label: 'Status', value: <StatusBadge status={assignment.status} /> },
              {
                label: "Branch Head's Notes",
                value: assignment.coverage_notes || 'No special instructions.',
              },
              { label: 'Assigned by', value: assignment.assigned_by_name || 'Branch Head' },
              {
                label: 'Started',
                value: assignment.started_at ? formatDisplayDateTime(assignment.started_at) : '—',
              },
              {
                label: 'Completed',
                value: assignment.completed_at ? formatDisplayDateTime(assignment.completed_at) : '—',
              },
              {
                label: 'Progress',
                value: `${outcomes.sales_logged || 0} sales · ${outcomes.new_customers || 0} new customers · FAR ${farSubmitted ? 'submitted' : 'not submitted'}`,
              },
              assignment.closure_notes
                ? { label: 'Closeout notes', value: assignment.closure_notes }
                : null,
            ].filter(Boolean)}
          />
          {!canStart && !canOperate && !terminal ? (
            <p className="muted" style={{ marginTop: 12 }}>
              {isFuture
                ? 'Start Day unlocks on the coverage window.'
                : 'This day is outside the assignment coverage window.'}
            </p>
          ) : null}
          {readOnly && !canStart ? (
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="button secondary" type="button" onClick={() => navigate('/sales/history')}>
                Sales History
              </button>
              <button className="button secondary" type="button" onClick={() => navigate('/sales/customers')}>
                Customers
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`/sales/field-reports?assignmentId=${assignment.assignment_id}`)}
              >
                Field Activity Reports
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'customers' ? (
        <section className="panel content-panel">
          <div className="list-section-header">
            <div>
              <h3>Customers in coverage</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Territory match or within the area radius. Ownership is not changed from this list.
              </p>
            </div>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/customers')}>
              Find Customer
            </button>
          </div>
          {customersLoading ? (
            <LoadingState message="Finding customers in this area..." />
          ) : !customers.length ? (
            <EmptyState
              title="No customers found in this coverage"
              description="Use Find Customer if you need a branch-wide search, or add a new customer while In Progress."
            />
          ) : (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Territory</th>
                    <th>Distance</th>
                    <th>Flags</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.customer_id}
                      className="clickable-row"
                      onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=schedule`)}
                    >
                      <td>
                        <strong>{customer.customer_name || '—'}</strong>
                        <div className="muted">{customer.contact_phone || customer.customer_code || ''}</div>
                      </td>
                      <td>{customer.territory_name || '—'}</td>
                      <td>
                        {customer.distance_meters != null
                          ? `${customer.distance_meters} m`
                          : customer.missing_coords
                            ? 'No pin'
                            : '—'}
                      </td>
                      <td>
                        {[
                          customer.in_book ? 'In book' : null,
                          customer.territory_match ? 'Territory' : null,
                          customer.missing_coords ? 'Missing coords' : null,
                        ].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=schedule`)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'route' ? (
        <section className="panel content-panel">
          <div className="list-section-header">
            <div>
              <h3>Route and Map</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Directions from your current location (or branch) to the assigned canvassing area — not a customer visit tour.
              </p>
            </div>
            {canOperate ? (
              <button
                className="button secondary"
                type="button"
                disabled={routeLoading}
                onClick={async () => {
                  setRouteLoading(true);
                  const result = await previewSalesAreaAssignmentRoute(
                    assignment.assignment_id,
                    await readDeviceStartCoords()
                  );
                  setRouteLoading(false);
                  if (result.success) setRoutePreview(result.data);
                  else showToast?.(result.message || 'Failed to refresh route.', 'error');
                }}
              >
                {routeLoading ? 'Updating…' : 'Refresh route'}
              </button>
            ) : null}
          </div>

          {hasCoords(assignment) || routeMarkers.length ? (
            <LeafletMap
              center={areaLayers.center}
              zoom={14}
              height={420}
              markers={[
                ...areaLayers.markers.map((m) => ({ ...m, label: 'A', popup: `${m.popup}<br/><em>Canvassing area</em>` })),
                ...routeMarkers.filter((m) => m.id === 'stop-origin' || String(m.id).includes('origin')),
              ]}
              circles={areaLayers.circles}
              polylines={routePolylines}
              fitBounds={routeFit.length ? routeFit : areaLayers.fitBounds}
            />
          ) : (
            <EmptyState
              title="No map pin on this assignment"
              description="Your Branch Head can set coordinates when assigning the area."
            />
          )}

          <p className="muted" style={{ marginTop: 8 }}>
            Legend: S = start (device or branch) · A / circle = canvassing area
            {routePreview?.provider ? ` · provider: ${routePreview.provider}` : ''}
          </p>
          {routePreview?.note ? <p className="muted">{routePreview.note}</p> : null}
          {routePreview?.distance_km != null || routePreview?.duration_min != null ? (
            <p className="muted" style={{ marginTop: 4 }}>
              About {Number(routePreview.distance_km || 0).toFixed(1)} km
              {routePreview.duration_min != null ? ` · ~${Math.round(Number(routePreview.duration_min))} min` : ''}
            </p>
          ) : null}

          {assignment.status !== 'In Progress' ? (
            <p className="muted">Start the day to generate directions from your location to this canvassing area.</p>
          ) : routeLoading ? (
            <LoadingState message="Building route to canvassing area..." />
          ) : routePreview?.stops?.length ? (
            <div className="corvex-table-wrapper" style={{ marginTop: 12 }}>
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Point</th>
                  </tr>
                </thead>
                <tbody>
                  {routePreview.stops.map((stop) => (
                    <tr key={stop.id}>
                      <td>{stop.kind === 'origin' || stop.sequence === 0 ? 'Start' : 'Area'}</td>
                      <td>{stop.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Could not build route"
              description="Allow location access, or ensure the branch and assigned area have map pins."
            />
          )}

          <div className="flex justify-end gap-2 mt-3">
            <button className="button secondary" type="button" onClick={() => navigateToArea(assignment, showToast)}>
              Open area in Maps / Directions
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'activities' ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Field Activities</h3>
            <p className="muted">
              Sales, new customers, FARs, and credit reviews recorded during this coverage window.
            </p>
          </div>

          {!salesRows.length && !customerRows.length && !reportRows.length && !ciRows.length ? (
            <EmptyState
              title="No outcomes yet"
              description="Log sales, register customers, or submit FARs while the assignment is In Progress."
            />
          ) : (
            <>
              {salesRows.length ? (
                <>
                  <h4 className="subsection-title">Sales logged</h4>
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Customer</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesRows.map((sale) => (
                          <tr
                            key={sale.sales_invoices_id || sale.invoice_number}
                            className="clickable-row"
                            onClick={() => navigate(`/sales/invoices/${encodeURIComponent(sale.invoice_number)}`)}
                          >
                            <td>{sale.invoice_number}</td>
                            <td>{sale.customer_name || '—'}</td>
                            <td>{formatMoney(sale.total_amount)}</td>
                            <td><StatusBadge status={sale.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {customerRows.length ? (
                <>
                  <h4 className="subsection-title" style={{ marginTop: 16 }}>Customers registered</h4>
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Phone</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerRows.map((customer) => (
                          <tr
                            key={customer.customer_id}
                            className="clickable-row"
                            onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=schedule`)}
                          >
                            <td>{customer.customer_name || '—'}</td>
                            <td>{customer.contact_phone || '—'}</td>
                            <td><StatusBadge status={customer.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {activeReports.length || supersededReports.length ? (
                <>
                  <h4 className="subsection-title" style={{ marginTop: 16 }}>Field Activity Report</h4>
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Outcome</th>
                          <th>Status</th>
                          <th>Submitted</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeReports.map((report) => (
                          <tr
                            key={report.report_id}
                            className="clickable-row"
                            onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                          >
                            <td>{report.activity_type || '—'}</td>
                            <td><StatusBadge status={report.review_status || 'Submitted'} /></td>
                            <td>{report.created_at ? formatDisplayDateTime(report.created_at) : '—'}</td>
                            <td>Current report</td>
                          </tr>
                        ))}
                        {supersededReports.map((report) => (
                          <tr
                            key={report.report_id}
                            className="clickable-row"
                            onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                          >
                            <td>{report.activity_type || '—'}</td>
                            <td><StatusBadge status="Superseded" /></td>
                            <td>{report.created_at ? formatDisplayDateTime(report.created_at) : '—'}</td>
                            <td className="muted">Prior submission (kept for history)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {ciRows.length ? (
                <>
                  <h4 className="subsection-title" style={{ marginTop: 16 }}>Credit Reviews</h4>
                  <div className="corvex-table-wrapper">
                    <table className="corvex-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Purpose</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ciRows.map((ci) => (
                          <tr
                            key={ci.ci_id}
                            className="clickable-row"
                            onClick={() => navigate(`/sales/credit-investigations/${ci.ci_id}`)}
                          >
                            <td>{ci.customer_name || '—'}</td>
                            <td>{ci.purpose || '—'}</td>
                            <td><StatusBadge status={ci.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/schedule')}>
          Back to Today&apos;s Schedule
        </button>
      </div>

      {startOpen ? (
        <div className="modal-overlay" onClick={() => !updating && setStartOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3>Start Day</h3>
            <p className="muted">
              Start covering <strong>{assignment.area_name || 'this area'}</strong> now?
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="button ghost" type="button" disabled={updating} onClick={() => setStartOpen(false)}>
                Cancel
              </button>
              <button className="button" type="button" disabled={updating} onClick={startDay}>
                {updating ? 'Starting…' : 'Confirm Start'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {doneOpen ? (
        <div className="modal-overlay" onClick={() => !updating && setDoneOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>Mark assignment Done</h3>
            <p className="muted">
              This closes the assigned area. Your Field Activity Report remains the record of overall outcome.
              Sales and new customers are optional and are not required for completion.
            </p>
            <div className="muted" style={{ marginTop: 8 }}>
              {outcomes.sales_logged || 0} sales · {outcomes.new_customers || 0} new customers · FAR submitted
              {canonicalFar?.activity_type ? ` (${canonicalFar.activity_type})` : ''}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="button ghost" type="button" disabled={updating} onClick={() => setDoneOpen(false)}>
                Cancel
              </button>
              <button className="button" type="button" disabled={updating || !farSubmitted} onClick={markDone}>
                {updating ? 'Saving…' : 'Confirm Done'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FindExistingCustomerModal
        open={findModalOpen}
        onClose={() => setFindModalOpen(false)}
        navigate={navigate}
        showToast={showToast}
        registerPath={`/sales/customers/new?assignmentId=${assignment.assignment_id}${assignment.territory_id ? `&territoryId=${assignment.territory_id}` : ''}`}
      />
    </div>
  );
}
