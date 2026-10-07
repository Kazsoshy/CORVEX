import { Pagination } from '../shared/Pagination';
import { usePagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPaymentTimestamp } from '../../utils/formatters.js';
import {
  fetchAccounts,
  fetchAccountById,
  fetchCollectionPayments,
  fetchCollectionPaymentById,
  fetchDigitalReceipts,
  fetchDigitalReceiptById,
  sendReceiptToCustomer,
  fetchTodayFieldVisits,
  fetchSawPriority,
  mapSawRowToRouteStop,
  fetchFieldActivityReports,
  submitFieldActivityReport,
  fetchCollectorDashboard,
  fetchCollectorPaymentMethods,
  submitCollectionPayment,
  submitCollectorCreditInvestigation,
  submitCollectorIncident,
} from '../../api/collectorService';
import { fetchNotifications } from '../../api/notificationService.js';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService.js';
import { getCurrentUser, persistCurrentUserFromProfile, requestLogout } from '../../api/authService.js';
import { downloadPdf } from '../../utils/dataExport';
import { collectorMapPath, openPhoneCall } from '../../utils/mapsNavigation';
import { NotificationsInbox } from '../shared/NotificationsInbox';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import CollectionRouteMap from './CollectionRouteMap';
import { fetchDrivingRoute, fetchRouteDepot } from '../../api/routingService';
import { StatusBadge } from '../StatusBadge';
function StatsGrid({
  stats
}) {
  if (!stats?.length) return null;
  return <section className="stats-grid">
      {stats.map((stat, index) => <article key={stat.label} className="stat-card" style={{
      '--stat-index': index
    }}>
          <div className="stat-card-top">
            <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stat-dot" aria-hidden="true" />
          </div>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>)}
    </section>;
}
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
  if (c.includes('route') || c.includes('visit')) return '/collector/route';
  if (c.includes('receipt') || c.includes('collection')) return '/collector/history';
  if (c.includes('ci') || c.includes('credit')) return '/collector/accounts';
  return '/collector/notifications';
}

