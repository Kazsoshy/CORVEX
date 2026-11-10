import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPaymentTimestamp, formatPhone } from '../../utils/formatters.js';
import {
  fetchAccountById,
  fetchSawPriority,
  mapSawRowToRouteStop,
  fetchCollectorDashboard,
  fetchCollectorPaymentMethods,
  submitCollectionPayment,
  submitFieldVisitOutcome,
} from '../../api/collectorService';
import { AccountsPage, AccountDetailPage } from './CollectorCustomers';
import {
  CollectionHistoryPage,
  CollectionPaymentDetailPage,
  DigitalReceiptPage,
  ReceiptsRedirectPage,
} from './CollectorHistory';
import { fetchNotifications } from '../../api/notificationService.js';
import { getCurrentUser } from '../../api/authService.js';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { flushOfflineQueue } from '../../offline/flushQueue.js';
import { isCollectorAutoSyncEnabled } from '../../offline/prefs.js';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import {
  collectorMapPath,
  hasCallablePhone,
  openExternalNavigation,
  openNavigateBackToCollector,
  openPhoneCall,
} from '../../utils/mapsNavigation';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import CollectionRouteMap from './CollectionRouteMap';
import { FieldActivityReportsPage, FieldActivityReportDetailPage } from './CollectorFieldReports';
import { fetchDrivingRoute, fetchRouteDepot } from '../../api/routingService';
import { StatusBadge } from '../StatusBadge';
function FormPanel({
  title,
  fields,
  formData,
  onChange,
  errors = {}
}) {
  return <section className="panel form-panel content-panel">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
        <h3>{title}</h3>
      </div>
      {fields.map(field => <div key={field.name} className="form-group">
          <label>
            {field.label}
            {field.required ? <span className="required">*</span> : null}
          </label>
          {field.type === 'text' && <input type="text" placeholder={field.placeholder} value={formData[field.name] ?? field.defaultValue ?? ''} onChange={e => onChange(field.name, e.target.value)} disabled={field.disabled} />}
          {field.type === 'number' && <input type="number" min={field.min} max={field.max} step={field.step ?? '0.01'} placeholder={field.placeholder} value={formData[field.name] ?? ''} onChange={e => onChange(field.name, e.target.value)} disabled={field.disabled} />}
          {field.type === 'textarea' && <textarea placeholder={field.placeholder} value={formData[field.name] ?? ''} onChange={e => onChange(field.name, e.target.value)} disabled={field.disabled} />}
          {field.type === 'select' && <select className="filter-select" value={formData[field.name] ?? ''} onChange={e => onChange(field.name, e.target.value)}>
              <option value="">{field.placeholder}</option>
              {field.options?.map(opt => <option key={opt} value={opt}>
                  {opt}
                </option>)}
            </select>}
          {field.type === 'toggle' && <label className="toggle-label">
              <input type="checkbox" checked={Boolean(formData[field.name])} onChange={e => onChange(field.name, e.target.checked)} />
              {field.toggleLabel}
            </label>}
          {field.type === 'file' && <input type="file" accept={field.accept ?? 'image/*'} onChange={e => onChange(field.name, e.target.files?.[0]?.name ?? '')} />}
          {field.type === 'preview' && <p className="field-preview">{field.value}</p>}
          {errors[field.name] ? <p className="form-error">{errors[field.name]}</p> : null}
        </div>)}
    </section>;
}
function collectorCall(account, showToast) {
  if (!openPhoneCall(account?.phone)) showToast('No phone number on file.', 'error');
}

function collectorOpenMap(account, navigate, parentContext = 'accounts') {
  const path = collectorMapPath(account?.id, parentContext);
  if (path) navigate(path);
}

function resolveCollectorNotificationPath(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('schedule') || c.includes('route') || c.includes('visit')) return '/collector/route';
  if (c.includes('receipt') || c.includes('collection')) return '/collector/history';
  if (c.includes('ci') || c.includes('credit')) return '/collector/accounts';
  return '/collector/notifications';
}

