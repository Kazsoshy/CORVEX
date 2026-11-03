import { useEffect, useMemo, useState } from 'react';
import {
  fetchSalesAreaAssignmentById,
  fetchSalesAreaAssignments,
  updateSalesAreaAssignmentStatus,
} from '../../api/salesService';
import { formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';
import { openExternalNavigation } from '../../utils/mapsNavigation';
import { usePagination } from '../../hooks/usePagination';
import LeafletMap from '../common/LeafletMap';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { Pagination } from '../shared/Pagination';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function statusColor(status) {
  if (status === 'Done') return '#1A4162';
  if (status === 'In Progress') return '#0B1E30';
  return '#64748b';
}

function productsLabel(assignment) {
  const products = assignment?.products_to_push || [];
  if (!products.length) return '—';
  return products.map((p) => p.product_name).join(', ');
}

function hasCoords(assignment) {
  return Number.isFinite(Number(assignment?.latitude)) && Number.isFinite(Number(assignment?.longitude));
}

function buildMapLayers(assignments) {
  const withGeo = (assignments || []).filter(hasCoords);
  const markers = withGeo.map((a) => ({
    id: `m-${a.assignment_id}`,
    position: [Number(a.latitude), Number(a.longitude)],
    label: String(a.area_name || '').slice(0, 1).toUpperCase() || 'A',
    color: statusColor(a.status),
    popup: `<strong>${a.area_name || 'Area'}</strong><br/>${a.work_date || '—'} · ${a.status || '—'}`,
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

const SCOPE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'history', label: 'History' },
];

export function SchedulePage({ pageType, navigate, showToast }) {
  const [scope, setScope] = useState('today');
  const [assignments, setAssignments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showMap, setShowMap] = useState(pageType === 'scheduleMap');

  useEffect(() => {
    setShowMap(pageType === 'scheduleMap');
  }, [pageType]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchSalesAreaAssignments({ scope });
      if (cancelled) return;
      if (result.success) {
        setAssignments(result.data || []);
        setSummary(result.meta?.summary || null);
      } else {
        setAssignments([]);
        setSummary(null);
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
        row.status,
        productsLabel(row),
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
      ? { title: 'No past area assignments yet', description: 'Completed canvass days will show up in History.' }
      : { title: 'No area assigned for today — ask your Branch Head.', description: 'Your Branch Head assigns where you canvass. Check back once a territory is scheduled.' };

  const goList = () => {
    if (pageType === 'scheduleMap') navigate('/sales/schedule');
    else setShowMap(false);
  };
  const goMap = () => {
    if (pageType === 'scheduleMap') setShowMap(true);
    else navigate('/sales/schedule/map');
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
              Territory or area assigned by your Branch Head for this date — canvass and find customers here.
            </p>
          </div>
          <div className="list-section-actions">
            <div className="segmented-control">
              <button
                className={!showMap && pageType !== 'scheduleMap' ? 'segment active' : 'segment'}
                type="button"
                onClick={goList}
              >
                List
              </button>
              <button
                className={showMap || pageType === 'scheduleMap' ? 'segment active' : 'segment'}
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

        {scope === 'today' && summary ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {summary.areas_assigned
              ? `${summary.areas_assigned} area${summary.areas_assigned === 1 ? '' : 's'} · ${summary.areas_in_progress || 0} in progress · ${summary.areas_done || 0} done`
              : `Manila date ${manilaToday()}`}
            {summary.sales_logged != null || summary.new_customers != null
              ? ` · Sales logged today: ${summary.sales_logged || 0} · New customers: ${summary.new_customers || 0}`
              : null}
          </p>
        ) : null}

        {showMap || pageType === 'scheduleMap' ? (
          <>
            {filtered.length && mapLayers.markers.length ? (
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
            )}
            <p className="muted">
              Showing assigned canvass areas (pin + radius), not customer routes.
              {filtered.length ? ` · ${filtered.length} area${filtered.length === 1 ? '' : 's'}` : ''}
            </p>
          </>
        ) : null}

        {!assignments.length ? (
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
        ) : !filtered.length ? (
          <EmptyState
            title="No areas match these filters"
            description="Try another search or tab."
            actionLabel="Clear search"
            onAction={() => setSearch('')}
          />
        ) : !(showMap || pageType === 'scheduleMap') || filtered.length ? (
          <>
            {(showMap || pageType === 'scheduleMap') ? (
              <div className="panel-section-header" style={{ marginTop: 12 }}>
                <h3>Assigned areas</h3>
              </div>
            ) : null}
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Area / Location</th>
                    <th>Work Date</th>
                    <th>Status</th>
                    <th>Notes from BM</th>
                    <th>Products to Push</th>
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
                      <td>{row.work_date ? formatDisplayDate(row.work_date) : '—'}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td
                        style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={row.coverage_notes || ''}
                      >
                        {row.coverage_notes || '—'}
                      </td>
                      <td
                        style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={productsLabel(row)}
                      >
                        {productsLabel(row)}
                      </td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Open"
                          onClick={() => navigate(`/sales/schedule/${row.assignment_id}`)}
                        >
                          <NavIcon name="view" />
                        </button>
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Open in Maps"
                          onClick={() => navigateToArea(row, showToast)}
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
        ) : null}
      </section>
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

  const updateStatus = async (status) => {
    const confirmMessage = status === 'Done'
      ? 'Mark this area as done for the day? This records that you finished covering the assigned territory.'
      : 'Start covering this assigned area now?';
    if (!window.confirm(confirmMessage)) return;

    setUpdating(true);
    const result = await updateSalesAreaAssignmentStatus(assignmentId, status);
    setUpdating(false);
    if (result.success && result.data) {
      showToast?.(result.message || 'Assignment updated.', 'success');
      await reload();
    } else {
      showToast?.(result.message || 'Failed to update assignment.', 'error');
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

  const mapLayers = buildMapLayers([assignment]);
  const products = assignment.products_to_push || [];
  const outcomes = assignment.outcomes || {};
  const workDate = String(assignment.work_date || '');
  const isPast = Boolean(workDate && workDate < today);
  const isFuture = Boolean(workDate && workDate > today);
  const isDone = assignment.status === 'Done';
  const readOnlyExecution = isPast || isDone || isFuture;
  const canStart = !readOnlyExecution && assignment.status === 'Assigned';
  const canComplete = !readOnlyExecution && (assignment.status === 'Assigned' || assignment.status === 'In Progress');

  const salesRows = outcomes.sales || [];
  const customerRows = outcomes.customers || [];
  const reportRows = outcomes.field_reports_list || [];
  const ciRows = outcomes.credit_investigations_list || [];
  const hasOutcomes = salesRows.length || customerRows.length || reportRows.length || ciRows.length;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <div>
            <h3>Assigned Area</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Canvass this area — find customers and log outcomes.
            </p>
            {(isPast || isDone) ? (
              <p className="muted" style={{ marginTop: 4 }}>
                History view — assignment details are read-only.
              </p>
            ) : null}
            {isFuture ? (
              <p className="muted" style={{ marginTop: 4 }}>
                Upcoming assignment — start and complete actions unlock on the work date.
              </p>
            ) : null}
          </div>
        </div>

        <DetailRowsTable
          rows={[
            { label: 'Area / Location', value: assignment.area_name || '—' },
            { label: 'Work Date', value: workDate ? formatDisplayDate(workDate) : '—' },
            { label: 'Status', value: <StatusBadge status={assignment.status} /> },
            {
              label: "Branch Head's Notes",
              value: assignment.coverage_notes || 'No special instructions.',
            },
            {
              label: 'Assigned by',
              value: assignment.assigned_by_name || 'Branch Head',
            },
            {
              label: 'Started',
              value: assignment.started_at ? formatDisplayDateTime(assignment.started_at) : '—',
            },
            {
              label: 'Completed',
              value: assignment.completed_at ? formatDisplayDateTime(assignment.completed_at) : '—',
            },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Area map</h3>
          <p className="muted">Where you are expected to canvass — not a customer route.</p>
        </div>
        {hasCoords(assignment) ? (
          <LeafletMap
            center={mapLayers.center}
            zoom={14}
            height={360}
            markers={mapLayers.markers}
            circles={mapLayers.circles}
            fitBounds={mapLayers.fitBounds}
          />
        ) : (
          <EmptyState
            title="No map pin on this assignment"
            description="Your Branch Head can set coordinates when assigning the area."
          />
        )}
        <div className="flex justify-end gap-2 mt-3">
          <button className="button secondary" type="button" onClick={() => navigateToArea(assignment, showToast)}>
            Open in Maps / Directions
          </button>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Products to push</h3>
        </div>
        {products.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.product_id}>
                    <td>{product.product_name}</td>
                    <td>{product.sku || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No specific products were attached to this assignment.</p>
        )}
      </section>

      {!readOnlyExecution || canStart || canComplete ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Day actions</h3>
            <p className="muted">
              Use existing sales workflows from here. You do not need a pre-listed customer to start the day.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStart ? (
              <button
                className="button"
                type="button"
                disabled={updating}
                onClick={() => updateStatus('In Progress')}
              >
                {updating ? 'Updating…' : 'Start Day / Mark In Progress'}
              </button>
            ) : null}
            <button className="button secondary" type="button" onClick={() => navigate('/sales/log-sale')}>
              Log a Sale
            </button>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/customers/new')}>
              Add Customer
            </button>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/customers')}>
              Find Customer
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate('/sales/customers')}
              title="Open a customer profile, then Request Credit Review"
            >
              Start Credit Review
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/sales/field-reports?assignmentId=${assignment.assignment_id}`)}
            >
              Submit Field Report
            </button>
            {canComplete ? (
              <button
                className="button"
                type="button"
                disabled={updating}
                onClick={() => updateStatus('Done')}
              >
                {updating ? 'Updating…' : 'Mark Area Done'}
              </button>
            ) : null}
          </div>
          {assignment.status === 'In Progress' ? (
            <p className="muted" style={{ marginTop: 8 }}>Area coverage is in progress.</p>
          ) : null}
        </section>
      ) : (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Day actions</h3>
            <p className="muted">
              {isFuture
                ? 'Start Day and Mark Area Done are available on the work date.'
                : 'This assignment is closed. You can still open past outcomes below.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button className="button secondary" type="button" onClick={() => navigate('/sales/credit-investigations')}>
              Credit Reviews
            </button>
          </div>
        </section>
      )}

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Today&apos;s Outcomes</h3>
          <p className="muted">
            Activity recorded on {workDate ? formatDisplayDate(workDate) : 'this work date'} while canvassing.
            These are outcomes — not the schedule itself.
          </p>
        </div>

        {!hasOutcomes ? (
          <EmptyState
            title="No outcomes yet — log sales or customers as you find them."
            description="Sales, new customers, FARs, and credit investigations from this work date will appear here."
          />
        ) : (
          <>
            {salesRows.length ? (
              <>
                <div className="panel-section-header" style={{ marginTop: 4 }}>
                  <h4 className="subsection-title">Sales logged</h4>
                </div>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Actions</th>
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
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Open invoice"
                              onClick={() => navigate(`/sales/invoices/${encodeURIComponent(sale.invoice_number)}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {customerRows.length ? (
              <>
                <div className="panel-section-header" style={{ marginTop: 16 }}>
                  <h4 className="subsection-title">Customers registered</h4>
                </div>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Actions</th>
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
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Open customer"
                              onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=schedule`)}
                            >
                              <NavIcon name="view" />
                            </button>
                            {!readOnlyExecution ? (
                              <button
                                className="icon-action-button"
                                type="button"
                                title="Start CI"
                                onClick={() => navigate(`/sales/ci-form/${customer.customer_id}?from=schedule`)}
                              >
                                <NavIcon name="edit" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {reportRows.length ? (
              <>
                <div className="panel-section-header" style={{ marginTop: 16 }}>
                  <h4 className="subsection-title">Field Activity Reports</h4>
                </div>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Area / Customer</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((report) => (
                        <tr
                          key={report.report_id}
                          className="clickable-row"
                          onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                        >
                          <td>{report.activity_type || '—'}</td>
                          <td>
                            {report.area_name ? <strong>{report.area_name}</strong> : null}
                            {report.customer_name ? (
                              <div className={report.area_name ? 'muted' : undefined}>{report.customer_name}</div>
                            ) : null}
                            {!report.area_name && !report.customer_name ? '—' : null}
                          </td>
                          <td>{report.created_at ? formatDisplayDateTime(report.created_at) : '—'}</td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Open report"
                              onClick={() => navigate(`/sales/field-reports/${report.report_id}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {ciRows.length ? (
              <>
                <div className="panel-section-header" style={{ marginTop: 16 }}>
                  <h4 className="subsection-title">Credit Reviews</h4>
                </div>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Actions</th>
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
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Open CI"
                              onClick={() => navigate(`/sales/credit-investigations/${ci.ci_id}`)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </td>
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

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/schedule')}>
          Back to Today&apos;s Schedule
        </button>
      </div>
    </div>
  );
}
