import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination, useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { ChartDrilldownModal } from '../shared/ChartDrilldownModal.jsx';
import { useChartDrilldown } from '../../hooks/useChartDrilldown.js';
import { formatCurrency as formatMoney } from '../../utils/formatters.js';
import {
  fetchCustomerById,
  fetchFieldVisits,
  fetchFieldVisitById,
  fetchInvoices,
  fetchSalesAuditLogs,
  fetchSalesDashboard,
  updateFieldVisit,
} from '../../api/salesService';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  mapNotificationRow,
} from '../../api/notificationService.js';
import { getCurrentUser, getUserAssignedLocation } from '../../api/authService.js';
import { listOfflineRecords } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { flushOfflineQueue } from '../../offline/flushQueue.js';
import { isSalesGpsEnabled } from '../../settings/preferences.js';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import apiClient from '../../api/apiClient.js';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';
import { InvoiceDetailsPage } from './InvoiceDetailsPage';
import { LogSalePage } from './LogSalePage';
import { AreaAssignmentDetailPage, SchedulePage } from './SalesAreaSchedule';
import { FieldActivityReportDetailPage, FieldActivityReportsPage } from './SalesFieldReports';
import { CustomerDetailPage, CustomerFormPage, CustomersPage } from './SalesCustomers';
import {
  SalesCreditReviewDetailPage,
  SalesCreditReviewRequestPage,
  SalesCreditReviewsPage,
} from './CreditReviewsPages';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';
function OfflineBanner() {
  return null;
}
function manilaTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