function DashboardPage({
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const today = formatDisplayDate(new Date());
  const [dashboard, setDashboard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [dashRes, notifRes] = await Promise.all([
        fetchCollectorDashboard(),
        fetchNotifications(),
      ]);
      if (dashRes.success) setDashboard(dashRes.data);
      else if (showToast) showToast(dashRes.message || 'Failed to load dashboard.', 'error');
      if (notifRes.success) {
        setUnreadCount((notifRes.data || []).filter(n => n.status !== 'Read').length);
      }
      setLoading(false);
    }
    load();
  }, [showToast]);

  const agentName = currentUser?.fullName || 'Collector';
  const branchName = currentUser?.branch?.name || '—';
  const summary = dashboard?.summary || {};
  const recentCollections = dashboard?.recentCollections || [];
  const recentFieldReports = dashboard?.recentFieldReports || [];
  const routeProgress = summary.routeProgressPercent ?? 0;

  if (loading) return <LoadingState message="Loading dashboard..." />;

  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Good morning</p>
          <h2>{agentName}</h2>
          <p className="text-ink/70">{today}</p>
        </div>
        <Link to="/collector/notifications" className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-full transition-colors cursor-pointer" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex justify-center items-center rounded-full bg-red text-white text-[0.7rem] font-bold border-2 border-mint">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[{
      label: 'Branch',
      value: branchName
    }, {
      label: 'Notifications',
      value: String(unreadCount)
    }, {
      label: 'Collected Today',
      value: formatCurrency(summary.amountCollectedToday ?? 0)
    }, {
      label: 'Collections Today',
      value: String(summary.collectionsToday ?? 0)
    }]} />

      <div className="flex flex-wrap gap-2 justify-end mt-2 mb-2">
        <button className="button secondary" type="button" onClick={() => navigate('/collector/accounts')}>View Accounts</button>
        <button className="button secondary" type="button" onClick={() => navigate('/collector/incident')}>Report Incident</button>
        <button className="button" type="button" onClick={() => navigate('/collector/route')}>Start Today's Route</button>
      </div>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Recent Collections</h3>
          </div>
          {recentCollections.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCollections.map(item => (
                    <tr key={item.collectionpayment_id}>
                      <td><strong>{item.customer_name || '—'}</strong></td>
                      <td>{formatDisplayDate(item.payment_date)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(item.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No collections yet" description="Collections logged today will appear here." />
          )}
        </section>

        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Recent Field Reports</h3>
          </div>
          {recentFieldReports.length ? (
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Date / Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFieldReports.map(item => (
                    <tr key={item.report_id}>
                      <td><strong>{item.activity_type || '—'}</strong></td>
                      <td>{item.customer_name || '—'}</td>
                      <td>{formatDisplayDateTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No field reports yet" description="Submit field activity from the Field Reports page." actionLabel="Field Reports" onAction={() => navigate('/collector/field-reports')} />
          )}
        </section>
      </div>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Today&apos;s Route Progress</h3>
          <span className="text-ink/70">View route for updates</span>
        </div>
        <div className="progress-bar" role="progressbar" aria-valuenow={routeProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{
          width: `${routeProgress}%`
        }} />
        </div>
        <p className="muted progress-caption">
          {summary.routeStopsCompleted ?? 0} of {summary.routeStopsTotal ?? 0} today&apos;s visits completed ({routeProgress}%)
        </p>
      </section>
    </div>;
}
function FieldActivityReportsPage({
  showToast
}) {
  const [reports, setReports] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    visit_id: '',
    activity_type: '',
    remarks: '',
    photo: '',
    photoName: '',
  });
  const [errors, setErrors] = useState({});
  async function loadReports() {
    setLoading(true);
    const [reportsResult, visitsResult] = await Promise.all([fetchFieldActivityReports(), fetchTodayFieldVisits()]);
    if (reportsResult.success) setReports(reportsResult.data || []);
    if (visitsResult.success) setVisits(visitsResult.data || []);
    setLoading(false);
  }
  useEffect(() => {
    loadReports();
  }, []);
  const handleSubmit = async e => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.visit_id) nextErrors.visit_id = 'Select a visit.';
    if (!form.activity_type) nextErrors.activity_type = 'Select an activity type.';
    if (!form.remarks.trim()) nextErrors.remarks = 'Remarks are required.';
    if (!form.photo) nextErrors.photo = 'Photo evidence is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    const result = await submitFieldActivityReport({
      visit_id: Number(form.visit_id),
      activity_type: form.activity_type,
      remarks: form.remarks.trim(),
      photo: form.photo,
    });
    setSubmitting(false);
    if (result.success) {
      showToast(result.message || 'Report submitted to Operating Manager.', 'success');
      setForm({
        visit_id: '',
        activity_type: '',
        remarks: '',
        photo: '',
        photoName: '',
      });
      loadReports();
    } else {
      showToast(result.message || 'Failed to submit report.', 'error');
    }
  };
  const pagination_reports = usePagination(reports);
  const paginated_reports = pagination_reports.paginatedData;
  if (loading) return <LoadingState message="Loading field activity reports..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Field Activity Reports</h3>
            <p className="text-ink/70" style={{
            margin: '4px 0 0',
            fontSize: '0.82rem'
          }}>
              Submit visit activity to the Operating Manager ({reports.length} report{reports.length !== 1 ? 's' : ''} on file)
            </p>
          </div>
        </div>

        <form className="grid gap-3 mb-6" onSubmit={handleSubmit}>
        <div className="form-group" style={{
          marginBottom: 0
        }}>
          <label>Visit / Customer<span className="required">*</span></label>
          <select className="filter-select" value={form.visit_id} onChange={e => setForm(p => ({
            ...p,
            visit_id: e.target.value
          }))}>
            <option value="">Select today&apos;s visit</option>
            {visits.map(v => <option key={v.visit_id} value={v.visit_id}>
                {v.customer_name} — {v.visit_type} ({formatDisplayDate(v.scheduled_date)}, {v.status})
              </option>)}
          </select>
          {errors.visit_id ? <p className="form-error">{errors.visit_id}</p> : null}
          {!visits.length ? <p className="text-ink/70" style={{
            fontSize: '0.82rem',
            marginTop: 6
          }}>
              No visits scheduled for today. Reports can be filed once a visit is assigned.
            </p> : null}
        </div>
        <div className="form-group" style={{
          marginBottom: 0
        }}>
          <label>Activity Type<span className="required">*</span></label>
          <select className="filter-select" value={form.activity_type} onChange={e => setForm(p => ({
            ...p,
            activity_type: e.target.value
          }))}>
            <option value="">Select activity type</option>
            {['Collection', 'Sales Visit', 'Delivery', 'Site Check', 'Follow-up', 'Customer Not Available'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errors.activity_type ? <p className="form-error">{errors.activity_type}</p> : null}
        </div>
        <div className="form-group" style={{
          marginBottom: 0
        }}>
          <label>Remarks<span className="required">*</span></label>
          <textarea rows={3} placeholder="Describe the visit outcome, payment collected, or follow-up needed..." value={form.remarks} onChange={e => setForm(p => ({
            ...p,
            remarks: e.target.value
          }))} />
          {errors.remarks ? <p className="form-error">{errors.remarks}</p> : null}
        </div>
        <div className="form-group" style={{
          marginBottom: 0
        }}>
          <label>Photo Evidence<span className="required">*</span></label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setForm((p) => ({ ...p, photo: '', photoName: '' }));
                return;
              }
              if (!file.type.startsWith('image/')) {
                setErrors((prev) => ({ ...prev, photo: 'Please select an image file.' }));
                return;
              }
              if (file.size > 700_000) {
                setErrors((prev) => ({ ...prev, photo: 'Image must be 700 KB or smaller.' }));
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setForm((p) => ({
                  ...p,
                  photo: typeof reader.result === 'string' ? reader.result : '',
                  photoName: file.name,
                }));
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.photo;
                  return next;
                });
              };
              reader.readAsDataURL(file);
            }}
          />
          {form.photoName ? (
            <p className="text-ink/70" style={{ fontSize: '0.82rem', marginTop: 6 }}>
              Selected: {form.photoName}
            </p>
          ) : null}
          {form.photo ? (
            <img
              src={form.photo}
              alt="Report preview"
              style={{ marginTop: 8, maxWidth: 200, maxHeight: 140, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
          ) : null}
          {errors.photo ? <p className="form-error">{errors.photo}</p> : null}
        </div>
        <div className="flex justify-end">
          <button className="button" type="submit" disabled={submitting || !visits.length}>
            {submitting ? 'Submitting…' : 'Submit to Operating Manager'}
          </button>
        </div>
        </form>
      </section>

      {reports.length ? <section className="panel content-panel relative overflow-hidden">
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Visit ID</th>
                  <th>Customer</th>
                  <th>Activity Type</th>
                  <th>Visit Date</th>
                  <th>Sync Status</th>
                  <th>Photo</th>
                  <th>Created At</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {paginated_reports.map(r => <tr key={r.report_id}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.report_id}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.visit_id}</span></td>
                    <td>{r.customer_name}</td>
                    <td>{r.activity_type}</td>
                    <td>{formatDisplayDate(r.scheduled_date)}</td>
                    <td><StatusBadge status={r.sync_status} /></td>
                    <td>
                      {r.photo ? (
                        <a href={r.photo} target="_blank" rel="noreferrer">
                          <img src={r.photo} alt="Report" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                        </a>
                      ) : '—'}
                    </td>
                    <td>{formatDisplayDateTime(r.created_at)}</td>
                    <td style={{
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }} title={r.remarks}>{r.remarks || '—'}</td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_reports} /></>
        </section> : <EmptyState title="No field activity reports yet" description="Submit a report after completing a route stop." />}
    </div>;
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
  const [showMap, setShowMap] = useState(pageType === 'routeMap');
  const [roadStats, setRoadStats] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [sawRes, visitsRes] = await Promise.all([fetchSawPriority(), fetchTodayFieldVisits()]);
      setSawMeta(sawRes.meta || null);
      const visitByCustomer = new Map();
      if (visitsRes.success) {
        (visitsRes.data || [])
          .filter((v) => v.visit_type === 'Collection')
          .forEach((v) => visitByCustomer.set(String(v.customer_id), v));
      }
      const assignmentMode = Boolean(sawRes.meta?.assignmentMode);
      let stops = [];
      if (sawRes.success && (sawRes.data || []).length) {
        stops = sawRes.data.map((row) => mapSawRowToRouteStop(row, visitByCustomer));
      } else if (assignmentMode) {
        stops = [];
      } else {
        const accountsRes = await fetchAccounts();
        if (accountsRes.success) {
          stops = accountsRes.data
            .filter((a) => a.rawStatus === 'Active')
            .sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0))
            .map((a, i) => ({ ...a, rank: i + 1 }));
        }
        if (!sawRes.success && showToast) {
          showToast('SAW priority unavailable — showing balance order.', 'error');
        }
      }
      setCustomers(stops);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pageType !== 'routeSummary' || !customers.length) return;
    const payload = customers
      .filter((s) => accountMapPosition(s).hasCoords)
      .map((s) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        rank: s.rank,
      }));
    if (!payload.length) return;
    fetchDrivingRoute('saw', payload).then((res) => {
      if (res.success) setRoadStats(res.data?.road || null);
    });
  }, [pageType, customers]);

  const filteredStops = useMemo(() => {
    if (filter === 'All') return customers;
    if (filter === 'Pending') return customers.filter(s => s.status === 'Pending' || s.status === 'Overdue');
    return customers.filter(s => s.status === 'Completed' || s.visitStatus === 'Completed');
  }, [filter, customers]);
  const actions = [{
    label: 'Route List',
    to: '/collector/route',
    variant: pageType === 'routeList' ? undefined : 'secondary'
  }, {
    label: 'Map View',
    to: '/collector/route/map',
    variant: pageType === 'routeMap' ? undefined : 'secondary'
  }, {
    label: 'Route Summary',
    to: '/collector/route/summary',
    variant: pageType === 'routeSummary' ? undefined : 'secondary'
  }];
  const pagination_filteredStops = usePagination(filteredStops);
  const paginated_filteredStops = pagination_filteredStops.paginatedData;
  const assignmentMode = Boolean(sawMeta?.assignmentMode);
  const noAssignedRoute = assignmentMode && customers.length === 0;

  if (loading) return <LoadingState message="Loading route..." />;
  if (pageType === 'routeSummary') {
    return <div className="relative z-10 grid gap-[22px] w-full">
        <div className="flex flex-wrap gap-2 justify-end mt-2 mb-2">
          {actions.map(a => <button key={a.label} className={a.variant === 'secondary' ? 'button secondary' : 'button'} type="button" onClick={() => navigate(a.to)}>{a.label}</button>)}
        </div>
        <StatsGrid stats={[{
        label: "Today's Stops",
        value: String(customers.length)
      }, {
        label: 'Overdue Customers',
        value: String(customers.filter(s => s.status === 'Overdue').length)
      }, {
        label: 'Road distance',
        value: roadStats?.distanceKm != null
          ? `${roadStats.distanceKm} km (OSRM)`
          : customers.length
            ? `${customers.reduce((s, c) => s + (Number(c.distanceKm) || 0), 0).toFixed(1)} km est.`
            : '—'
      }, {
        label: 'SAW as of',
        value: sawMeta?.asOf || '—'
      }]} />
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Route Summary</h3>
          </div>
          <ul className="info-grid">
            <li><span className="info-item-label">Total Outstanding on Route</span><span className="info-item-value">{formatCurrency(customers.reduce((sum, s) => sum + (s.outstandingBalance || 0), 0))}</span></li>
            <li><span className="info-item-label">Pending / Overdue Visits</span><span className="info-item-value">{customers.filter(s => s.status !== 'Completed').length} stops</span></li>
            <li><span className="info-item-label">Completed Visits</span><span className="info-item-value">{customers.filter(s => s.status === 'Completed').length} stops</span></li>
          </ul>
        </section>
      </div>;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <div className="flex flex-wrap gap-2 justify-end mt-2 mb-2">
        {actions.map(a => <button key={a.label} className={a.variant === 'secondary' ? 'button secondary' : 'button'} type="button" onClick={() => navigate(a.to)}>{a.label}</button>)}
      </div>
      <StatsGrid stats={[{
      label: "Today's Stops",
      value: String(customers.length)
    }, {
      label: 'Overdue Customers',
      value: String(customers.filter(s => s.status === 'Overdue').length)
    }, {
      label: 'Road distance',
      value: roadStats?.distanceKm != null ? `${roadStats.distanceKm} km` : '—'
    }]} />
      <section className="panel content-panel relative overflow-hidden" style={{
      padding: '14px 20px'
    }}>
        <p style={{
        margin: 0,
        fontSize: '0.85rem',
        color: '#64748b'
      }}>
          <strong style={{
          color: '#1e293b'
        }}>Today&apos;s collection route</strong>
        {' '}
        {assignmentMode
          ? '— BM assigns today’s stops; SAW sets collection priority; OSRM (OpenStreetMap roads) draws the driving path on the map.'
          : '— Customers are ordered by outstanding balance and urgency.'}
        </p>
      </section>
      {noAssignedRoute ? (
        <EmptyState
          title="No route assigned for today"
          description="Ask your branch manager to assign collection customers for today from Field Operations → collector detail."
        />
      ) : null}
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>{showMap || pageType === 'routeMap' ? 'Route Map View' : 'SAW Customer Priority List'}</h3>
          {!showMap && pageType !== 'routeMap' && sawMeta && !noAssignedRoute ? (
            <p className="muted" style={{ marginTop: 4 }}>
              SAW order · {customers.length} stop{customers.length === 1 ? '' : 's'}
              {sawMeta.scheduledDate ? ` · ${sawMeta.scheduledDate}` : ''}
            </p>
          ) : null}
          <div className="inline-toolbar">
            <div className="segmented-control">
              {['All', 'Pending', 'Completed'].map(item => <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>
                  {item}
                </button>)}
            </div>
            {pageType !== 'routeMap' ? <button className="button secondary" type="button" onClick={() => setShowMap(!showMap)}>
                {showMap ? 'Show List View' : 'Show Map View'}
              </button> : null}
          </div>
        </div>
        {noAssignedRoute ? null : showMap || pageType === 'routeMap' ? (
          <CollectionRouteMap
            stops={filteredStops.filter((s) => accountMapPosition(s).hasCoords)}
            showToast={showToast}
            navigate={navigate}
            onRoadStats={setRoadStats}
          />
        ) : filteredStops.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Balance</th>
                  <th>Days overdue</th>
                  <th>Distance</th>
                  <th>SAW</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filteredStops.map((stop) => <tr key={stop.id}>
                    <td><strong>#{stop.rank ?? '—'}</strong></td>
                    <td>{stop.customerName}</td>
                    <td>{stop.address}</td>
                    <td>{formatCurrency(stop.outstandingBalance || 0)}</td>
                    <td>{stop.daysOverdue ?? 0}</td>
                    <td>{Number(stop.distanceKm) ? `${Number(stop.distanceKm).toFixed(1)} km` : '—'}</td>
                    <td>{stop.sawScore != null ? Number(stop.sawScore).toFixed(3) : '—'}</td>
                    <td><StatusBadge status={stop.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/collector/account-detail/${stop.id}?from=route`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filteredStops} /></> : <EmptyState title="No customers match this filter" description="Try a different status filter." />}
      </section>
    </div>;
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
        fetchDrivingRoute('saw', [{
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
      color: '#10b981',
      popup: `<strong>${depot.name || 'Branch'}</strong><br/>Start here`,
    });
  }
  markers.push({
    id: account.id,
    position: center,
    label: isRouteNav ? '1' : (account.customerName || 'CU').substring(0, 2).toUpperCase(),
    color: '#093850',
    popup: `<strong>${account.customerName}</strong><br/>${account.address || ''}`,
  });
  const fitBounds = markers.map((m) => m.position);
  const polylines = roadLeg?.positions?.length
    ? [{ id: 'nav-leg', positions: roadLeg.positions, color: '#093850', weight: 4 }]
    : [];

  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>{isRouteNav ? `Navigate to ${account.customerName}` : account.customerName}</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0' }}>{account.address}</p>
            {isRouteNav && roadLeg?.distanceKm != null ? (
              <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>
                Branch to customer · {roadLeg.distanceKm} km road
                {roadLeg.durationMin != null ? ` · ~${roadLeg.durationMin} min` : ''} (OSRM)
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

function AccountsPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All Customers');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccounts({ limit: 200, page: 1 });
      if (result.success) setCustomers(result.data);
      setLoading(false);
    }
    load();
  }, []);
  const filteredCustomers = useMemo(() => {
    let results = [...customers];
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter(customer => (customer.customerName || '').toLowerCase().includes(query) || (customer.accountNumber || '').toLowerCase().includes(query) || (customer.phone || '').includes(query));
    }
    switch (filter) {
      case 'Assigned Today':
        results = results.filter(a => a.assignedToday);
        break;
      case 'Pending':
        results = results.filter(a => a.status === 'Pending');
        break;
      case 'Completed':
        results = results.filter(a => a.status === 'Completed');
        break;
      case 'Overdue':
        results = results.filter(a => a.status === 'Overdue');
        break;
      case 'Blacklisted':
        results = results.filter(a => a.blacklisted);
        break;
      default:
        break;
    }
    switch (sortBy) {
      case 'Outstanding Balance':
        results.sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0));
        break;
      case 'Days Overdue':
        results.sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0));
        break;
      case 'Distance':
        results.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        break;
      default:
        results.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));
        break;
    }
    return results;
  }, [customers, search, filter, sortBy]);
  const pagination = usePagination(filteredCustomers, {
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: `${search}|${filter}|${sortBy}`,
  });
  const rows = pagination.paginatedData;
  if (loading) return <LoadingState message="Loading customers..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Customer List <span className="text-ink/70">({filteredCustomers.length})</span></h3>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by customer name, account number, or phone" value={search} onChange={e => setSearch(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem',
            flex: 1,
            minWidth: '200px'
          }} />
            <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }}>
              {['All Customers', 'Assigned Today', 'Pending', 'Completed', 'Overdue', 'Blacklisted'].map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }}>
              {['Name', 'Outstanding Balance', 'Days Overdue', 'Distance'].map(option => <option key={option} value={option}>Sort: {option}</option>)}
            </select>
          </div>
        </div>
        {filteredCustomers.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Account</th>
                  <th>Address</th>
                  <th>Outstanding</th>
                  <th>Days Overdue</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(customer => <tr key={customer.id} className="clickable-row" onClick={() => navigate(`/collector/account-detail/${customer.id}?from=accounts`)}>
                    <td><strong>{customer.customerName}</strong></td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{customer.accountNumber || '—'}</span></td>
                    <td>{customer.address || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(customer.outstandingBalance)}</td>
                    <td>{customer.daysOverdue ?? '—'}</td>
                    <td><StatusBadge status={customer.status} /></td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View Details" onClick={() => navigate(`/collector/account-detail/${customer.id}?from=accounts`)}>
                        <NavIcon name="view" />
                      </button>
                      <button className="icon-action-button" type="button" title="Call Customer" onClick={() => collectorCall(customer, showToast)}>
                        <NavIcon name="user" />
                      </button>
                      <button className="icon-action-button" type="button" title="Open Map" onClick={() => collectorOpenMap(customer, navigate, 'accounts')}>
                        <NavIcon name="map" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No customers found" description="Adjust your search or filters to find customers." actionLabel="Clear search" onAction={() => {
      setSearch('');
      setFilter('All Customers');
    }} />}
      </section>
    </div>;
}
function AccountDetailPage({
  accountId,
  parentContext,
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);
  const pagination_account_paymentHistory = usePagination(account?.paymentHistory || []);
  const paginated_account_paymentHistory = pagination_account_paymentHistory.paginatedData;
  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" description="This customer may have been removed or is unavailable." actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }
  const backTo = parentContext === 'route' ? '/collector/route' : '/collector/accounts';
  const contextQuery = `?from=${parentContext}`;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Outstanding Balance',
      value: formatCurrency(account.outstandingBalance || 0)
    }, {
      label: 'Days Overdue',
      value: String(account.daysOverdue || 0)
    }, {
      label: 'Delinquency Status',
      value: account.status
    }, {
      label: 'Account Manager',
      value: account.account_manager_name || '—'
    }, {
      label: 'Customer Since',
      value: account.customer_since || '—'
    }, {
      label: 'Last Visit',
      value: account.lastVisitDate || '—'
    }]} />

      <section className="panel content-panel account-detail-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>{account.customerName}</h3>
          <p className="text-ink/70">{account.accountNumber}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Address:</strong> {account.address}</p>
            <p><strong>Contact:</strong> {account.phone}</p>
            <p><strong>Branch:</strong> {account.branch_name || '—'}</p>
            <p><strong>Account Manager:</strong> {account.account_manager_name || '—'}</p>
            <p><strong>Last Visit:</strong> {account.lastVisitDate}</p>
          </div>
          <div style={{
          minHeight: 200,
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
            <LeafletMap center={account.latitude && account.longitude ? [account.latitude, account.longitude] : [7.1907, 125.4553]} zoom={15} height={200} markers={[{
            id: account.id,
            position: account.latitude && account.longitude ? [account.latitude, account.longitude] : [7.1907, 125.4553],
            label: (account.customerName || 'CU').substring(0, 2).toUpperCase(),
            color: '#093850',
            popup: account.customerName
          }]} />
          </div>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Payment History</h3>
        </div>
        {account.paymentHistory && account.paymentHistory.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Receipt #</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Collected By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated_account_paymentHistory.map((row, i) => <tr key={row.receipt || i}>
                    <td>{formatDisplayDate(row.date)}</td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{row.receipt || '—'}</span></td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.method || 'Cash'}</td>
                    <td>{row.collector}</td>
                    <td>
                      <StatusBadge status={row.status || 'Completed'} />
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_account_paymentHistory} /></> : <EmptyState title="No payment history" description="Previous collections for this customer will appear here." />}
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(backTo)}>Back</button>
        <button className="button secondary" type="button" onClick={() => collectorOpenMap(account, navigate, parentContext)}>View on Map</button>
        <button className="button secondary" type="button" onClick={() => collectorCall(account, showToast)}>Call Customer</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/collector/incident/${account.id}${contextQuery}`)}>Report Incident</button>
        <button className="button secondary" type="button" onClick={() => navigate(`/collector/ci-form/${account.id}${contextQuery}`)}>Submit CI Form</button>
        <button className="button" type="button" onClick={() => navigate(`/collector/collection-log/${account.id}${contextQuery}`)}>Log Collection</button>
      </div>
    </div>;
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
    customerName: '',
    amountCollected: '',
    paymentMethod: '',
    notes: '',
    partialPayment: false,
    generateReceipt: true,
    proofPhoto: ''
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(['Cash', 'Check', 'Bank Transfer', 'GCash', 'Maya']);
  const contextQuery = `?from=${parentContext}`;
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [acctRes, methodsRes] = await Promise.all([
        fetchAccountById(accountId),
        fetchCollectorPaymentMethods(),
      ]);
      if (acctRes.success) {
        setAccount(acctRes.data);
        setFormData(prev => ({
          ...prev,
          customerName: acctRes.data.customerName || '',
        }));
      }
      if (methodsRes.success && methodsRes.data?.length) {
        setPaymentMethods(methodsRes.data.map(m => m.method_name));
      }
      setLoading(false);
    }
    load();
  }, [accountId]);
  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }
  const remainingBalance = Math.max((account.outstandingBalance || 0) - (Number(formData.amountCollected) || 0), 0);
  const handleChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setErrors(prev => ({
      ...prev,
      [name]: undefined
    }));
  };
  const handleSubmit = async () => {
    const amount = Number(formData.amountCollected);
    const outstanding = account.outstandingBalance || 0;
    const nextErrors = {};
    if (!amount || amount <= 0) nextErrors.amountCollected = 'Enter a valid amount greater than zero.';
    if (!formData.partialPayment && amount > outstanding) nextErrors.amountCollected = 'Amount cannot exceed outstanding balance.';
    if (formData.partialPayment && amount > outstanding) nextErrors.amountCollected = 'Partial payment still cannot exceed outstanding balance.';
    if (outstanding <= 0) nextErrors.amountCollected = 'Customer has no outstanding balance.';
    if (!formData.paymentMethod) nextErrors.paymentMethod = 'Select a payment method.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await submitCollectionPayment({
      customer_id: Number(account.id),
      amount,
      payment_method: formData.paymentMethod,
      notes: formData.notes || null,
      generate_receipt: formData.generateReceipt,
    });
    setSubmitting(false);
    if (!result.success) {
      showToast(result.message || 'Collection failed.', 'error');
      return;
    }
    showToast(result.message || 'Collection logged successfully.', 'success');
    if (result.data?.receipts_id) {
      navigate(`/collector/receipts/${result.data.receipts_id}`);
    } else if (result.data?.collectionpayment_id) {
      navigate(`/collector/history/${result.data.collectionpayment_id}`);
    } else {
      navigate(`/collector/account-detail/${account.id}${contextQuery}`);
    }
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <FormPanel title="Log Payment Collection" formData={formData} onChange={handleChange} errors={errors} fields={[{
      name: 'customerName',
      label: 'Customer Name',
      type: 'text',
      disabled: true,
      defaultValue: account.customerName
    }, {
      name: 'amountCollected',
      label: 'Amount Collected',
      type: 'number',
      required: true,
      min: 0,
      max: account.outstandingBalance || 0,
      placeholder: 'Enter amount'
    }, {
      name: 'paymentMethod',
      label: 'Payment Method',
      type: 'select',
      required: true,
      placeholder: 'Select payment method',
      options: paymentMethods
    }, {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Add notes about the transaction...'
    }, {
      name: 'proofPhoto',
      label: 'Proof Photo Upload',
      type: 'file',
      accept: 'image/*'
    }, {
      name: 'partialPayment',
      label: 'Partial Payment',
      type: 'toggle',
      toggleLabel: 'This is a partial payment'
    }, {
      name: 'remainingPreview',
      label: 'Remaining Balance Preview',
      type: 'preview',
      value: formatCurrency(remainingBalance)
    }, {
      name: 'generateReceipt',
      label: 'Generate Digital Receipt',
      type: 'toggle',
      toggleLabel: 'Generate receipt after submission'
    }]} />
      <div className="flex flex-wrap gap-2 justify-end mt-4 mb-2">
        <button className="button secondary" type="button" onClick={() => navigate(`/collector/account-detail/${account.id}${contextQuery}`)}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit & Generate Receipt'}</button>
      </div>
    </div>;
}
function ReceiptsListPage({
  navigate,
  showToast
}) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchDigitalReceipts();
      if (result.success) {
        setReceipts(result.data || []);
      } else {
        setError(result.message || 'Failed to load receipts.');
        if (showToast) showToast(result.message || 'Failed to load receipts', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
      const matchSearch = !q || (r.receipt_number || '').toLowerCase().includes(q) || (r.customer_name || '').toLowerCase().includes(q) || String(r.receipts_id).includes(q);
      const rDate = r.receipt_date ? r.receipt_date.slice(0, 10) : '';
      const matchFrom = !dateFrom || rDate >= dateFrom;
      const matchTo = !dateTo || rDate <= dateTo;
      return matchSearch && matchFrom && matchTo;
    });
  }, [receipts, search, dateFrom, dateTo]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading digital receipts..." />;
  if (error && !receipts.length) {
    return <EmptyState title="Unable to load receipts" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Digital Receipts</h3>
          <div className="list-section-actions">
            <button
              className="button secondary whitespace-nowrap"
              type="button"
              onClick={() => {
                const rows = filtered.map(r => ({
                  receipt_id: r.receipts_id,
                  receipt_number: r.receipt_number,
                  customer: r.customer_name,
                  amount: r.amount,
                  method: r.payment_method,
                  status: r.payment_status,
                  date: r.receipt_date,
                }));
                if (downloadPdf(rows, { filename: 'collector-receipts.pdf', title: 'Collector Receipts' })) showToast('Receipts exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
          </div>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 0
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by receipt number, customer, or ID" value={search} onChange={e => setSearch(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem',
            flex: 1,
            minWidth: '200px'
          }} />
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }} />
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }} />
          </div>
          <p className="list-section-subtitle">{receipts.length} record{receipts.length !== 1 ? 's' : ''} in database</p>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Receipt ID</th>
                  <th>Receipt Number</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Payment Status</th>
                  <th>Generated By</th>
                  <th>Receipt Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(r => <tr key={r.receipts_id}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.receipts_id}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{r.receipt_number}</span></td>
                    <td>{r.customer_name || '—'}</td>
                    <td style={{
                  fontWeight: 600
                }}>{formatCurrency(Number(r.amount))}</td>
                    <td>{r.payment_method || '—'}</td>
                    <td><StatusBadge status={r.payment_status} /></td>
                    <td>{r.generated_by_name || '—'}</td>
                    <td>{formatDisplayDate(r.receipt_date)}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/collector/receipts/${r.receipts_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No receipts found" description="Adjust your search or date filters." />}
      </section>
    </div>;
}
function DigitalReceiptPage({
  receiptId,
  navigate,
  showToast
}) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function load() {
      if (!receiptId) {
        setError('No receipt ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const result = await fetchDigitalReceiptById(receiptId);
      if (result.success && result.data) {
        setReceipt(result.data);
      } else {
        setError(result.message || 'Receipt not found.');
        if (showToast) showToast(result.message || 'Receipt not found', 'error');
      }
      setLoading(false);
    }
    load();
  }, [receiptId, showToast]);
  if (loading) return <LoadingState message="Loading receipt..." />;
  if (error || !receipt) {
    return <EmptyState title="Receipt not found" description={error || 'This receipt does not exist.'} actionLabel="Back to Receipts" onAction={() => navigate('/collector/receipts')} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      {/* Header */}
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">Digital Receipt · ID {receipt.receipts_id}</p>
          <h2>{receipt.receipt_number}</h2>
          <p className="text-ink/70">{receipt.branch_name} · {receipt.customer_name}</p>
        </div>
      </section>

      {/* KPI strip */}
      <StatsGrid stats={[{
      label: 'Receipt ID',
      value: String(receipt.receipts_id)
    }, {
      label: 'Amount',
      value: formatCurrency(Number(receipt.amount))
    }, {
      label: 'Payment Status',
      value: receipt.payment_status || '—'
    }, {
      label: 'Receipt Date',
      value: formatDisplayDate(receipt.receipt_date)
    }]} />

      {/* Full detail */}
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Receipt Detail</h3></div>
        <ul className="info-grid">
          <li><span className="info-item-label">Receipt ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{receipt.receipts_id}</span></li>
          <li><span className="info-item-label">Receipt Number</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{receipt.receipt_number}</span></li>
          <li><span className="info-item-label">Receipt Date</span>
              <span className="info-item-value">{formatDisplayDate(receipt.receipt_date)}</span></li>
          <li><span className="info-item-label">Generated By</span>
              <span className="info-item-value">{receipt.generated_by_name || '—'}</span></li>
          <li><span className="info-item-label">Customer</span>
              <span className="info-item-value">{receipt.customer_name || '—'}</span></li>
          <li><span className="info-item-label">Customer ID</span>
              <span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{receipt.customer_id}</span></li>
          <li><span className="info-item-label">Customer Address</span>
              <span className="info-item-value">{receipt.customer_address || '—'}</span></li>
          <li><span className="info-item-label">Customer Phone</span>
              <span className="info-item-value">{receipt.customer_phone || '—'}</span></li>
          <li><span className="info-item-label">Branch</span>
              <span className="info-item-value">{receipt.branch_name || '—'}</span></li>
          <li><span className="info-item-label">Amount</span>
              <span className="info-item-value" style={{
            fontWeight: 700,
            color: '#093850'
          }}>{formatCurrency(Number(receipt.amount))}</span></li>
          <li><span className="info-item-label">Payment Method</span>
              <span className="info-item-value">{receipt.payment_method || '—'}</span></li>
          <li><span className="info-item-label">Payment Date</span>
              <span className="info-item-value">{formatDisplayDate(receipt.payment_date)}</span></li>
          <li><span className="info-item-label">Payment Time</span>
              <span className="info-item-value">{receipt.payment_time ? String(receipt.payment_time).slice(0, 8) : '—'}</span></li>
          <li><span className="info-item-label">Payment Status</span>
              <span className="info-item-value"><StatusBadge status={receipt.payment_status} /></span></li>
          {receipt.notes && <li><span className="info-item-label">Notes</span>
                <span className="info-item-value">{receipt.notes}</span></li>}
        </ul>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/collector/receipts')}>Back to Receipts</button>
        <button className="button secondary" type="button" onClick={async () => {
          const result = await sendReceiptToCustomer(receipt.receipts_id);
          if (result.success) showToast(result.message || 'Receipt sent.', 'success');
          else showToast(result.message || 'Could not send receipt.', 'error');
        }}>
          Send to (Customer)
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            const row = {
              receipt_id: receipt.receipts_id,
              receipt_number: receipt.receipt_number,
              customer: receipt.customer_name,
              amount: receipt.amount,
              method: receipt.payment_method,
              payment_date: receipt.payment_date,
              branch: receipt.branch_name,
            };
            if (downloadPdf([row], { filename: `receipt-${receipt.receipt_number}.pdf`, title: 'Receipt Details' })) showToast('Receipt exported as PDF.', 'success');
          }}
        >
          Export PDF
        </button>
      </div>
    </div>;
}
function CIFormPage({
  accountId,
  parentContext,
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    customerName: '',
    purpose: '',
    monthlyIncome: '',
    businessType: '',
    reference1: '',
    reference2: '',
    remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const contextQuery = `?from=${parentContext}`;
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) {
        setAccount(result.data);
        setFormData(prev => ({
          ...prev,
          customerName: result.data.customerName || '',
        }));
      }
      setLoading(false);
    }
    load();
  }, [accountId]);
  if (loading) return <LoadingState message="Loading customer..." />;
  if (!account) {
    return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/collector/accounts')} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <FormPanel title="Credit Investigation Form" formData={formData} onChange={(name, value) => setFormData(prev => ({
      ...prev,
      [name]: value
    }))} fields={[{
      name: 'customerName',
      label: 'Customer Name',
      type: 'text',
      disabled: true,
      defaultValue: account.customerName
    }, {
      name: 'purpose',
      label: 'Purpose of CI',
      type: 'select',
      required: true,
      placeholder: 'Select purpose',
      options: ['Credit Limit Increase', 'New Customer', 'Delinquency Review', 'Account Restructure']
    }, {
      name: 'monthlyIncome',
      label: 'Monthly Income',
      type: 'number',
      required: true,
      placeholder: 'PHP amount'
    }, {
      name: 'businessType',
      label: 'Business Type',
      type: 'select',
      required: true,
      placeholder: 'Select type',
      options: ['Sari-Sari Store', 'Convenience Store', 'General Store', 'Wholesale', 'Retail', 'Service']
    }, {
      name: 'reference1',
      label: 'Character Reference 1',
      type: 'text',
      placeholder: 'Name and contact'
    }, {
      name: 'reference2',
      label: 'Character Reference 2',
      type: 'text',
      placeholder: 'Name and contact'
    }, {
      name: 'remarks',
      label: 'Remarks',
      type: 'textarea',
      placeholder: 'Additional notes for the operating manager...'
    }]} />
      <div className="flex flex-wrap gap-2 justify-end mt-4 mb-2">
        <button className="button secondary" type="button" onClick={() => navigate(`/collector/account-detail/${account.id}${contextQuery}`)}>Cancel</button>
        <button className="button" type="button" disabled={submitting} onClick={async () => {
        if (!formData.purpose || !formData.monthlyIncome || !formData.businessType) {
          showToast('Purpose, monthly income, and business type are required.', 'error');
          return;
        }
        const referencesSummary = [formData.reference1, formData.reference2].filter(Boolean).join(' | ') || null;
        setSubmitting(true);
        const result = await submitCollectorCreditInvestigation({
          customer_id: Number(account.id),
          purpose: formData.purpose,
          monthly_income: Number(formData.monthlyIncome),
          business_type: formData.businessType,
          references_summary: referencesSummary,
          form_remarks: formData.remarks || null,
        });
        setSubmitting(false);
        if (!result.success) {
          showToast(result.message || 'Submit failed.', 'error');
          return;
        }
        showToast(result.message || 'CI submitted.', 'success');
        navigate(`/collector/account-detail/${account.id}${contextQuery}`);
      }}>{submitting ? 'Submitting…' : 'Submit to Operating Manager'}</button>
      </div>
    </div>;
}
function IncidentReportPage({
  accountId,
  parentContext,
  navigate,
  showToast
}) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const contextQuery = parentContext ? `?from=${parentContext}` : '';
  const backTo = account ? `/collector/account-detail/${account.id}${contextQuery}` : '/collector/dashboard';
  useEffect(() => {
    async function load() {
      if (!accountId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await fetchAccountById(accountId);
      if (result.success) setAccount(result.data);
      setLoading(false);
    }
    load();
  }, [accountId]);
  if (accountId && loading) return <LoadingState message="Loading customer..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      {account ? <section className="panel content-panel relative overflow-hidden">
          <p className="text-ink/70">Reporting incident for <strong>{account.customerName}</strong> ({account.accountNumber})</p>
        </section> : null}
      <FormPanel title="Report Incident" formData={formData} onChange={(name, value) => setFormData(prev => ({
      ...prev,
      [name]: value
    }))} fields={[{
      name: 'incidentType',
      label: 'Incident Type',
      type: 'select',
      required: true,
      placeholder: 'Select type',
      options: ['Safety Concern', 'Payment Dispute', 'Customer Aggression', 'Location Issue', 'Product Damage', 'Other']
    }, {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      required: true,
      placeholder: 'Describe the incident in detail...'
    }, {
      name: 'location',
      label: 'Location',
      type: 'text',
      placeholder: account?.address ?? 'Auto-detected or manual entry'
    }, {
      name: 'photo',
      label: 'Photo Upload',
      type: 'file',
      accept: 'image/*'
    }, {
      name: 'gps',
      label: 'GPS Coordinates',
      type: 'text',
      placeholder: '14.6760, 121.0437 (auto-detected)'
    }, {
      name: 'severity',
      label: 'Severity Level',
      type: 'select',
      required: true,
      placeholder: 'Select severity',
      options: ['Low', 'Medium', 'High', 'Critical']
    }]} />
      <div className="flex flex-wrap gap-2 justify-end mt-4 mb-2">
        <button className="button secondary" type="button" onClick={() => navigate(backTo)}>Cancel</button>
        <button className="button" type="button" disabled={submitting} onClick={async () => {
        if (!formData.incidentType || !formData.description || !formData.severity) {
          showToast('Incident type, description, and severity are required.', 'error');
          return;
        }
        setSubmitting(true);
        const result = await submitCollectorIncident({
          customer_id: accountId ? Number(accountId) : null,
          incident_type: formData.incidentType,
          description: formData.description,
          location: formData.location || account?.address || null,
          severity: formData.severity,
          gps: formData.gps || null,
        });
        setSubmitting(false);
        if (!result.success) {
          showToast(result.message || 'Submit failed.', 'error');
          return;
        }
        showToast(result.message || 'Incident report sent.', 'success');
        navigate(backTo);
      }}>{submitting ? 'Submitting…' : 'Submit to Operating Manager'}</button>
      </div>
    </div>;
}
function CollectionHistoryPage({
  navigate,
  showToast
}) {
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchCollectionPayments();
      if (result.success) {
        setPayments(result.data || []);
      } else {
        setError(result.message || 'Failed to load collection payments.');
        if (showToast) showToast(result.message || 'Failed to load collection payments', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter(p => {
      const matchesSearch = !query || (p.customer_name || '').toLowerCase().includes(query) || (p.receipt_number || '').toLowerCase().includes(query) || String(p.receipts_id || '').includes(query) || String(p.collectionpayment_id).includes(query);
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesFrom = !dateFrom || p.payment_date >= dateFrom;
      const matchesTo = !dateTo || p.payment_date <= dateTo;
      return matchesSearch && matchesStatus && matchesFrom && matchesTo;
    });
  }, [payments, search, statusFilter, dateFrom, dateTo]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading collection payments..." />;
  if (error && !payments.length) {
    return <EmptyState title="Unable to load collection payments" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Collection Payments</h3>
          <div className="list-section-actions">
            <button
              className="button secondary whitespace-nowrap"
              type="button"
              onClick={() => {
                const rows = filtered.map(p => ({
                  payment_id: p.collectionpayment_id,
                  receipt: p.receipt_number,
                  customer: p.customer_name,
                  amount: p.amount,
                  method: p.payment_method,
                  status: p.status,
                  date: p.payment_date,
                }));
                if (downloadPdf(rows, { filename: 'collector-payments.pdf', title: 'Collector Payments' })) showToast('Payments exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
          </div>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by customer, receipt number, or ID" value={search} onChange={e => setSearch(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem',
            flex: 1,
            minWidth: '200px'
          }} />
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }}>
              {['All', 'Pending', 'Completed', 'Cancelled'].map(option => <option key={option} value={option}>Status: {option}</option>)}
            </select>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }} />
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }} />
          </div>
          <p className="list-section-subtitle">{payments.length} record{payments.length !== 1 ? 's' : ''} in database</p>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Receipt Number</th>
                  <th>Customer</th>
                  <th>Collector</th>
                  <th>Branch</th>
                  <th>Payment Method</th>
                  <th>Amount</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(p => <tr key={p.collectionpayment_id}>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{p.collectionpayment_id}</span></td>
                    <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{p.receipt_number || '—'}</span></td>
                    <td>{p.customer_name || '—'}</td>
                    <td>{p.collector_name || '—'}</td>
                    <td>{p.branch_name || '—'}</td>
                    <td>{p.payment_method || '—'}</td>
                    <td>{formatCurrency(Number(p.amount))}</td>
                    <td style={{
                  fontSize: '0.82rem'
                }}>{formatPaymentTimestamp(p.payment_date, p.payment_time)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/collector/history/${p.collectionpayment_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No collection records found" description="Adjust your search or date filters." />}
      </section>
    </div>;
}
function CollectionPaymentDetailPage({
  paymentId,
  navigate,
  showToast
}) {
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchCollectionPaymentById(paymentId);
      if (result.success) setPayment(result.data);else if (showToast) showToast(result.message || 'Payment not found.', 'error');
      setLoading(false);
    }
    load();
  }, [paymentId, showToast]);
  if (loading) return <LoadingState message="Loading collection payment..." />;
  if (!payment) {
    return <EmptyState title="Payment not found" actionLabel="Back to History" onAction={() => navigate('/collector/history')} />;
  }
  return <div className="relative z-10 grid gap-[22px] w-full">
      <StatsGrid stats={[{
      label: 'Payment ID',
      value: String(payment.collectionpayment_id)
    }, {
      label: 'Amount',
      value: formatCurrency(Number(payment.amount))
    }, {
      label: 'Status',
      value: payment.status
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Collection Payment Detail</h3>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Receipt ID</span><span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{payment.receipts_id ?? '—'}</span></li>
          <li><span className="info-item-label">Receipt Number</span><span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{payment.receipt_number || '—'}</span></li>
          <li><span className="info-item-label">Customer</span><span className="info-item-value">{payment.customer_name || '—'}</span></li>
          <li><span className="info-item-label">Customer ID</span><span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{payment.customer_id ?? '—'}</span></li>
          <li><span className="info-item-label">Collector</span><span className="info-item-value">{payment.collector_name || '—'}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{payment.branch_name || '—'}</span></li>
          <li><span className="info-item-label">Branch ID</span><span className="info-item-value" style={{
            fontFamily: 'monospace'
          }}>{payment.branch_id ?? '—'}</span></li>
          <li><span className="info-item-label">Payment Method</span><span className="info-item-value">{payment.payment_method || '—'}</span></li>
          <li><span className="info-item-label">Timestamp</span><span className="info-item-value">{formatPaymentTimestamp(payment.payment_date, payment.payment_time)}</span></li>
          <li><span className="info-item-label">Created At</span><span className="info-item-value">{formatDisplayDateTime(payment.created_at)}</span></li>
          <li><span className="info-item-label">Updated At</span><span className="info-item-value">{formatDisplayDateTime(payment.updated_at)}</span></li>
          {payment.notes ? <li><span className="info-item-label">Notes</span><span className="info-item-value">{payment.notes}</span></li> : null}
        </ul>
      </section>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/collector/history')}>Back to History</button>
        {payment.receipts_id ? <button className="button secondary" type="button" onClick={() => navigate(`/collector/receipts/${payment.receipts_id}`)}>Open Digital Receipt</button> : null}
      </div>
    </div>;
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
  navigate,
  showToast
}) {
  const sessionUser = getCurrentUser();
  const [profile, setProfile] = useState(null);
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    async function load() {
      const res = await fetchMyProfile();
      if (res.success) setProfile(res.data);
    }
    load();
  }, []);
  const userName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    : sessionUser?.fullName || 'Collector';
  const userBranch = profile?.branch?.name || sessionUser?.branch?.name || '—';
  const roleLabel = profile?.role?.name || sessionUser?.role?.name || 'Collector';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const saveProfile = async () => {
    if (!profile) return;
    const payload = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
    };
    if (password.trim()) payload.password = password.trim();
    const res = await updateMyProfile(payload);
    if (res.success) {
      persistCurrentUserFromProfile(res.data);
      setProfile(res.data);
      setPassword('');
      setEditing(false);
      showToast('Profile updated.', 'success');
    } else showToast(res.message || 'Update failed.', 'error');
  };
  if (!profile) return <LoadingState message="Loading profile..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{userInitials}</div>
          <div><h3>{userName}</h3><p className="text-ink/70">{roleLabel}</p></div>
        </div>
        {editing ? <div className="form-grid" style={{ marginTop: 16 }}>
            <label>First name<input value={profile.first_name || ''} onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} /></label>
            <label>Last name<input value={profile.last_name || ''} onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} /></label>
            <label>Email<input type="email" value={profile.email || ''} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} /></label>
            <label>Phone<input value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} /></label>
            <label>New password (optional)<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" /></label>
          </div>
          : <ul className="info-grid">
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{userBranch}</span></li>
            <li><span className="info-item-label">Email</span><span className="info-item-value">{profile.email}</span></li>
            <li><span className="info-item-label">Phone</span><span className="info-item-value">{profile.phone || '—'}</span></li>
            <li><span className="info-item-label">Status</span><span className="info-item-value">{profile.status || '—'}</span></li>
          </ul>}
      </section>
      <div className="flex flex-wrap gap-2 justify-end mt-4 mb-2">
        <button className="button ghost" type="button" onClick={() => navigate('/collector/settings')}>Settings</button>
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        {editing ? <>
            <button className="button ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="button" type="button" onClick={saveProfile}>Save Profile</button>
          </> : <button className="button" type="button" onClick={() => setEditing(true)}>Update Profile</button>}
      </div>
    </div>;
}
function SettingsPage({
  navigate
}) {
  const [prefs, setPrefs] = useState(() => ({
    language: localStorage.getItem('corvex_collector_language') || 'English',
    push: localStorage.getItem('corvex_collector_push') !== '0',
    autosync: localStorage.getItem('corvex_collector_autosync') !== '0',
  }));
  const save = (next) => {
    setPrefs(next);
    localStorage.setItem('corvex_collector_language', next.language);
    localStorage.setItem('corvex_collector_push', next.push ? '1' : '0');
    localStorage.setItem('corvex_collector_autosync', next.autosync ? '1' : '0');
  };
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel form-panel content-panel">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>Settings</h3>
        </div>
        <p className="text-ink/70">These preferences are saved on this device.</p>
        <div className="form-group">
          <label>Language</label>
          <select className="filter-select" value={prefs.language} onChange={(e) => save({ ...prefs, language: e.target.value })}>
            <option>English</option>
            <option>Filipino</option>
          </select>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={prefs.push} onChange={(e) => save({ ...prefs, push: e.target.checked })} />
            Enable push notifications
          </label>
        </div>
        <div className="form-group">
          <label className="toggle-label">
            <input type="checkbox" checked={prefs.autosync} onChange={(e) => save({ ...prefs, autosync: e.target.checked })} />
            Auto-sync route data
          </label>
        </div>
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/collector/dashboard')}>Back to Dashboard</button>
      </div>
    </div>;
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
    case 'receiptsList':
      return <ReceiptsListPage {...props} />;
    case 'digitalReceipt':
      return <DigitalReceiptPage receiptId={page.params?.receiptId} {...props} />;
    case 'ciForm':
      return <CIFormPage {...props} />;
    case 'incidentReport':
    case 'incidentReportStandalone':
      return <IncidentReportPage {...props} />;
    case 'history':
      return <CollectionHistoryPage {...props} />;
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...props} />;
    case 'collectionPaymentDetail':
      return <CollectionPaymentDetailPage {...props} />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}