function greetingForNow() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    hour12: false,
  }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function manilaDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function DashboardPage({
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const todayIso = manilaDateInputValue();
  const todayLabel = formatDisplayDate(todayIso);
  const [dashboard, setDashboard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [offlinePending, setOfflinePending] = useState(0);
  const online = isBrowserOnline();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      const [dashRes, notifRes, pendingPayments, pendingReports] = await Promise.all([
        fetchCollectorDashboard(),
        fetchNotifications(),
        loadWaiting('collection_payment').catch(() => []),
        loadWaiting('field_activity_reports').catch(() => []),
      ]);
      if (cancelled) return;
      if (dashRes.success) setDashboard(dashRes.data);
      else {
        setDashboard(null);
        setLoadError(dashRes.message || 'Failed to load dashboard.');
        if (showToast) showToast(dashRes.message || 'Failed to load dashboard.', 'error');
      }
      if (notifRes.success) {
        const rows = notifRes.data || [];
        setUnreadCount(rows.filter((n) => n.status !== 'Read' && !n.read).length);
      }
      setOfflinePending((pendingPayments?.length || 0) + (pendingReports?.length || 0));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [showToast]);

  const agentName = currentUser?.fullName || 'Collector';
  const summary = dashboard?.summary || {};
  const recentCollections = dashboard?.recentCollections || [];
  const recentFieldReports = dashboard?.recentFieldReports || [];
  const nextStop = dashboard?.nextStop || null;
  const routePublished = Boolean(summary.routePublished);
  const routeTotal = Number(summary.routeStopsTotal || 0);
  const routeCompleted = Number(summary.routeStopsCompleted || 0);
  const routeRemaining = Number(
    summary.routeStopsRemaining != null
      ? summary.routeStopsRemaining
      : Math.max(0, routeTotal - routeCompleted)
  );
  const routeProgress = routePublished ? Number(summary.routeProgressPercent || 0) : 0;
  const collectionsToday = Number(summary.collectionsToday || 0);
  const unsuccessfulToday = Number(summary.unsuccessfulVisitsToday || 0);

  let greetingSub = 'Check your notifications and collection history while you wait for a published route.';
  if (routePublished && routeRemaining > 0) {
    greetingSub = `You have ${routeRemaining} assigned stop${routeRemaining === 1 ? '' : 's'} remaining today. Let's get started.`;
  } else if (routePublished && routeRemaining === 0) {
    greetingSub = 'All assigned visits completed. Review collections or file any remaining field reports.';
  } else if (!routePublished) {
    greetingSub = 'No collection route has been published for today yet.';
  }

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return (
    <div className="page collector-dashboard">
      {!online ? (
        <p className="muted" role="status">
          You are offline. Showing the last loaded dashboard when available; sync pending records when you reconnect.
        </p>
      ) : null}
      {offlinePending > 0 ? (
        <p className="muted" role="status">
          {offlinePending} offline record{offlinePending === 1 ? '' : 's'} waiting to sync — open Settings to sync now.
        </p>
      ) : null}

      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{greetingForNow()}</p>
          <h2>{agentName}!</h2>
          <p className="muted">{todayLabel}</p>
          <p className="muted" style={{ marginTop: 4 }}>{greetingSub}</p>
        </div>
      </section>

      {loadError && !dashboard ? (
        <EmptyState
          title="Dashboard unavailable"
          description={loadError}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      ) : (
        <>
          <StatsGrid
            stats={[
              {
                label: `${collectionsToday} collection${collectionsToday === 1 ? '' : 's'} today`,
                value: formatCurrency(summary.amountCollectedToday ?? 0),
                title: 'Collected Today',
                icon: 'philippine-peso',
                onClick: () => navigate('/collector/history'),
              },
              {
                label: routePublished ? `${routeProgress}% completed` : 'No route assigned',
                value: routePublished ? `${routeCompleted} / ${routeTotal}` : '—',
                title: 'Route Completion',
                icon: 'route',
                onClick: () => navigate('/collector/route'),
              },
              {
                label: !routePublished
                  ? 'No route assigned today'
                  : routeRemaining === 0
                    ? 'All stops completed'
                    : 'Continue your assigned route',
                value: !routePublished ? '—' : String(routeRemaining),
                title: 'Remaining Stops',
                icon: 'map-pin',
                onClick: () => navigate('/collector/route'),
              },
              {
                label: 'Unsuccessful or issue outcomes',
                value: String(unsuccessfulToday),
                title: 'Unsuccessful / Issue Visits Today',
                icon: 'alert-triangle',
                onClick: () => navigate('/collector/field-reports'),
              },
            ]}
          />

          <section className="panel content-panel collector-dash-actions">
            <div className="dashboard-actions collector-action-strip">
              <button className="button" type="button" onClick={() => navigate('/collector/route')}>
                <NavIcon name="route" /> Open Today&apos;s Route
              </button>
              <button className="button secondary" type="button" onClick={() => navigate('/collector/field-reports')}>
                <NavIcon name="file-text" /> File Field Report
              </button>
              <button className="button ghost" type="button" onClick={() => navigate('/collector/history')}>
                <NavIcon name="history" /> Collection History
              </button>
            </div>
          </section>

          <section className="panel content-panel visit-progress-panel">
            <div className="list-section-header">
              <div>
                <h3 style={{ margin: 0 }}>Today&apos;s Route Progress</h3>
                {routePublished ? (
                  <p className="list-section-subtitle muted" style={{ margin: '4px 0 0' }}>
                    {routeCompleted} of {routeTotal} stops completed · {routeRemaining} remaining
                  </p>
                ) : null}
              </div>
              <button className="button secondary" type="button" onClick={() => navigate('/collector/route')}>
                View Today&apos;s Route
              </button>
            </div>
            {routePublished ? (
              <>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={routeProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${routeProgress}% of today's route completed`}
                >
                  <div className="progress-fill" style={{ width: `${routeProgress}%` }} />
                </div>
                <p className="muted progress-caption">{routeProgress}% completed</p>
              </>
            ) : (
              <EmptyState
                title="No route assigned today"
                description="Your Branch Manager has not published your collection route yet. Check again later or review your collection history."
                actionLabel="Open Route Page"
                onAction={() => navigate('/collector/route')}
              />
            )}
          </section>

          {routePublished ? (
            <section className="panel content-panel">
              <div className="list-section-header">
                <h3 style={{ margin: 0 }}>Today&apos;s Next Stop</h3>
              </div>
              {nextStop ? (
                <div className="collector-next-stop">
                  <div>
                    <strong>{nextStop.customer_name}</strong>
                    {nextStop.customer_code ? (
                      <span className="muted"> · {nextStop.customer_code}</span>
                    ) : null}
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {formatCurrency(nextStop.outstanding_balance || 0)}
                      {nextStop.days_overdue > 0 ? ` · ${nextStop.days_overdue} day${nextStop.days_overdue === 1 ? '' : 's'} overdue` : ''}
                      {nextStop.address ? ` · ${nextStop.address}` : ''}
                    </p>
                    <p className="muted" style={{ margin: '2px 0 0' }}>
                      Visit status: {nextStop.status || 'Pending'}
                    </p>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={() => navigate(`/collector/account-detail/${nextStop.customer_id}?from=route`)}
                  >
                    View Stop
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>All assigned visits completed.</p>
              )}
            </section>
          ) : null}

          <div className="dashboard-widgets grid two-up">
            <section className="panel content-panel relative overflow-hidden">
              <div className="list-section-header">
                <h3 style={{ margin: 0 }}>Recent Collections</h3>
                <button className="button ghost" type="button" onClick={() => navigate('/collector/history')}>
                  View All Collections
                </button>
              </div>
              {recentCollections.length ? (
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Receipt</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date &amp; Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCollections.map((item) => (
                        <tr
                          key={item.collectionpayment_id}
                          className="is-clickable"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/collector/history/${item.collectionpayment_id}`)}
                        >
                          <td>
                            <strong>{item.customer_name || '—'}</strong>
                            {item.customer_code ? (
                              <div className="muted" style={{ fontSize: '0.8rem' }}>{item.customer_code}</div>
                            ) : null}
                          </td>
                          <td>
                            {item.receipts_id && item.receipt_number ? (
                              <button
                                type="button"
                                className="button ghost"
                                style={{ padding: '2px 6px', fontFamily: 'monospace' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/collector/receipts/${item.receipts_id}`);
                                }}
                              >
                                {item.receipt_number}
                              </button>
                            ) : (
                              <span className="muted">{item.receipt_number || '—'}</span>
                            )}
                          </td>
                          <td>{item.payment_method || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(Number(item.amount))}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td>{formatPaymentTimestamp(item.payment_date, item.payment_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No collections recorded yet."
                  description="Open Today's Route to begin collecting from assigned stops."
                  actionLabel="Open Today's Route"
                  onAction={() => navigate('/collector/route')}
                />
              )}
            </section>

            <section className="panel content-panel relative overflow-hidden">
              <div className="list-section-header">
                <h3 style={{ margin: 0 }}>Recent Field Reports</h3>
                <button className="button ghost" type="button" onClick={() => navigate('/collector/field-reports')}>
                  View All Reports
                </button>
              </div>
              {recentFieldReports.length ? (
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Activity</th>
                        <th>Severity</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFieldReports.map((item) => (
                        <tr
                          key={item.report_id}
                          className="is-clickable"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/collector/field-reports/${item.report_id}`)}
                        >
                          <td>
                            <strong>{item.customer_name || '—'}</strong>
                            {item.customer_code ? (
                              <div className="muted" style={{ fontSize: '0.8rem' }}>{item.customer_code}</div>
                            ) : null}
                          </td>
                          <td>{item.activity_type || '—'}</td>
                          <td>{item.severity ? <StatusBadge status={item.severity} /> : <span className="muted">—</span>}</td>
                          <td>{formatDisplayDateTime(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No field reports submitted yet."
                  description="File a Field Activity Report when a visit needs documentation."
                  actionLabel="File Field Report"
                  onAction={() => navigate('/collector/field-reports')}
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
function isRouteStopCompleted(stop) {
  return stop.status === 'Completed' || stop.visitStatus === 'Completed';
}

function formatLongRouteDate(dateStr) {
  if (!dateStr) return '—';
  const match = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0))
    : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function RoutePage({
  pageType,
  navigate,
  showToast
}) {
  const [customers, setCustomers] = useState([]);
  const [sawMeta, setSawMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const routeDate = manilaDateInputValue();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const sawRes = await fetchSawPriority({ date: routeDate });
      if (cancelled) return;
      const meta = sawRes.meta || null;
      setSawMeta(meta);
      let stops = [];
      if (sawRes.success && meta?.published && (sawRes.data || []).length) {
        stops = sawRes.data.map((row) => mapSawRowToRouteStop(row));
      } else if (!sawRes.success && showToast) {
        showToast(sawRes.message || 'Unable to load today\'s route.', 'error');
      }
      if (!cancelled) {
        setCustomers(stops);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [routeDate, showToast]);

  const filteredStops = useMemo(() => {
    if (filter === 'All') return customers;
    if (filter === 'Pending') return customers.filter((s) => !isRouteStopCompleted(s));
    return customers.filter(isRouteStopCompleted);
  }, [filter, customers]);

  const mapStops = useMemo(
    () => customers.filter((s) => accountMapPosition(s).hasCoords),
    [customers]
  );

  const routeCounts = useMemo(() => ({
    All: customers.length,
    Pending: customers.filter((s) => !isRouteStopCompleted(s)).length,
    Completed: customers.filter(isRouteStopCompleted).length,
  }), [customers]);

  const isMapView = pageType === 'routeMap';
  const actions = [
    {
      label: 'Route List',
      to: '/collector/route',
      variant: !isMapView ? undefined : 'secondary',
    },
    {
      label: 'Map View',
      to: '/collector/route/map',
      variant: isMapView ? undefined : 'secondary',
    },
  ];

  const pagination_filteredStops = usePagination(filteredStops, { resetKey: filter });
  const paginated_filteredStops = pagination_filteredStops.paginatedData;

  const isPublished = Boolean(sawMeta?.published && customers.length > 0);
  const formattedRouteDate = formatLongRouteDate(sawMeta?.scheduledDate || routeDate);
  const routeSubtitle = `Today's assigned customers · ${customers.length} stop${customers.length === 1 ? '' : 's'} · ${formattedRouteDate}`;

  const routeToolbar = (
    <div className="flex flex-wrap gap-2 justify-end items-center" style={{ marginTop: 4, marginBottom: 4 }}>
      {actions.map((a) => (
        <button
          key={a.label}
          className={a.variant === 'secondary' ? 'button secondary whitespace-nowrap' : 'button whitespace-nowrap'}
          type="button"
          onClick={() => navigate(a.to)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );

  if (loading) return <LoadingState message="Loading today's route..." />;

  return (
    <div className="page">
      <StatsGrid
        stats={[
          {
            label: "Today's Stops",
            value: String(customers.length),
          },
          {
            label: 'Completed Visits',
            value: String(routeCounts.Completed),
          },
          {
            label: 'Remaining Stops',
            value: String(routeCounts.Pending),
          },
          {
            label: 'Total Collected Today',
            value: formatCurrency(sawMeta?.amountCollectedToday || 0),
          },
        ]}
      />
      {routeToolbar}
      <section className="panel content-panel relative overflow-hidden">
        {!isPublished ? (
          <EmptyState
            title="Waiting for Today's Route"
            description="Your collection route has not been published yet. Please wait for your assigned stops."
          />
        ) : isMapView ? (
          <>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-2">
              <div>
                <h3>Route Map View</h3>
              </div>
            </div>
            {mapStops.length ? (
              <CollectionRouteMap
                stops={mapStops}
                showToast={showToast}
                navigate={navigate}
              />
            ) : (
              <EmptyState
                title="No map coordinates on file"
                description="Your assigned stops do not have map coordinates yet. Open a customer from the Route List to view their address."
              />
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3>Customer List for Today</h3>
                <p className="muted" style={{ marginTop: 4 }}>{routeSubtitle}</p>
              </div>
              <div className="inline-toolbar">
                <div className="segmented-control">
                  {['All', 'Pending', 'Completed'].map((item) => (
                    <button
                      key={item}
                      className={filter === item ? 'segment active' : 'segment'}
                      type="button"
                      onClick={() => setFilter(item)}
                    >
                      {item} ({routeCounts[item]})
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filteredStops.length ? (
              <>
                <div className="corvex-table-wrapper">
                  <table className="corvex-table">
                    <thead>
                      <tr>
                        <th>Customer Name</th>
                        <th>Outstanding Balance</th>
                        <th>Visit Status</th>
                        <th>Available Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated_filteredStops.map((stop, index) => {
                        const visitStatus = isRouteStopCompleted(stop) ? 'Completed' : 'Pending';
                        const callable = hasCallablePhone(stop.phone);
                        const seqNum = stop.routeSequence ?? stop.routeIndex ?? index + 1;
                        return (
                          <tr
                            key={stop.id}
                            className="clickable-row"
                            onClick={() => navigate(`/collector/account-detail/${stop.id}?from=route`)}
                          >
                            <td>
                              <div className="flex items-center gap-2">
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 24,
                                    height: 24,
                                    borderRadius: 999,
                                    background: 'var(--surface-2)',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  #{seqNum}
                                </span>
                                <div>
                                  <strong>{stop.customerName}</strong>
                                  {callable ? (
                                    <div className="muted" style={{ fontSize: '0.78rem' }}>
                                      {formatPhone(stop.phone)}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {formatCurrency(stop.outstandingBalance || 0)}
                            </td>
                            <td>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={visitStatus} />
                                {visitStatus === 'Completed' && stop.visitOutcome && stop.visitOutcome !== 'Collected' ? (
                                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                                    · {stop.visitOutcome}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  className="button ghost"
                                  type="button"
                                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                  disabled={!callable}
                                  title={callable ? `Call ${stop.customerName}` : 'No valid phone number on file'}
                                  onClick={() => collectorCall(stop, showToast)}
                                >
                                  Call
                                </button>
                                <button
                                  className="icon-action-button"
                                  type="button"
                                  title="View Customer Details"
                                  onClick={() => navigate(`/collector/account-detail/${stop.id}?from=route`)}
                                >
                                  <NavIcon name="view" />
                                </button>
                                {!isRouteStopCompleted(stop) && (stop.outstandingBalance || 0) > 0 ? (
                                  <button
                                    className="button"
                                    type="button"
                                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                    title="Log Collection"
                                    onClick={() => navigate(`/collector/collection-log/${stop.id}?from=route`)}
                                  >
                                    Log Collection
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...pagination_filteredStops} />
              </>
            ) : (
              <EmptyState
                title="No customers match this filter"
                description="Try switching between All, Pending, and Completed visits."
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
function accountMapPosition(account) {
  const lat = Number(account?.latitude);
  const lng = Number(account?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { center: [lat, lng], hasCoords: true };
  }
  return { center: [7.1907, 125.4553], hasCoords: false };
}

function CustomerMapPage({
  accountId,
  parentContext,
  navigate,
}) {
  const [account, setAccount] = useState(null);
  const [depot, setDepot] = useState(null);
  const [roadLeg, setRoadLeg] = useState(null);
  const [loading, setLoading] = useState(true);
  const contextQuery = `?from=${parentContext}`;
  const backTo = parentContext === 'route' ? '/collector/route/map' : `/collector/account-detail/${accountId}${contextQuery}`;
  const isRouteNav = parentContext === 'route';

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);

  useEffect(() => {
    if (!isRouteNav || !account) return;
    const { hasCoords } = accountMapPosition(account);
    if (!hasCoords) return;
    let cancelled = false;
    (async () => {
      const [depotRes, routeRes] = await Promise.all([
        fetchRouteDepot(),
        fetchDrivingRoute('recommended', [{
          id: account.id,
          latitude: account.latitude,
          longitude: account.longitude,
          rank: 1,
        }]),
      ]);
      if (cancelled) return;
      if (depotRes.success) setDepot(depotRes.data);
      if (routeRes.success) setRoadLeg(routeRes.data?.road || null);
    })();
    return () => { cancelled = true; };
  }, [isRouteNav, account]);

  if (loading) return <LoadingState message="Loading map..." />;
  if (!account) {
    return <EmptyState title="Customer not found" actionLabel="Back" onAction={() => navigate('/collector/accounts')} />;
  }

  const { center, hasCoords } = accountMapPosition(account);
  const markers = [];
  if (depot?.latitude != null && depot?.longitude != null && isRouteNav) {
    markers.push({
      id: 'depot',
      position: [depot.latitude, depot.longitude],
      label: 'B',
      color: '#153450',
      popup: `<strong>${depot.name || 'Branch'}</strong><br/>Starting location`,
    });
  }
  markers.push({
    id: account.id,
    position: center,
    label: isRouteNav ? '1' : (account.customerName || 'CU').substring(0, 2).toUpperCase(),
    color: '#0B2133',
    popup: `<strong>${account.customerName}</strong><br/>${account.address || ''}`,
  });
  const fitBounds = markers.map((m) => m.position);
  const polylines = roadLeg?.positions?.length
    ? [{ id: 'nav-leg', positions: roadLeg.positions, color: '#0B2133', weight: 4 }]
    : [];

  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>{isRouteNav ? `Navigate to ${account.customerName}` : account.customerName}</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0' }}>{account.address}</p>
            {isRouteNav && roadLeg?.distanceKm != null ? (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                Estimated distance: {roadLeg.distanceKm} km
                {roadLeg.durationMin != null ? ` · ~${roadLeg.durationMin} min drive` : ''}
              </p>
            ) : null}
            {!hasCoords ? <p className="text-ink/60" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                Exact GPS is not on file — map is centered on the branch area. Address shown above.
              </p> : null}
          </div>
        </div>
        <LeafletMap
          center={center}
          zoom={hasCoords ? 16 : 12}
          height={520}
          markers={markers}
          polylines={polylines}
          fitBounds={fitBounds.length >= 2 ? fitBounds : null}
        />
      </section>
      <div className="flex flex-wrap justify-end gap-2 mt-2">
        <button className="button ghost" type="button" onClick={() => navigate(backTo)}>Back</button>
        <button className="button secondary" type="button" onClick={() => navigate('/collector/route/map')}>Today&apos;s route map</button>
        <button className="button" type="button" onClick={() => navigate(`/collector/account-detail/${accountId}${contextQuery}`)}>Customer details</button>
      </div>
    </div>;
}

function formatManilaDateTimeDisplay(dateObj = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dateObj);
}

function CollectionLogPage({
  accountId,
  parentContext,
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    amountCollected: '',
    paymentMethod: 'Cash',
    gcashReference: '',
    notes: '',
    generateReceipt: true,
  });
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recordedPayment, setRecordedPayment] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState(['Cash', 'GCash']);
  const [devicePayments, setDevicePayments] = useState([]);
  const [collectionTimeDisplay] = useState(() => formatManilaDateTimeDisplay(new Date()));
  const contextQuery = `?from=${parentContext}`;

  async function refreshDevicePayments() {
    const rows = await loadWaiting('collection_payment');
    setDevicePayments(rows.filter((row) => String(row.payload?.customer_id) === String(accountId)));
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [acctRes, methodsRes] = await Promise.all([
        fetchAccountById(accountId),
        fetchCollectorPaymentMethods(),
      ]);
      if (acctRes.success) {
        setAccount(acctRes.data);
      }
      if (methodsRes.success && methodsRes.data?.length) {
        const allowed = methodsRes.data
          .map((m) => m.method_name)
          .filter((name) => ['cash', 'gcash'].includes(String(name || '').toLowerCase()));
        if (allowed.length) setPaymentMethods(allowed);
      }
      await refreshDevicePayments();
      setLoading(false);
    }
    load();
  }, [accountId]);

  if (loading) return <LoadingState message="Loading customer account..." />;
  if (!account) {
    return (
      <div className="page">
        <DeviceQueue rows={devicePayments} />
        <EmptyState
          title="Customer not found"
          actionLabel="Back to Route"
          onAction={() => navigate(parentContext === 'route' ? '/collector/route' : '/collector/accounts')}
        />
      </div>
    );
  }

  if (parentContext !== 'route' || !account.todayVisit?.visit_id) {
    return (
      <div className="page">
        <EmptyState
          title="Collection not available"
          description="Collections can only be logged from a published stop on Today's Route."
          actionLabel={parentContext === 'route' ? 'Back to Route' : 'Back to Customers'}
          onAction={() => navigate(parentContext === 'route' ? '/collector/route' : '/collector/accounts')}
        />
      </div>
    );
  }

  const outstanding = Number(account.outstandingBalance) || 0;
  const enteredAmount = Number(formData.amountCollected) || 0;
  const remainingBalance = Math.max(0, Math.round((outstanding - enteredAmount) * 100) / 100);
  const isGCash = String(formData.paymentMethod).toLowerCase() === 'gcash';

  const handleChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrors((prev) => ({
      ...prev,
      [name]: undefined,
    }));
  };

  const validateForm = () => {
    const amount = Number(formData.amountCollected);
    const nextErrors = {};
    if (!Number.isFinite(amount) || amount <= 0) {
      nextErrors.amountCollected = 'Enter a valid collection amount greater than zero.';
    } else if (outstanding <= 0) {
      nextErrors.amountCollected = 'This customer has no outstanding balance to collect.';
    } else if (amount > outstanding) {
      nextErrors.amountCollected = `Amount collected cannot exceed the outstanding balance (${formatCurrency(outstanding)}).`;
    }

    const method = String(formData.paymentMethod || '').trim();
    if (!['Cash', 'GCash'].includes(method)) {
      nextErrors.paymentMethod = 'Select Cash or GCash.';
    }

    if (method === 'GCash') {
      const ref = String(formData.gcashReference || '').trim();
      if (!ref || ref.length < 6) {
        nextErrors.gcashReference = 'Enter a valid GCash reference number (at least 6 characters).';
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast?.('Please review and fix the highlighted fields.', 'error');
      return false;
    }
    return true;
  };

  const handleRequestSubmit = (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    if (!validateForm()) return;
    setConfirmOpen(true);
  };

  const handleConfirmAndSave = async () => {
    if (submitting) return;
    const amount = Math.round(Number(formData.amountCollected) * 100) / 100;
    const visitId = account.todayVisit?.visit_id || null;
    if (!visitId || parentContext !== 'route') {
      showToast?.('Collections can only be logged from a published route stop.', 'error');
      setConfirmOpen(false);
      return;
    }

    const payload = {
      customer_id: Number(account.id || account.customer_id),
      visit_id: Number(visitId),
      amount,
      payment_method: formData.paymentMethod,
      reference_number: isGCash ? String(formData.gcashReference).trim() : null,
      notes: formData.notes ? String(formData.notes).trim() : null,
      generate_receipt: formData.generateReceipt,
      expected_balance: outstanding,
      customer_name: account.customerName || '',
    };

    const keepLocal = async () => {
      await saveOfflineRecord({ tableName: 'collection_payment', payload });
      setConfirmOpen(false);
      showToast(
        isCollectorAutoSyncEnabled()
          ? 'Saved on this device. It will sync when you are online.'
          : 'Saved on this device. Send it from Settings while auto-sync is off.',
        'success'
      );
      setFormData((prev) => ({
        ...prev,
        amountCollected: '',
        gcashReference: '',
        notes: '',
      }));
      await refreshDevicePayments();
    };

    if (!isBrowserOnline()) {
      await keepLocal();
      return;
    }

    setSubmitting(true);
    const result = await submitCollectionPayment(payload);
    setSubmitting(false);
    setConfirmOpen(false);

    if (!result.success) {
      if (result.offline) {
        await keepLocal();
        return;
      }
      showToast(result.message || 'Collection failed.', 'error');
      return;
    }

    showToast(result.message || 'Collection recorded.', 'success');
    const saved = result.data || {};
    const newRemaining =
      saved.remaining_balance != null
        ? Number(saved.remaining_balance)
        : Math.max(0, outstanding - amount);

    setAccount((prev) => (prev ? { ...prev, outstandingBalance: newRemaining } : prev));
    setRecordedPayment({
      collectionpayment_id: saved.collectionpayment_id,
      receipt_number: saved.receipt_number || '—',
      receipts_id: saved.receipts_id || null,
      amount: Number(saved.amount ?? amount),
      payment_method: saved.payment_method || formData.paymentMethod,
      reference_number: saved.reference_number || (isGCash ? String(formData.gcashReference).trim() : null),
      remaining_balance: newRemaining,
      payment_date: saved.payment_date,
      payment_time: saved.payment_time,
    });
  };

  if (recordedPayment) {
    return (
      <div className="page">
        <section className="panel content-panel">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3>Collection Recorded</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                Payment has been saved and the customer&apos;s balance and route status have been updated.
              </p>
            </div>
            <StatusBadge status="Completed" />
          </div>
          <DetailRowsTable
            rows={[
              { label: 'Customer Name', value: account.customerName },
              { label: 'Account Reference', value: account.accountNumber },
              {
                label: 'Transaction Reference',
                value: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{recordedPayment.receipt_number}</span>,
              },
              {
                label: 'Amount Collected',
                value: <strong style={{ color: 'var(--palette-navy)' }}>{formatCurrency(recordedPayment.amount)}</strong>,
              },
              { label: 'Payment Method', value: recordedPayment.payment_method },
              ...(recordedPayment.reference_number
                ? [
                    {
                      label: 'GCash Reference Number',
                      value: <span style={{ fontFamily: 'monospace' }}>{recordedPayment.reference_number}</span>,
                    },
                  ]
                : []),
              {
                label: 'Remaining Balance',
                value: <strong>{formatCurrency(recordedPayment.remaining_balance)}</strong>,
              },
              {
                label: 'Collection Date and Time',
                value: formatPaymentTimestamp(recordedPayment.payment_date, recordedPayment.payment_time),
              },
            ]}
          />
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/collector/account-detail/${account.id}${contextQuery}`)}
            >
              Back to Customer Detail
            </button>
            {recordedPayment.receipts_id ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => navigate(`/collector/receipts/${recordedPayment.receipts_id}`)}
              >
                Open Official Receipt
              </button>
            ) : null}
            <button
              className="button"
              type="button"
              onClick={() => navigate('/collector/route')}
            >
              Return to Today&apos;s Route
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <DeviceQueue rows={devicePayments} />

      <section className="panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Customer and Account Information</h3>
          </div>
          <StatusBadge status={account.status} />
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Customer Name', value: <strong>{account.customerName}</strong> },
            {
              label: 'Account Reference',
              value: <span style={{ fontFamily: 'monospace' }}>{account.accountNumber}</span>,
            },
            {
              label: 'Outstanding Balance',
              value: <strong style={{ fontSize: '1.05rem' }}>{formatCurrency(outstanding)}</strong>,
            },
            { label: 'Days Overdue', value: `${account.daysOverdue || 0} days` },
          ]}
        />
      </section>

      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Collection Details</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Accepted payment modes: Cash and GCash.
            </p>
          </div>
        </div>

        <form onSubmit={handleRequestSubmit}>
          <div className="form-group">
            <div className="flex items-center justify-between">
              <label>
                Amount Collected<span className="required">*</span>
              </label>
              {outstanding > 0 ? (
                <button
                  type="button"
                  className="button ghost"
                  style={{ padding: '2px 8px', fontSize: '0.78rem' }}
                  onClick={() => handleChange('amountCollected', String(outstanding))}
                >
                  Collect Full Balance ({formatCurrency(outstanding)})
                </button>
              ) : null}
            </div>
            <input
              type="number"
              min="0.01"
              max={outstanding}
              step="0.01"
              placeholder="Enter amount collected"
              value={formData.amountCollected}
              onChange={(e) => handleChange('amountCollected', e.target.value)}
            />
            {errors.amountCollected ? <p className="form-error">{errors.amountCollected}</p> : null}
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4"
            style={{
              padding: '12px 14px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              border: '1px solid var(--surface-3)',
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>Outstanding Balance</div>
              <div style={{ fontWeight: 700 }}>{formatCurrency(outstanding)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>Amount Collected</div>
              <div style={{ fontWeight: 700 }}>{formatCurrency(enteredAmount)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>Remaining Balance</div>
              <div style={{ fontWeight: 700 }}>{formatCurrency(remainingBalance)}</div>
            </div>
          </div>

          <div className="field-report-filter-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>
                Payment Method<span className="required">*</span>
              </label>
              <select
                className="filter-select"
                value={formData.paymentMethod}
                onChange={(e) => handleChange('paymentMethod', e.target.value)}
              >
                {paymentMethods.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {errors.paymentMethod ? <p className="form-error">{errors.paymentMethod}</p> : null}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Collection Date and Time</label>
              <input type="text" value={collectionTimeDisplay} disabled />
            </div>
          </div>

          {isGCash ? (
            <div className="form-group" style={{ marginTop: 14 }}>
              <label>
                GCash Reference Number<span className="required">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter GCash transaction reference number"
                value={formData.gcashReference}
                onChange={(e) => handleChange('gcashReference', e.target.value)}
              />
              {errors.gcashReference ? <p className="form-error">{errors.gcashReference}</p> : null}
            </div>
          ) : null}

          <div className="form-group" style={{ marginTop: 14 }}>
            <label>Remarks (Optional)</label>
            <textarea
              rows={3}
              placeholder="Optional remarks about this collection..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={Boolean(formData.generateReceipt)}
                onChange={(e) => handleChange('generateReceipt', e.target.checked)}
              />
              Generate official digital receipt
            </label>
          </div>

          <div className="flex flex-wrap gap-2 justify-end mt-4">
            <button
              className="button secondary"
              type="button"
              onClick={() => navigate(`/collector/account-detail/${account.id}${contextQuery}`)}
            >
              Cancel
            </button>
            <button
              className="button"
              type="submit"
              disabled={submitting || outstanding <= 0}
            >
              {submitting ? 'Saving…' : 'Review & Save Collection'}
            </button>
          </div>
        </form>
      </section>

      {confirmOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-collection-title"
          onClick={() => !submitting && setConfirmOpen(false)}
        >
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 id="confirm-collection-title" style={{ marginTop: 0 }}>Confirm Collection</h3>
            <p className="muted" style={{ marginBottom: 14 }}>
              Please verify the payment details before saving this transaction.
            </p>
            <DetailRowsTable
              rows={[
                { label: 'Customer', value: account.customerName },
                { label: 'Account Reference', value: account.accountNumber },
                { label: 'Outstanding Balance', value: formatCurrency(outstanding) },
                {
                  label: 'Amount Collected',
                  value: <strong>{formatCurrency(enteredAmount)}</strong>,
                },
                { label: 'Payment Method', value: formData.paymentMethod },
                ...(isGCash
                  ? [{ label: 'GCash Reference', value: formData.gcashReference.trim() }]
                  : []),
                {
                  label: 'Remaining Balance',
                  value: <strong>{formatCurrency(remainingBalance)}</strong>,
                },
                { label: 'Date & Time', value: collectionTimeDisplay },
              ]}
            />
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                className="button secondary"
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
              >
                Back to Edit
              </button>
              <button
                className="button"
                type="button"
                disabled={submitting}
                onClick={handleConfirmAndSave}
              >
                {submitting ? 'Recording…' : 'Confirm & Save Payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function CIFormPage({
  accountId,
  parentContext,
  navigate,
}) {
  const contextQuery = parentContext ? `?from=${parentContext}` : '';
  useEffect(() => {
    navigate(accountId ? `/collector/account-detail/${accountId}${contextQuery}` : '/collector/route');
  }, [accountId, contextQuery, navigate]);
  return <LoadingState message="Redirecting..." />;
}

function NotificationsPage({
  navigate,
  showToast
}) {
  return (
    <NotificationsInbox
      showToast={showToast}
      navigate={navigate}
      resolveRelatedPath={(n) => resolveCollectorNotificationPath(n.category)}
    />
  );
}
function ProfilePage({
  showToast
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Collector profile"
    settings={<SettingsPage embedded showToast={showToast} />}
  />;
}
function SettingsPage({
  showToast,
  embedded = false,
}) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refreshPending = async () => {
    const rows = await loadWaiting('collection_payment');
    const reports = await loadWaiting('field_activity_reports');
    setPendingCount(rows.length + reports.length);
  };
  useEffect(() => {
    refreshPending().catch(() => setPendingCount(0));
  }, []);
  const syncNow = async () => {
    setSyncing(true);
    const result = await flushOfflineQueue({ manual: true });
    await refreshPending();
    setSyncing(false);
    const synced = (result.results || []).filter((row) => row.syncStatus === 'Synced').length;
    const failed = (result.results || []).filter((row) => row.syncStatus === 'Failed').length;
    if (result.skipped) {
      showToast('Sync waits until you are online and signed in.', 'error');
      return;
    }
    if (!synced && !failed) {
      showToast('No collections or field reports are waiting on this device.', 'success');
      return;
    }
    showToast(
      failed ? `${synced} synced. ${failed} still need attention.` : `${synced} record${synced === 1 ? '' : 's'} synced.`,
      failed ? 'error' : 'success'
    );
  };
  return (
    <UserSettingsPanel embedded={embedded} role="collector" showToast={showToast}>
      <p className="muted">{pendingCount} record{pendingCount === 1 ? '' : 's'} waiting on this device.</p>
      <div className="settings-link-row">
        <button className="button" type="button" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
    </UserSettingsPanel>
  );
}
export function CollectorPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) {
    return <EmptyState title="Page not found" description="This route is not available. Use the sidebar to open a supported screen." />;
  }
  const props = {
    accountId: page.params?.accountId,
    receiptId: page.params?.receiptId,
    paymentId: page.params?.paymentId,
    parentContext: page.parentContext,
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...props} />;
    case 'settings':
      return <SettingsPage {...props} />;
    case 'routeList':
    case 'routeMap':
    case 'routeSummary':
      return <RoutePage pageType={page.pageType} {...props} />;
    case 'accounts':
      return <AccountsPage {...props} />;
    case 'customerMap':
      return <CustomerMapPage {...props} />;
    case 'accountDetail':
      return <AccountDetailPage {...props} />;
    case 'collectionLog':
      return <CollectionLogPage {...props} />;
    case 'receiptsRedirect':
      return <ReceiptsRedirectPage {...props} />;
    case 'digitalReceipt':
      return <DigitalReceiptPage receiptId={page.params?.receiptId} {...props} />;
    case 'ciForm':
      return <CIFormPage {...props} />;
    case 'history':
      return <CollectionHistoryPage {...props} />;
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...props} />;
    case 'fieldActivityReportDetail':
      return <FieldActivityReportDetailPage reportId={page.params?.reportId} {...props} />;
    case 'collectionPaymentDetail':
      return <CollectionPaymentDetailPage paymentId={page.params?.paymentId} {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}