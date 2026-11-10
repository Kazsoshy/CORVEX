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
import {
  getBranchStaff,
  getBranchCollectorDetail,
  fetchCollectorSawPriority,
  previewCollectorCollectionRoute,
  assignCollectorCollectionRoute,
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

function assignmentStatusLabel(row, assignedIds) {
  if (row.assignment_block === 'assigned_to_other_collector') {
    return `Already assigned to ${row.assigned_collector_name || 'another collector'}`;
  }
  if (row.assignment_block === 'already_scheduled' || assignedIds.has(String(row.customer_id))) {
    return 'Already on this route';
  }
  if (row.book_status === 'unassigned') return 'Unassigned book';
  if (row.book_status === 'own_book') return 'In account book';
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
      if (routeStatus !== 'all' && String(c.todayRouteStatus || 'No Route') !== routeStatus) return false;
      if (!q) return true;
      const hay = [
        c.name,
        c.email,
        c.employeeCode,
        c.phone,
        c.branchName,
      ].map((v) => String(v || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [collectors, search, routeStatus, activeStatus]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  if (loading) return <LoadingState variant="dashboard" message="Loading collector dispatch roster..." />;

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3>Collector Dispatch</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              {orgScope
                ? 'Organization-wide collectors. Open a collector to review priority candidates and publish a route.'
                : `Collectors assigned to ${currentUser?.branch?.name || 'your branch'} only. Open a collector to review priorities and publish today's route.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-4">
          <label className="flex flex-col gap-1 text-sm">
            Dispatch date
            <input
              type="date"
              className="input"
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
            />
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
            Route status
            <select className="filter-select" value={routeStatus} onChange={(e) => setRouteStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="No Route">No Route</option>
              <option value="Published">Published</option>
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
            title="No collectors are currently assigned to your branch"
            description={orgScope
              ? 'No collectors match the current filters.'
              : 'Contact the Operating Manager to create a Collector account.'}
          />
        ) : (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Collector</th>
                    <th>Employee Information</th>
                    <th>Contact</th>
                    {orgScope ? <th>Branch</th> : null}
                    <th>Account Book</th>
                    <th>Today&apos;s Route</th>
                    <th>Stops</th>
                    <th>Completed</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="clickable-row"
                      onClick={() => navigate(`${opsBase}/field-operations/collectors/${c.id}?date=${encodeURIComponent(dispatchDate)}`)}
                    >
                      <td><strong>{c.name}</strong></td>
                      <td>
                        <div>{c.employeeCode || '—'}</div>
                        <div className="text-ink/70" style={{ fontSize: '0.85rem' }}>{c.email || '—'}</div>
                      </td>
                      <td>{c.phone ? formatPhone(c.phone) : '—'}</td>
                      {orgScope ? <td>{c.branchName || '—'}</td> : null}
                      <td>{c.accountBookSize ?? 0}</td>
                      <td><StatusBadge status={c.todayRouteStatus || 'No Route'} /></td>
                      <td>{c.todayStops ?? 0}</td>
                      <td>{c.todayCompleted ?? 0}</td>
                      <td>{c.todayRemaining ?? 0}</td>
                      <td><StatusBadge status={c.status || 'Active'} /></td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => navigate(`${opsBase}/field-operations/collectors/${c.id}?date=${encodeURIComponent(dispatchDate)}`)}
                        >
                          Open Dispatch
                        </button>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View on Field Map"
                          onClick={() => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(c.id)}`)}
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
  const paginationSaw = usePagination(sawRows);
  const paginationRoute = usePagination(publishedRoute);
  const paginationPreview = usePagination(previewRows);
  const mapCenter = detail?.mapMarkers?.[0]?.position || [7.1907, 125.4553];

  function toggleSelected(customerId) {
    const id = String(customerId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectTopN(n = 5) {
    const picks = sawRows
      .filter((row) => !row.assignment_block && !assignedIds.has(String(row.customer_id)))
      .slice(0, n)
      .map((row) => String(row.customer_id));
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

  return (
    <div className="page">
      <section className="panel content-panel relative overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start">
          <div>
            <h3>{profile.name}</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Operational collector profile for dispatch — not an HR record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              Dispatch date
              <input
                type="date"
                className="input"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`${opsBase}/leaflet?staff=${encodeURIComponent(collectorId)}`)}
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
              <tr><th>Contact Number</th><td>{profile.phone ? formatPhone(profile.phone) : '—'}</td></tr>
              <tr><th>Account Status</th><td><StatusBadge status={profile.status || 'Active'} /></td></tr>
              <tr><th>Branch</th><td>{profile.branchName || '—'}</td></tr>
              <tr><th>Date Joined</th><td>{profile.joinedAt ? formatDisplayDate(profile.joinedAt) : '—'}</td></tr>
              <tr>
                <th>Permanent Customer Book</th>
                <td>
                  {profile.accountBookSize ?? 0}
                  <span className="text-ink/70"> (customers where this collector is the Assigned Collector)</span>
                </td>
              </tr>
              <tr><th>Route Status</th><td><StatusBadge status={profile.todayRouteStatus || 'No Route'} /></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <Stats stats={[
        { label: 'Eligible Customers', value: String(sawMeta?.stats?.ranked ?? routeStats.eligibleCustomers ?? sawRows.length ?? 0) },
        { label: 'Customers in This Book', value: String(routeStats.customersInBook ?? profile.accountBookSize ?? 0) },
        { label: 'Already Assigned Today', value: String(routeStats.alreadyAssignedToday ?? publishedRoute.length ?? 0) },
        { label: 'Published Stops', value: String(routeStats.publishedStops ?? publishedRoute.length ?? 0) },
        { label: 'Blocked Assignments', value: String(sawMeta?.stats?.blocked ?? routeStats.blockedAssignments ?? 0) },
      ]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Priority Candidates</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              System-ranked eligible customers for {formatDisplayDate(scheduledDate)}. Review, optimize, then publish.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button className="button secondary" type="button" disabled={assignBusy} onClick={() => selectTopN(5)}>
              Select Top 5
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={assignBusy || selectedIds.size === 0}
              onClick={() => runPreview()}
            >
              Optimize Route
            </button>
            <button
              className="button"
              type="button"
              disabled={assignBusy || selectedIds.size === 0}
              onClick={() => publishRoute()}
            >
              Confirm &amp; Publish ({selectedIds.size})
            </button>
          </div>
        </div>

        {emptyBook && !sawRows.length ? (
          <EmptyState
            title="No eligible customers are currently assigned to this Collector's portfolio or territories."
            description="Eligibility uses permanent Account Manager ownership and Active territories where this Collector is the default Collector. The whole branch is never used as a fallback."
          />
        ) : sawRows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Priority</th>
                    <th>Customer</th>
                    <th>Code</th>
                    <th>Priority Score</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                    <th>Due Date</th>
                    <th>Assigned Collector</th>
                    <th>Territory</th>
                    <th>Assignment Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginationSaw.paginatedData.map((row) => {
                    const id = String(row.customer_id);
                    const blocked = Boolean(row.assignment_block) || assignedIds.has(id);
                    const otherBook = row.book_status === 'other_book';
                    return (
                      <tr key={id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            disabled={blocked}
                            title={blocked ? assignmentStatusLabel(row, assignedIds) : 'Select for publish'}
                            onChange={() => toggleSelected(id)}
                            aria-label={`Select ${row.customer_name}`}
                          />
                        </td>
                        <td><strong>#{row.rank}</strong></td>
                        <td>
                          {row.customer_name}
                          {otherBook ? <div className="text-ink/70" style={{ fontSize: '0.8rem' }}>Off-book exception</div> : null}
                        </td>
                        <td>{row.customer_code || '—'}</td>
                        <td>{row.score != null ? Number(row.score).toFixed(3) : '—'}</td>
                        <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                        <td>{row.days_overdue ?? 0} days</td>
                        <td>{row.due_date ? formatDisplayDate(row.due_date) : '—'}</td>
                        <td>{row.account_manager_name || (row.book_status === 'unassigned' ? 'Unassigned' : '—')}</td>
                        <td>{row.territory_name || '—'}</td>
                        <td>
                          {blocked ? (
                            <span className="text-ink/70">{assignmentStatusLabel(row, assignedIds)}</span>
                          ) : (
                            <StatusBadge status="Eligible" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationSaw} />
          </>
        ) : (
          <EmptyState
            title="No eligible customers for this date"
            description="Eligible customers need an open balance, coordinates, and either this Collector's permanent book or an Active territory where they are the default Collector."
          />
        )}
      </section>

      {previewRows.length ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3>Proposed Visiting Order</h3>
              <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
                {roadProviderNote(previewMeta?.roadProvider) || 'Review the recommended stop order before publishing.'}
                {' '}Priority Score remains separate from travel sequence.
              </p>
            </div>
            <button className="button" type="button" disabled={assignBusy} onClick={() => publishRoute(previewRows.map((r) => r.customer_id))}>
              Publish This Route
            </button>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Customer</th>
                  <th>Priority Score</th>
                  <th>Outstanding</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {paginationPreview.paginatedData.map((row) => (
                  <tr key={row.customer_id}>
                    <td><strong>#{row.route_sequence || row.rank}</strong></td>
                    <td>{row.customer_name}</td>
                    <td>{row.score != null ? Number(row.score).toFixed(3) : '—'}</td>
                    <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                    <td>{row.address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...paginationPreview} />
        </section>
      ) : null}

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Today&apos;s Published Route</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Published collection visits for {formatDisplayDate(scheduledDate)}. Same records the collector executes.
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
            description="Select eligible customers, review the proposed order, then confirm and publish."
          />
        )}
        <div style={{ marginTop: 16 }}>
          <LeafletMap
            center={mapCenter}
            zoom={13}
            height={400}
            polylines={detail?.polylines || []}
            markers={detail?.mapMarkers || []}
          />
          {!detail?.mapMarkers?.length ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Route map shows published stops with coordinates in visiting order. Road paths appear on Field Map when routing data is available.
            </p>
          ) : null}
        </div>
      </section>

      {detail?.history?.length ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header"><h3>Route History</h3></div>
          <p className="muted">Previous collection visits — separate from today&apos;s published route.</p>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.slice(0, 15).map((h) => (
                  <tr key={h.visitId}>
                    <td>{formatDisplayDate(h.scheduledDate)}</td>
                    <td>{h.account}</td>
                    <td><StatusBadge status={h.status} /></td>
                    <td>{formatCurrency(h.outstandingBalance || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations/collectors`)}>
          Back to Collectors
        </button>
      </div>
    </div>
  );
}