/** Lightweight CSS ring — no chart library cost on the fold. */
function AreaProgressRing({ completed = 0, total = 0 }) {
  const safeTotal = Number(total) || 0;
  const safeDone = Number(completed) || 0;
  const pct = safeTotal > 0 ? Math.min(100, Math.round((safeDone / safeTotal) * 100)) : 0;
  return (
    <div
      className="sa-area-ring"
      style={{ '--sa-ring-pct': `${pct}` }}
      role="img"
      aria-label={`${safeDone} of ${safeTotal} areas completed (${pct}%)`}
    >
      <div className="sa-area-ring-inner">
        <strong>{safeDone}/{safeTotal || 0}</strong>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function DashboardPage({
  navigate,
  showToast,
}) {
  const currentUser = getCurrentUser();
  const todayIso = manilaTodayIso();
  const todayLabel = formatDisplayDate(todayIso);
  const { drilldown, closeDrilldown, openApiDrilldown } = useChartDrilldown({ showToast });
  const [dashboard, setDashboard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPerformance, setShowPerformance] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Same two calls as before — no extra endpoints.
      const [dashRes, notifRes] = await Promise.all([fetchSalesDashboard(), fetchNotifications()]);
      if (dashRes.success) setDashboard(dashRes.data);
      if (notifRes.success) {
        const rows = notifRes.data || [];
        setUnreadCount(rows.filter((n) => n.status !== 'Read' && !n.read).length);
      }
      setLoading(false);
    }
    load();
  }, []);

  const summary = dashboard?.summary || {};
  const analytics = dashboard?.analytics || {};
  const assignments = dashboard?.todayAssignments || [];
  const lowStockItems = dashboard?.lowStockItems || [];
  const creditAttention = dashboard?.creditReviewsNeedingAttention || [];
  const recentSales = (dashboard?.recentSales || []).slice(0, 5);
  const areasAssigned = summary.areasAssignedToday ?? summary.accountsToVisit ?? 0;
  const areasCompleted = summary.areasCompletedToday ?? summary.completedVisits ?? 0;
  const pendingCredits = summary.creditInvestigationsPending ?? 0;
  const salesLogged = summary.salesLogged ?? 0;
  const dailyRevenue = Number(analytics.dailyRevenue || 0);
  const agentName = currentUser?.fullName || 'Sales Agent';
  const historyTodayPath = `/sales/history?start_date=${todayIso}&end_date=${todayIso}`;
  const firstCredit = creditAttention[0] || null;

  if (loading) return <LoadingState message="Loading dashboard…" />;

  return (
    <div className="page sa-dashboard">
      <OfflineBanner />

      {/* GLANCE */}
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{greetingForNow()}</p>
          <h2>{agentName}</h2>
          <p className="muted">{todayLabel}</p>
        </div>
        <Link
          to="/sales/notifications"
          className="notification-bell"
          aria-label={`${unreadCount} unread notifications`}
        >
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      {firstCredit ? (
        <button
          type="button"
          className="sa-alert-banner sa-alert-banner--credit"
          onClick={() => navigate(`/sales/credit-investigations/${firstCredit.id}`)}
        >
          <span className="sa-alert-banner-copy">
            <strong>Credit review needs attention</strong>
            <span className="muted">
              {firstCredit.customerName}
              {firstCredit.reason ? ` · ${firstCredit.reason}` : ''}
              {creditAttention.length > 1 ? ` · +${creditAttention.length - 1} more` : ''}
            </span>
          </span>
          <StatusBadge status={firstCredit.status === 'Revision Requested' ? 'Needs BM' : firstCredit.status} />
        </button>
      ) : null}

      {lowStockItems.length ? (
        <button
          type="button"
          className="sa-alert-banner sa-alert-banner--stock"
          onClick={() => navigate('/sales/inventory')}
        >
          <span className="sa-alert-banner-copy">
            <strong>{lowStockItems.length} product{lowStockItems.length === 1 ? '' : 's'} low or out</strong>
            <span className="muted">
              {lowStockItems.slice(0, 2).map((item) => item.name).join(' · ')}
              {lowStockItems.length > 2 ? ` · +${lowStockItems.length - 2} more` : ''}
            </span>
          </span>
          <span className="sa-alert-banner-cta">Inventory</span>
        </button>
      ) : null}

      <div className="sa-glance-kpis">
        <button
          type="button"
          className="sa-kpi-card sa-kpi-card--areas"
          onClick={() => navigate('/sales/schedule')}
          title="Open today’s schedule"
        >
          <AreaProgressRing completed={areasCompleted} total={areasAssigned} />
          <div className="sa-kpi-copy">
            <span className="sa-kpi-label">Areas today</span>
            <strong className="sa-kpi-value">{areasCompleted} done · {Math.max(0, areasAssigned - areasCompleted)} left</strong>
          </div>
        </button>

        <button
          type="button"
          className="sa-kpi-card"
          onClick={() => navigate(historyTodayPath)}
          title="Open today’s sales history"
        >
          <div className="sa-kpi-copy">
            <span className="sa-kpi-label">Sales today</span>
            <strong className="sa-kpi-value">{salesLogged} logged</strong>
            <span className="sa-kpi-sub">{formatCurrency(dailyRevenue)}</span>
          </div>
        </button>

        <button
          type="button"
          className="sa-kpi-card"
          onClick={() => navigate('/sales/credit-investigations?filter=Needs%20BM')}
          title="Credit reviews waiting on Branch Manager"
        >
          <div className="sa-kpi-copy">
            <span className="sa-kpi-label">Pending credit reviews</span>
            <strong className="sa-kpi-value">{pendingCredits}</strong>
            <span className="sa-kpi-sub">Needs BM</span>
          </div>
        </button>
      </div>

      {/* ACT */}
      <section className="panel content-panel sa-act-panel">
        <div className="panel-section-header sa-act-header">
          <div>
            <h3>Today&apos;s Assignments</h3>
            <p className="list-section-subtitle">Your area canvass for today.</p>
          </div>
          <div className="dashboard-actions sa-act-actions">
            <button className="button" type="button" onClick={() => navigate('/sales/log-sale')}>
              Log a Sale
            </button>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule')}>
              Schedule
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => navigate('/sales/customers')}
              title="Open a customer, then request a credit review"
            >
              Credit Review
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/sales/inventory')}>
              Inventory
            </button>
          </div>
        </div>

        {assignments.length ? (
          <ul className="widget-list">
            {assignments.slice(0, 5).map((assignment) => (
              <li key={assignment.assignmentId}>
                <div>
                  <strong>{assignment.areaName || 'Area'}</strong>
                  <span className="muted">
                    {formatDisplayDate(assignment.workDate)}
                    {assignment.coverageNotes ? ` · ${assignment.coverageNotes}` : ''}
                  </span>
                </div>
                <div className="sa-assignment-actions">
                  <StatusBadge status={assignment.status} />
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => navigate(`/sales/schedule/${assignment.assignmentId}`)}
                  >
                    Open Area
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No area assigned for today"
            description="No area assigned for today — ask your Branch Head."
          />
        )}
      </section>

      {/* REVIEW — recent sales always visible; charts mount only when expanded */}
      <section className="panel content-panel sa-review-panel">
        <div className="panel-section-header">
          <div>
            <h3>Performance</h3>
            <p className="list-section-subtitle">Recent activity and optional analytics.</p>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => setShowPerformance((open) => !open)}
            aria-expanded={showPerformance}
          >
            {showPerformance ? 'Hide charts' : 'Show charts'}
          </button>
        </div>

        <div className="sa-review-grid">
          <section className="panel dashboard-panel-compact sa-review-feed">
            <div className="dashboard-panel-heading">
              <h4>Recent Sales</h4>
              <button className="button secondary" type="button" onClick={() => navigate('/sales/history')}>
                History
              </button>
            </div>
            {recentSales.length ? (
              <ul className="widget-list">
                {recentSales.map((sale) => (
                  <li
                    key={sale.id || sale.invoiceNumber}
                    className="clickable-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      if (!sale.invoiceNumber) return;
                      navigate(`/sales/invoices/${encodeURIComponent(sale.invoiceNumber)}`);
                    }}
                  >
                    <div>
                      <strong>{sale.customerName}</strong>
                      <span className="muted">
                        {sale.invoiceNumber || 'Invoice'} · {formatDisplayDate(sale.date)}
                      </span>
                    </div>
                    <span>{formatCurrency(sale.totalAmount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty muted">No recent sales yet.</p>
            )}
          </section>

          {showPerformance ? (
            <div className="sa-review-charts">
              <section className="panel dashboard-panel-compact">
                <div className="panel-section-header">
                  <h4>Revenue by Period</h4>
                  <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Click a bar for invoices</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      { period: 'Today', amount: dailyRevenue, key: 'daily' },
                      { period: 'Weekly', amount: Number(analytics.weeklyRevenue || 0), key: 'weekly' },
                      { period: 'Monthly', amount: Number(analytics.monthlyRevenue || 0), key: 'monthly' },
                    ]}
                    style={{ cursor: 'pointer' }}
                    onClick={(state) => {
                      const label = state?.activeLabel;
                      const point = state?.activePayload?.[0]?.payload;
                      if (!point?.key) return;
                      openApiDrilldown(
                        { type: 'sales_period', period: point.key },
                        {
                          title: 'Sales invoices',
                          category: label || point.period,
                          dateRange: point.key,
                          columnSet: 'sales',
                          legend: [{ label: 'Revenue', value: formatMoney(point.amount || 0) }],
                          filenameBase: `sales-${point.key}`,
                        }
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Bar dataKey="amount" name="Revenue" fill="#1A4162" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="panel dashboard-panel-compact">
                <div className="panel-section-header">
                  <h4>Top Products</h4>
                  <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Last 30 days</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={analytics.topProducts || []}
                    style={{ cursor: 'pointer' }}
                    onClick={(state) => {
                      const name = state?.activeLabel || state?.activePayload?.[0]?.payload?.name;
                      if (!name) return;
                      openApiDrilldown(
                        { type: 'sales_product', name },
                        {
                          title: 'Invoices for product',
                          category: name,
                          dateRange: 'Last 30 days',
                          columnSet: 'sales',
                          filenameBase: `product-${String(name).slice(0, 24)}`,
                        }
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="units" name="Units" fill="#408DAD" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="panel dashboard-panel-compact">
                <div className="panel-section-header">
                  <h4>Top Customers</h4>
                  <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Last 90 days</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={analytics.topCustomers || []}
                    style={{ cursor: 'pointer' }}
                    onClick={(state) => {
                      const name = state?.activeLabel || state?.activePayload?.[0]?.payload?.name;
                      if (!name) return;
                      openApiDrilldown(
                        { type: 'sales_customer', name },
                        {
                          title: 'Invoices for customer',
                          category: name,
                          dateRange: 'Last 90 days',
                          columnSet: 'sales',
                          filenameBase: `customer-${String(name).slice(0, 24)}`,
                        }
                      );
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                    <Bar dataKey="revenue" name="Revenue" fill="#1A4162" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>
          ) : (
            <p className="dashboard-empty muted sa-review-hint">
              Charts stay hidden until you need them — tap Show charts to load analytics.
            </p>
          )}
        </div>
      </section>

      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>
  );
}
function VisitLogPage({
  visitId,
  parentContext,
  navigate,
  showToast
}) {
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    async function load() {
      if (!visitId) {
        setError('No visit id provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const res = await fetchFieldVisitById(visitId);
      if (res.success && res.data) {
        setVisit(res.data);
      } else {
        setError(res.message || 'Field visit not found.');
        if (showToast) showToast(res.message || 'Field visit not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [visitId, showToast]);
  const handleMarkCompleted = async () => {
    if (!visit) return;
    setUpdating(true);
    const res = await updateFieldVisit(visitId, {
      status: 'Completed'
    });
    if (res.success && res.data) {
      setVisit(res.data);
      showToast('Visit marked as completed.', 'success');
    } else {
      showToast(res.message || 'Failed to update visit.', 'error');
    }
    setUpdating(false);
  };
  if (loading) return <LoadingState message="Loading field visit..." />;
  if (error) {
    return <EmptyState title="Visit not found" description={error} actionLabel="Back to Schedule" onAction={() => navigate('/sales/schedule')} />;
  }
  const customerName = visit.customer_name || `${visit.first_name || ''} ${visit.last_name || ''}`.trim() || '—';
  return <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Field Visit Record</h3>
          <p className="muted">Visit ID: {visit.visit_id}</p>
        </div>
        <StatsGrid stats={[{
        label: 'Visit ID',
        value: String(visit.visit_id)
      }, {
        label: 'User ID',
        value: String(visit.user_id ?? '—')
      }, {
        label: 'Visit Type',
        value: visit.visit_type || '—'
      }, {
        label: 'Scheduled Date',
        value: formatDisplayDate(visit.scheduled_date)
      }, {
        label: 'Status',
        value: <StatusBadge status={visit.status} />
      }, {
        label: 'Customer',
        value: customerName
      }]} />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Visit Details</h3>
        </div>
        <div className="account-detail-grid two-up">
          <DetailRowsTable rows={[
            { label: 'Visit ID', value: visit.visit_id },
            { label: 'User ID', value: visit.user_id ?? '—' },
            { label: 'Visit Type', value: visit.visit_type || '—' },
            { label: 'Scheduled Date', value: formatDisplayDate(visit.scheduled_date) },
            { label: 'Status', value: <StatusBadge status={visit.status} /> },
            { label: 'Created At', value: formatDisplayDateTime(visit.created_at) },
            { label: 'Updated At', value: formatDisplayDateTime(visit.updated_at) },
          ]} />
          <div>
            <h4 className="subsection-title">Agent</h4>
            <DetailRowsTable rows={[
              { label: 'User ID', value: visit.user_id ?? '—' },
              { label: 'Agent Name', value: visit.agent_name || '—' },
              { label: 'Agent', value: visit.agent_first_name || visit.agent_last_name ? `${visit.agent_first_name || ''} ${visit.agent_last_name || ''}`.trim() : '—' },
            ]} />
          </div>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Customer Information</h3>
        </div>
        <div className="account-detail-grid two-up">
          <DetailRowsTable rows={[
            { label: 'Customer ID', value: visit.customer_id ?? '—' },
            { label: 'Name', value: customerName },
            { label: 'Address', value: visit.address || '—' },
            { label: 'Contact Phone', value: visit.contact_phone || '—' },
            { label: 'Contact Person', value: visit.contact_person_fname ? `${visit.contact_person_fname} ${visit.contact_person_lname || ''}` : '—' },
            { label: 'Contact Person Phone', value: visit.contact_person_phone || '—' },
            { label: 'Customer Status', value: <StatusBadge status={visit.customer_status || '—'} /> },
            { label: 'Latitude', value: visit.latitude ?? '—' },
            { label: 'Longitude', value: visit.longitude ?? '—' },
          ]} />
          <div>
            {visit.latitude && visit.longitude ? <div style={{
            minHeight: 240,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
                <LeafletMap center={[Number(visit.latitude), Number(visit.longitude)]} zoom={15} height={240} markers={[{
              id: visit.visit_id,
              position: [Number(visit.latitude), Number(visit.longitude)],
              popup: `<strong>${customerName}</strong><br/>${visit.address || ''}`,
              label: String(visit.visit_id),
              color: visit.status === 'Completed' ? '#1A4162' : '#0B1E30'
            }]} />
              </div> : null}
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule')}>Back to Schedule</button>
        <button className={visit.status === 'Completed' ? 'button secondary' : 'button'} type="button" onClick={() => handleMarkCompleted()} disabled={updating || visit.status === 'Completed'}>Mark Completed</button>
      </div>
    </div>;
}
function availableQty(product) {
  const value = Number(product?.available_stock ?? product?.quantity ?? 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Same thresholds as GET /products CASE (and BM branch inventory):
 * qty <= 0 → Out; qty <= reorder → Low (incl. Critical); else Sufficient.
 * SA UI uses short labels: Sufficient / Low / Out.
 */
function stockStatusLabel(product) {
  const qty = availableQty(product);
  if (qty <= 0) return 'Out';
  const reorder = Number(product?.reorder_level || 0);
  if (reorder > 0 && qty <= reorder) return 'Low';
  const raw = String(product?.stock_status || '');
  if (raw === 'Out of Stock') return 'Out';
  if (raw === 'Low Stock' || raw === 'Critical Stock') return 'Low';
  return 'Sufficient';
}

function InventoryPage({
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const branchId = currentUser?.branchId ?? currentUser?.branch?.id;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [sortBy, setSortBy] = useState('Product Name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      setError(null);
      try {
        const params = { product_status: 'Active', limit: 500 };
        if (branchId != null) params.branch_id = branchId;
        const res = await apiClient.get('/products', { params });
        if (res.data.success) {
          setProducts(res.data.data || []);
          setCategories(res.data.categories || []);
        } else {
          setProducts([]);
          setError(res.data.message || 'Failed to load inventory.');
          showToast?.(res.data.message || 'Failed to load inventory.', 'error');
        }
      } catch (err) {
        console.error('[SalesInventory] load error:', err.message);
        setProducts([]);
        setError(err.message || 'Failed to load inventory.');
        showToast?.(err.message || 'Failed to load inventory.', 'error');
      }
      setLoading(false);
    }
    loadProducts();
  }, [branchId]);

  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter((p) => (
        String(p.product_name || '').toLowerCase().includes(query)
        || String(p.category_name || '').toLowerCase().includes(query)
        || String(p.sku || '').toLowerCase().includes(query)
      ));
    }
    if (category !== 'All') {
      results = results.filter((p) => Number(p.category_id) === Number(category));
    }
    if (stockFilter !== 'All') {
      results = results.filter((p) => {
        const label = stockStatusLabel(p);
        if (stockFilter === 'In Stock') return label === 'Sufficient';
        if (stockFilter === 'Low') return label === 'Low';
        if (stockFilter === 'Out') return label === 'Out';
        return true;
      });
    }
    if (sortBy === 'Unit Price') {
      results.sort((a, b) => Number(a.unit_price || 0) - Number(b.unit_price || 0));
    } else if (sortBy === 'Available') {
      results.sort((a, b) => availableQty(a) - availableQty(b));
    } else {
      results.sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || '')));
    }
    return results;
  }, [products, search, category, stockFilter, sortBy]);

  const pagination = usePagination(filtered, {
    resetKey: `${search}|${category}|${stockFilter}|${sortBy}`,
  });
  const paginated = pagination.paginatedData;

  if (loading) return <LoadingState message="Loading inventory…" />;
  if (error && !products.length) {
    return (
      <EmptyState
        title="Unable to load inventory"
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
          <h3>Inventory</h3>
          <p className="list-section-subtitle">Products and stock at your branch — view only. Warehouse handles restock.</p>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search by product name or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search inventory"
            />
            <select
              className="filter-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="All">All Categories</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              aria-label="Filter by stock status"
            >
              <option value="All">All Stock</option>
              <option value="In Stock">In Stock</option>
              <option value="Low">Low</option>
              <option value="Out">Out</option>
            </select>
            <select
              className="filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort inventory"
            >
              <option value="Product Name">Sort: Product Name</option>
              <option value="Unit Price">Sort: Unit Price</option>
              <option value="Available">Sort: Available</option>
            </select>
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Unit Price</th>
                    <th>Available</th>
                    <th>Stock Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((product) => {
                    const qty = availableQty(product);
                    const status = stockStatusLabel(product);
                    return (
                      <tr
                        key={product.product_id}
                        className="clickable-row"
                        onClick={() => navigate(`/sales/inventory/${product.product_id}`)}
                      >
                        <td>
                          <strong>{product.product_name}</strong>
                          {product.sku ? (
                            <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>{product.sku}</span>
                          ) : null}
                        </td>
                        <td>{product.category_name || '—'}</td>
                        <td>{formatCurrency(product.unit_price)}</td>
                        <td style={{ fontWeight: 600 }}>{qty}</td>
                        <td><StatusBadge status={status} /></td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="View"
                            aria-label={`View ${product.product_name}`}
                            onClick={() => navigate(`/sales/inventory/${product.product_id}`)}
                          >
                            <NavIcon name="view" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </>
        ) : (
          <EmptyState
            title={products.length ? 'No matching products' : 'No products for your branch'}
            description={products.length
              ? 'No products for your branch — adjust your filters.'
              : 'Your branch has no active products in the catalog yet.'}
          />
        )}
      </section>
    </div>
  );
}

function ProductDetailsPage({
  productId,
  navigate,
}) {
  const currentUser = getCurrentUser();
  const branchId = currentUser?.branchId ?? currentUser?.branch?.id;
  const [product, setProduct] = useState(null);
  const [branchStock, setBranchStock] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get(`/products/${productId}`);
        if (res.data.success) {
          const data = res.data.data;
          setProduct(data);
          const inv = data?.inventory || [];
          const stock = branchId != null
            ? inv.find((row) => Number(row.branch_id) === Number(branchId))
            : inv[0];
          setBranchStock(stock || null);
          setMovements(Array.isArray(data?.movements) ? data.movements.slice(0, 8) : []);
        } else {
          setProduct(null);
          setBranchStock(null);
          setMovements([]);
        }
      } catch (err) {
        console.error('[SalesInventory] detail load error:', err.message);
        setProduct(null);
        setBranchStock(null);
        setMovements([]);
      }
      setLoading(false);
    }
    load();
  }, [productId, branchId]);

  if (loading) return <LoadingState message="Loading product…" />;
  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        actionLabel="Back to Inventory"
        onAction={() => navigate('/sales/inventory')}
      />
    );
  }

  const qty = Number(branchStock?.available_stock ?? branchStock?.quantity ?? 0) || 0;
  const stockLabel = stockStatusLabel({
    available_stock: qty,
    stock_status: branchStock?.stock_status,
    reorder_level: branchStock?.reorder_level ?? product.reorder_point,
    has_stock_record: Boolean(branchStock),
  });

  return (
    <div className="page">
      <StatsGrid
        stats={[
          { label: 'Current Stock', value: String(qty) },
          { label: 'Unit Price', value: formatCurrency(product.unit_price) },
          { label: 'Stock Status', value: <StatusBadge status={stockLabel} /> },
        ]}
      />

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Product Information</h3>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Product Name', value: product.product_name || product.name || '—' },
            { label: 'Category', value: product.category_name || '—' },
            { label: 'SKU', value: product.sku || '—' },
            { label: 'Unit Price', value: formatCurrency(product.unit_price) },
          ]}
        />
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Branch Inventory</h3>
          <p className="list-section-subtitle">Read-only stock for your assigned branch. Warehouse handles restock.</p>
        </div>
        <DetailRowsTable
          rows={[
            { label: 'Current Stock', value: String(qty) },
            {
              label: 'Reorder Level',
              value: branchStock?.reorder_level != null || product.reorder_point != null
                ? `${branchStock?.reorder_level ?? product.reorder_point} units`
                : '—',
            },
            { label: 'Stock Status', value: <StatusBadge status={stockLabel} /> },
            {
              label: 'Branch Name',
              value: branchStock?.branch_name || currentUser?.branch?.name || getUserAssignedLocation(currentUser),
            },
          ]}
        />
      </section>

      {movements.length ? (
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Recent Stock Movements</h3>
            <p className="muted">Latest movements for this product at your branch.</p>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Movement Type</th>
                  <th>Quantity</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.movement_id || `${movement.movement_date}-${movement.type}-${movement.quantity}`}>
                    <td>{formatDisplayDate(movement.movement_date || movement.created_at)}</td>
                    <td>{movement.type || movement.movement_type || '—'}</td>
                    <td>{movement.quantity ?? '—'}</td>
                    <td>{movement.movement_ref || movement.reference || movement.performed_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/inventory')}>
          Back to Inventory
        </button>
        <button className="button" type="button" onClick={() => navigate('/sales/log-sale')}>
          Log a Sale
        </button>
      </div>
    </div>
  );
}
export function SalesHistoryPage({
  navigate,
  showToast,
  historyBasePath = '/sales/history',
  getInvoiceDetailPath = (invoiceNumber) => `/sales/invoices/${encodeURIComponent(invoiceNumber)}`,
}) {
  const location = useLocation();
  const initialDates = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return {
      from: params.get('start_date') || params.get('dateFrom') || '',
      to: params.get('end_date') || params.get('dateTo') || '',
    };
  }, [location.search]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [invoices, setInvoices] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deviceSales, setDeviceSales] = useState([]);
  const filterResetKey = `${statusFilter}|${dateFrom}|${dateTo}`;
  const serverPager = useServerPagination({
    totalRecords: serverTotal,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  useEffect(() => {
    setDateFrom(initialDates.from);
    setDateTo(initialDates.to);
  }, [initialDates.from, initialDates.to]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const params = {
        page: serverPager.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      };
      if (statusFilter && statusFilter !== 'All') params.status = statusFilter;
      if (dateFrom) params.start_date = dateFrom;
      if (dateTo) params.end_date = dateTo;
      const result = await fetchInvoices(params);
      if (!active) return;
      if (result.success) {
        setInvoices(result.data || []);
        setServerTotal(Number(result.pagination?.total) || (result.data || []).length);
      } else {
        setError(result.message || 'Failed to load sales history.');
      }
      if (active) setDeviceSales(await loadWaiting('sales_invoices'));
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [showToast, statusFilter, dateFrom, dateTo, serverPager.currentPage]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter(item => {
      const customerName = item.customer_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();
      return !query
        || customerName.toLowerCase().includes(query)
        || String(item.invoice_number || '').toLowerCase().includes(query);
    });
  }, [search, invoices]);
  const clientPager = usePagination(filtered, { pageSize: DEFAULT_PAGE_SIZE, resetKey: search });
  const useClientSlice = Boolean(search.trim());
  const pager = useClientSlice ? clientPager : serverPager;
  const rows = useClientSlice ? clientPager.paginatedData : invoices;

  if (loading) return <LoadingState message="Loading sales history..." />;
  if (error && !invoices.length) {
    return <div className="page">
      <DeviceQueue rows={deviceSales} />
      <EmptyState title="Unable to load sales history" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />
    </div>;
  }
  return <div className="page">
      <DeviceQueue rows={deviceSales} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Sales Transactions</h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search by customer or invoice number"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search sales history"
            />
            <select
              className="filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              {['All', 'Confirmed', 'Pending Review', 'Draft', 'Cancelled'].map(o => (
                <option key={o} value={o}>{o === 'All' ? 'All Statuses' : o}</option>
              ))}
            </select>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
        {rows.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Invoice Number</th><th>Customer Name</th><th>Total Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map(item => <tr key={item.invoice_number || item.sales_invoices_id} className="clickable-row" onClick={() => navigate(getInvoiceDetailPath(item.invoice_number))}>
                    <td>{item.invoice_number}</td>
                    <td>{item.customer_name || item.first_name + ' ' + item.last_name}</td>
                    <td>{formatCurrency(item.total_amount)}</td>
                    <td>{formatDisplayDate(item.invoices_date)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(getInvoiceDetailPath(item.invoice_number))}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pager} />
        </> : <EmptyState title="No sales records found" description="Adjust your search or filters." />}
      </section>
    </div>;
}
function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function NotificationsPage({
  navigate,
  showToast
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const load = async () => {
    setLoading(true);
    const res = await fetchNotifications();
    if (res.success) {
      setNotifications((res.data || []).map(row => mapNotificationRow(row, { opsBase: '/sales', orgBase: '/sales' })));
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter(n => !n.read);
    if (filter === 'Read') return notifications.filter(n => n.read);
    if (filter === 'Stock') return notifications.filter(n => (n.category || '').toLowerCase().includes('stock'));
    if (filter === 'Schedule') return notifications.filter(n => (n.category || '').toLowerCase().includes('schedule'));
    if (filter === 'Sales') return notifications.filter(n => (n.category || '').toLowerCase().includes('sales'));
    if (filter === 'Assignments') return notifications.filter(n => (n.category || '').toLowerCase().includes('assign'));
    if (filter === 'CI') return notifications.filter(n => (n.category || '').toLowerCase().includes('ci'));
    return notifications;
  }, [notifications, filter]);
  if (loading && !notifications.length) return <LoadingState message="Loading notifications..." />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="notifications-toolbar">
          <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
            {['All', 'Unread', 'Read', 'Stock', 'Schedule', 'Sales', 'Assignments', 'CI'].map(item => (
              <button
                key={item}
                className={filter === item ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            className="button secondary whitespace-nowrap"
            type="button"
            onClick={async () => {
              const res = await markAllNotificationsRead();
              if (res.success) {
                showToast('All notifications marked as read.', 'success');
                load();
              }
            }}
          >
            Mark All as Read
          </button>
        </div>
      </section>
      {filtered.length ? <div className="notification-list">
          {filtered.map(item => <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="muted">{item.message}</p><span className="notification-time">{formatDisplayDateTime(item.time)}</span></div>
              <div className="notification-actions">
                {!item.read ? <button className="button ghost" type="button" onClick={async () => {
            const res = await markNotificationRead(item.id);
            if (res.success) load();
          }}>Mark as Read</button> : null}
                {item.relatedTo ? <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>Open Related Record</button> : null}
              </div>
            </article>)}
        </div> : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>;
}
function ProfilePage({
  navigate,
  showToast
}) {
  return <>
      <OfflineBanner />
      <AccountProfilePanel
        showToast={showToast}
        title="Sales profile"
        subtitle="Your name, contact details, and sign-in for this CORVEX account."
        extraActions={<button className="button ghost" type="button" onClick={() => navigate('/sales/audit-log')}>Audit log</button>}
        settings={<SettingsPage embedded showToast={showToast} />}
      />
    </>;
}
function RouteTrackingPage({
  navigate
}) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const res = await fetchFieldVisits({ scheduled_date: today, status: 'All' });
      if (res.success) setVisits(res.data || []);
      setLoading(false);
    }
    load();
  }, []);
  const withCoords = visits.filter(v => v.latitude && v.longitude);
  const completed = visits.filter(v => v.status === 'Completed');
  const mapCenter = withCoords.length
    ? [Number(withCoords[0].latitude), Number(withCoords[0].longitude)]
    : [7.0731, 125.6128];
  const markers = withCoords.map(v => ({
    id: v.visit_id,
    position: [Number(v.latitude), Number(v.longitude)],
    label: String(v.visit_id),
    color: v.status === 'Completed' ? '#1A4162' : '#f59e0b',
    popup: `${v.customer_name} — ${v.status}`,
  }));
  const polyline = markers.length >= 2
    ? [{ id: 'route', positions: markers.map(m => m.position), color: '#0B1E30' }]
    : [];
  const coverage = visits.length ? Math.round((completed.length / visits.length) * 100) : 0;
  if (loading) return <LoadingState message="Loading route..." />;
  return <div className="page">
      <StatsGrid stats={[{
      label: 'GPS Pins',
      value: String(withCoords.length)
    }, {
      label: 'Territory Coverage',
      value: `${coverage}%`
    }, {
      label: 'Visits Verified',
      value: `${completed.length}/${visits.length}`
    }]} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Territory Coverage Map</h3></div>
        <div style={{
        marginTop: 16
      }}>
          <LeafletMap center={mapCenter} zoom={13} height={500} polylines={isSalesGpsEnabled() ? polyline : []} markers={markers} />
        </div>
        <p className="muted">{isSalesGpsEnabled() ? 'Today’s sales visits with customer coordinates on file.' : 'GPS route line is off. Turn it on in Settings to draw the path between visits.'}</p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Visit Verification</h3></div>
        {completed.length ? (
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {completed.map(v => (
                  <tr key={v.visit_id}>
                    <td><strong>{v.customer_name}</strong></td>
                    <td>{formatDisplayDate(v.scheduled_date)}</td>
                    <td><StatusBadge status="Verified" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No completed visits" description="No completed visits yet today." />
        )}
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/dashboard')}>Back to Dashboard</button>
      </div>
    </div>;
}
function AuditLogPage({
  navigate
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchSalesAuditLogs({ limit: 200 });
      if (res.success) setLogs(res.data || []);
      setLoading(false);
    }
    load();
  }, []);
  return <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3><p className="muted">Your recent actions in CORVEX.</p></div>
        {loading ? <LoadingState message="Loading audit log..." /> : <div className="table-shell">
          <table className="corvex-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>
              {logs.length ? logs.map(log => <tr key={log.audit_id}><td>{log.action}</td><td>{log.detail || log.status_details || '—'}</td><td>{formatDisplayDateTime(log.created_at)}</td></tr>)
                : <tr><td colSpan={3}><EmptyState title="No audit entries" /></td></tr>}
            </tbody>
          </table>
        </div>}
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/profile')}>Back to Profile</button>
      </div>
    </div>;
}
function SettingsPage({
  showToast,
  embedded = false,
}) {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refreshPending = async () => {
    try {
      const rows = await listOfflineRecords();
      setPendingCount(rows.filter((row) => (
        (row.tableName === 'field_activity_reports' || row.tableName === 'sales_invoices')
        && row.status !== 'Synced'
      )).length);
    } catch {
      setPendingCount(0);
    }
  };
  useEffect(() => {
    refreshPending();
  }, []);
  const syncNow = async () => {
    setSyncing(true);
    const result = await flushOfflineQueue({ manual: true });
    await refreshPending();
    setSyncing(false);
    if (result.skipped && result.reason === 'offline') {
      showToast('You are offline. Reports stay on this device.', 'error');
      return;
    }
    if (result.skipped && result.reason === 'signed-out') {
      showToast('Sign in again to sync reports.', 'error');
      return;
    }
    const synced = (result.results || []).filter((row) => row.syncStatus === 'Synced').length;
    const failed = (result.results || []).filter((row) => row.syncStatus === 'Failed').length;
    if (!synced && !failed) {
      showToast('No field reports are waiting on this device.', 'success');
      return;
    }
    showToast(
      failed ? `${synced} synced. ${failed} still need attention.` : `${synced} field report${synced === 1 ? '' : 's'} synced.`,
      failed ? 'error' : 'success'
    );
  };
  return (
    <UserSettingsPanel embedded={embedded} role="sales" showToast={showToast}>
      <p className="muted">{pendingCount} record{pendingCount === 1 ? '' : 's'} waiting on this device.</p>
      <div className="settings-link-row">
        <button className="button" type="button" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
    </UserSettingsPanel>
  );
}
export function SalesPageBody({
  page,
  navigate,
  showToast
}) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = {
    assignmentId: page.params?.assignmentId,
    reportId: page.params?.reportId,
    ciId: page.params?.ciId,
    customerId: page.params?.customerId,
    visitId: page.params?.visitId,
    productId: page.params?.productId,
    invoiceId: page.params?.invoiceId,
    parentContext: page.parentContext,
    navigate,
    showToast
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...props} />;
    case 'settings':
      return <SettingsPage {...props} />;
    case 'scheduleList':
    case 'scheduleMap':
      return <SchedulePage pageType={page.pageType} {...props} />;
    case 'areaAssignmentDetail':
      return <AreaAssignmentDetailPage {...props} />;
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...props} />;
    case 'fieldActivityReportDetail':
      return <FieldActivityReportDetailPage {...props} />;
    case 'customers':
      return <CustomersPage {...props} />;
    case 'customerForm':
    case 'customerEdit':
      return <CustomerFormPage {...props} />;
    case 'clients':
      return <CustomersPage {...props} />;
    case 'customerDetail':
      return <CustomerDetailPage {...props} />;
    case 'clientDetail':
      return <CustomerDetailPage {...props} />;
    case 'visitLog':
      return <VisitLogPage {...props} />;
    case 'logSale':
      return <LogSalePage {...props} />;
    case 'ciSubmissions':
      return <SalesCreditReviewsPage {...props} />;
    case 'ciSubmissionDetail':
      return <SalesCreditReviewDetailPage {...props} />;
    case 'ciForm':
      return <SalesCreditReviewRequestPage {...props} />;
    case 'inventory':
      return <InventoryPage {...props} />;
    case 'productDetails':
      return <ProductDetailsPage {...props} />;
    case 'history':
      return <SalesHistoryPage {...props} />;
    case 'invoiceDetails':
      return <InvoiceDetailsPage {...props} historyBasePath="/sales/history" />;
    case 'saleDetails':
      return <InvoiceDetailsPage {...props} historyBasePath="/sales/history" />;
    case 'notifications':
      return <NotificationsPage {...props} />;
    case 'profile':
      return <ProfilePage {...props} />;
    case 'routeTracking':
      return <RouteTrackingPage {...props} />;
    case 'auditLog':
      return <AuditLogPage {...props} />;
    case 'creditHistory':
      return (
        <CreditHistoryListPage
          navigate={navigate}
          showToast={showToast}
          basePath="/sales/credit-history"
          customerBasePath="/sales/customer-detail"
          variant="sales"
        />
      );
    case 'creditDetail':
      return (
        <CreditHistoryDetailPage
          creditId={page.params?.creditId}
          navigate={navigate}
          showToast={showToast}
          basePath="/sales/credit-history"
          customerBasePath="/sales/customer-detail"
          variant="sales"
        />
      );
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}