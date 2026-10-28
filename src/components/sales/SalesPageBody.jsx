import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination, useServerPagination, DEFAULT_PAGE_SIZE } from '../../hooks/usePagination';
import { ChartDrilldownModal } from '../shared/ChartDrilldownModal.jsx';
import { useChartDrilldown } from '../../hooks/useChartDrilldown.js';
import { formatCurrency as formatMoney } from '../../utils/formatters.js';
import {
  createCustomer,
  createSalesInvoice,
  fetchCustomerById,
  fetchCustomers,
  fetchFieldVisits,
  fetchFieldVisitById,
  fetchInvoices,
  fetchPaymentMethods,
  fetchSalesAuditLogs,
  fetchSalesDashboard,
  fetchSalesCreditInvestigationById,
  fetchSalesCreditInvestigations,
  fetchSalesPurchaseRequestById,
  fetchTerritories,
  fetchSalesFieldReports,
  submitSalesFieldReport,
  submitSalesCreditInvestigation,
  updateFieldVisit,
} from '../../api/salesService';
import { lookupCustomersForDuplicate, resendCustomerPortalInvitation } from '../../api/customerPortalService';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, mapNotificationRow } from '../../api/notificationService.js';
import { mapCreditInvestigationRow } from '../../api/approvalsService.js';
import { getCurrentUser } from '../../api/authService.js';
import { isBrowserOnline } from '../../offline/connection.js';
import { listOfflineRecords, saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { flushOfflineQueue } from '../../offline/flushQueue.js';
import { isSalesAutoSyncEnabled, isSalesOfflineEnabled } from '../../offline/prefs.js';
import { isSalesGpsEnabled } from '../../settings/preferences.js';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { SalesPurchaseRequestsPage, SalesPurchaseReviewPage } from './SalesPurchaseRequests';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import apiClient from '../../api/apiClient.js';
import { CONTACT_RELATIONSHIP_OPTIONS, formatContactPersonName, formatCustomerDisplayId, formatCustomerFullName, formatMiddleNameDisplay, formatPurchaseVolumeUnits, formatSecondaryContactName } from '../../utils/customerDisplay';
import { downloadPdf } from '../../utils/dataExport';
import { openExternalNavigation } from '../../utils/mapsNavigation';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../data/salesMockData';
import { InvoiceDetailsPage } from './InvoiceDetailsPage';
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
function handleCustomerNavigate(customer, showToast) {
  const ok = openExternalNavigation({
    latitude: customer.latitude,
    longitude: customer.longitude,
    address: customer.address,
  });
  if (!ok && showToast) showToast('Add an address or coordinates to open navigation.', 'error');
}
function DashboardPage({
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const today = formatDisplayDate(new Date());
  const { drilldown, closeDrilldown, openApiDrilldown } = useChartDrilldown({ showToast });
  const [dashboard, setDashboard] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [dashRes, notifRes] = await Promise.all([fetchSalesDashboard(), fetchNotifications()]);
      if (dashRes.success) setDashboard(dashRes.data);
      if (notifRes.success) {
        const rows = notifRes.data || [];
        setUnreadCount(rows.filter(n => n.status !== 'Read').length);
      }
      setLoading(false);
    }
    load();
  }, []);
  const summary = dashboard?.summary || {};
  const analytics = dashboard?.analytics || {};
  const agentName = currentUser?.fullName || 'Sales Agent';
  if (loading) return <LoadingState message="Loading dashboard..." />;
  return <div className="page">
      <OfflineBanner />

      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Good morning</p>
          <h2>{agentName}</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/sales/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[{
      label: 'Accounts to Visit Today',
      value: String(summary.accountsToVisit ?? 0)
    }, {
      label: 'Sales Commitments Logged',
      value: String(summary.salesLogged ?? 0)
    }, {
      label: 'Completed Visits',
      value: String(summary.completedVisits ?? 0)
    }, {
      label: 'Pending CIs',
      value: String(summary.creditInvestigationsPending ?? 0)
    }]} />

      {(dashboard?.lowStockItems || []).length ? <section className="panel content-panel alert-panel">
          <div className="panel-section-header">
            <h3>Low Stock Alerts</h3>
          </div>
          <ul className="widget-list">
            {(dashboard?.lowStockItems || []).map(item => <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted">{item.sku} · {item.branch}</span>
                </div>
                <span className="muted">{item.stock} units · <StatusBadge status={item.status} /></span>
              </li>)}
          </ul>
        </section> : null}

      <div className="dashboard-widgets grid two-up">
        <div className="stack" style={{ gap: 12 }}>
          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Revenue by Period</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Click a bar to open matching invoices</p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[
                  { period: 'Today', amount: Number(analytics.dailyRevenue || 0), key: 'daily' },
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
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Today: {formatCurrency(analytics.dailyRevenue || 0)} · Weekly: {formatCurrency(analytics.weeklyRevenue || 0)} · Monthly: {formatCurrency(analytics.monthlyRevenue || 0)}
            </p>
          </section>
          <section className="panel content-panel">
            <div className="panel-section-header"><h3>Recent Sales</h3></div>
            <ul className="widget-list">
              {(dashboard?.recentSales || []).slice(0, 3).map(sale => <li key={sale.id}>
                  <div><strong>{sale.customerName}</strong><span className="muted">{formatDisplayDate(sale.date)}</span></div>
                  <span>{formatCurrency(sale.totalAmount)}</span>
                </li>)}
            </ul>
          </section>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <section className="panel content-panel visit-progress-panel">
            <div className="panel-section-header"><h3>Visit Completion Progress</h3></div>
            <div className="progress-bar" role="progressbar" aria-valuenow={summary.visitProgress || 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${summary.visitProgress || 0}%` }} />
            </div>
            <p className="muted progress-caption">{summary.completedVisits ?? 0} of {summary.accountsToVisit ?? 0} visits completed</p>
          </section>
          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Top Selling Products</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Last 30 days · click a bar</p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
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
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="units" name="Units" fill="#408DAD" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Sales Analytics</h3>
          <button className="button ghost" type="button" onClick={() => navigate('/sales/route-tracking')}>Route Tracking</button>
        </div>
        <h4 className="subsection-title">Top Customers</h4>
        <p className="muted" style={{ marginTop: 0 }}>Last 90 days · click a bar for invoices</p>
        <ResponsiveContainer width="100%" height={240}>
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
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="revenue" name="Revenue" fill="#1A4162" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}
function haversine(a, b) {
  const toRad = v => v * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]);
  const la2 = toRad(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const SCHEDULE_STATUS_OPTIONS = ['All', 'Pending', 'Completed'];

function getVisitCustomerName(visit) {
  return visit?.customer_name || `${visit?.first_name || ''} ${visit?.last_name || ''}`.trim() || '';
}

function SchedulePage({
  pageType,
  navigate,
  showToast
}) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [agentFilter, setAgentFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMap, setShowMap] = useState(pageType === 'scheduleMap');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchFieldVisits();
      if (result.success) {
        setVisits(result.data || []);
      } else {
        setError(result.message || 'Failed to load field visits.');
        if (showToast) showToast(result.message || 'Failed to load field visits', 'error');
      }
      setLoading(false);
    }
    load();
  }, [showToast]);

  const agentOptions = useMemo(() => {
    const names = [...new Set(visits.map((v) => v.agent_name).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [visits]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visits.filter((v) => {
      const customerName = getVisitCustomerName(v);
      const customerNameLower = customerName.toLowerCase();
      const agentName = String(v.agent_name || '').toLowerCase();
      const visitType = String(v.visit_type || '').toLowerCase();
      const visitId = String(v.visit_id || '');
      const matchesSearch = !query
        || customerNameLower.includes(query)
        || agentName.includes(query)
        || visitType.includes(query)
        || visitId.includes(query);
      const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
      const matchesAgent = agentFilter === 'All' || v.agent_name === agentFilter;
      const scheduled = String(v.scheduled_date || '');
      const matchesFrom = !dateFrom || scheduled >= dateFrom;
      const matchesTo = !dateTo || scheduled <= dateTo;
      return matchesSearch && matchesStatus && matchesAgent && matchesFrom && matchesTo;
    });
  }, [visits, search, statusFilter, agentFilter, dateFrom, dateTo]);

  const filterResetKey = `${search}|${statusFilter}|${agentFilter}|${dateFrom}|${dateTo}`;
  const pagination = usePagination(filtered, { resetKey: filterResetKey });
  const rows = pagination.paginatedData;

  const clearScheduleFilters = () => {
    setSearch('');
    setStatusFilter('All');
    setAgentFilter('All');
    setDateFrom('');
    setDateTo('');
  };

  const completed = visits.filter((v) => v.status === 'Completed').length;
  const coordVisits = visits.filter((v) => Number(v.latitude) && Number(v.longitude));
  const mapCenter = coordVisits.length
    ? [
      coordVisits.reduce((s, v) => s + Number(v.latitude), 0) / coordVisits.length,
      coordVisits.reduce((s, v) => s + Number(v.longitude), 0) / coordVisits.length,
    ]
    : [7.1907, 125.4553];
  const totalDistance = useMemo(() => {
    const sorted = [...coordVisits].sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0));
    let sum = 0;
    for (let i = 1; i < sorted.length; i++) {
      sum += haversine(
        [Number(sorted[i - 1].latitude), Number(sorted[i - 1].longitude)],
        [Number(sorted[i].latitude), Number(sorted[i].longitude)]
      );
    }
    return sum;
  }, [coordVisits]);
  const visitColor = (v) => (v.status === 'Completed' ? '#1A4162' : v.status === 'Pending' ? '#0B1E30' : '#f59e0b');
  const mapMarkers = filtered.filter((v) => Number(v.latitude) && Number(v.longitude)).map((v) => ({
    id: v.visit_id,
    position: [Number(v.latitude), Number(v.longitude)],
    label: String(v.visit_id),
    color: visitColor(v),
    popup: `<strong>Visit #${v.visit_id}</strong> · ${v.visit_type || '—'}<br/>${getVisitCustomerName(v) || '—'}<br/>${v.agent_name || '—'} · ${v.status}`,
  }));

  const scheduleFiltersToolbar = (
    <div className="list-section-toolbar">
      <div className="list-section-controls">
        <input
          className="filter-input search"
          type="search"
          placeholder="Search by visit ID, customer, agent, or type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search schedule"
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          {SCHEDULE_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option === 'All' ? 'All Statuses' : option}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          aria-label="Filter by assigned staff"
        >
          <option value="All">All Staff</option>
          {agentOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          className="filter-input"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Schedule from date"
        />
        <input
          className="filter-input"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Schedule to date"
        />
      </div>
    </div>
  );

  const scheduleEmptyState = (
    <EmptyState
      title="No visits match these filters"
      description="Try adjusting search, status, staff, or date range."
      actionLabel="Clear filters"
      onAction={clearScheduleFilters}
    />
  );

  if (loading) return <LoadingState message="Loading schedule..." />;
  if (error && !visits.length) {
    return <EmptyState title="Unable to load schedule" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />;
  }
  if (!loading && !error && visits.length === 0) {
    return <EmptyState title="No scheduled visits" description="You have no field visits assigned. New schedule items will appear here." actionLabel="Refresh" onAction={() => window.location.reload()} />;
  }
  if (pageType === 'scheduleMap' || showMap) {
    return <div className="page">
        <StatsGrid stats={[{
        label: 'Visits Scheduled',
        value: String(visits.length)
      }, {
        label: 'Distance Covered',
        value: totalDistance ? `${totalDistance.toFixed(1)} km` : '—'
      }, {
        label: 'Completed',
        value: String(completed)
      }]} />
        <section className="panel content-panel">
          <div className="list-section-header">
            <h3>Territory Map</h3>
            <div className="list-section-actions">
              <button className="button secondary" type="button" onClick={() => setShowMap(false)}>Show List View</button>
            </div>
          </div>
          {scheduleFiltersToolbar}
          <div style={{ marginTop: 16 }}>
            <LeafletMap center={mapCenter} zoom={13} height={500} markers={mapMarkers} polylines={isSalesGpsEnabled() && totalDistance ? [{
            id: 'route',
            positions: [...coordVisits].sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)).map(v => [Number(v.latitude), Number(v.longitude)]),
            color: '#0B1E30'
          }] : []} />
          </div>
          <p className="muted">Visits mapped: {filtered.length}{isSalesGpsEnabled() && totalDistance ? ` · Route distance: ${totalDistance.toFixed(1)} km` : ''}{isSalesGpsEnabled() ? '' : ' GPS route line is off. Turn it on in Settings.'}</p>
          {filtered.length ? <>
            <div className="panel-section-header"><h3>Visit List</h3></div>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Visit ID</th>
                    <th>Customer</th>
                    <th>Visit Type</th>
                    <th>Scheduled</th>
                    <th>Status</th>
                    <th>Agent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(v => <tr key={v.visit_id} className="clickable-row" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                      <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{v.visit_id}</span></td>
                      <td>{getVisitCustomerName(v) || '—'}</td>
                      <td>{v.visit_type || '—'}</td>
                      <td>{v.scheduled_date ? formatDisplayDate(v.scheduled_date) : '—'}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td>{v.agent_name || '—'}</td>
                      <td className="table-actions" onClick={e => e.stopPropagation()}>
                        <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                          <NavIcon name="view" />
                        </button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} />
          </> : scheduleEmptyState}
        </section>
      </div>;
  }
  return <div className="page">
      <StatsGrid stats={[{
      label: 'Visits Scheduled',
      value: String(visits.length)
    }, {
      label: 'Distance Covered',
      value: totalDistance ? `${totalDistance.toFixed(1)} km` : '—'
    }, {
      label: 'Completed',
      value: String(completed)
    }]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Today&apos;s Schedule <span className="text-ink/70">({filtered.length})</span></h3>
        </div>
        {scheduleFiltersToolbar}
        {filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Visit ID</th>
                  <th>Visit Type</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Agent</th>
                  <th>Created At</th>
                  <th>Updated At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(v => <tr key={v.visit_id} className="clickable-row" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                    <td><span style={{
                  fontFamily: 'monospace',
                  fontSize: '0.82rem'
                }}>{v.visit_id}</span></td>
                    <td>{v.visit_type || '—'}</td>
                    <td>{v.scheduled_date ? formatDisplayDate(v.scheduled_date) : '—'}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td>{getVisitCustomerName(v) || '—'}</td>
                    <td>{v.agent_name || '—'}</td>
                    <td>{formatDisplayDateTime(v.created_at)}</td>
                    <td>{formatDisplayDateTime(v.updated_at)}</td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/visit-log/${v.visit_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : scheduleEmptyState}
      </section>
    </div>;
}
function resolvePurchaseVolumeUnits(customer) {
  return Number(customer?.purchaseVolumeUnits ?? customer?.purchasevolumeunits ?? 0);
}
function CustomersPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active Customers');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);
  const [customersData, setCustomersData] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const filterResetKey = `${search}|${filter}`;
  const pagination = useServerPagination({
    totalRecords,
    pageSize: DEFAULT_PAGE_SIZE,
    resetKey: filterResetKey,
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const params = {
        page: pagination.currentPage,
        limit: DEFAULT_PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (filter === 'Active Customers') params.status = 'Active';
      else if (filter === 'Inactive Customers') params.status = 'Inactive';
      const res = await fetchCustomers(params);
      if (!active) return;
      if (res.success) {
        const rows = [...(res.data || [])];
        if (sortBy === 'Name') {
          rows.sort((a, b) => (`${a.first_name} ${a.last_name}`).localeCompare(`${b.first_name} ${b.last_name}`));
        }
        setCustomersData(rows);
        setTotalRecords(Number(res.pagination?.total) || rows.length);
      } else {
        setCustomersData([]);
        setTotalRecords(0);
        if (showToast) showToast(res.message || 'Failed to load customers.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [pagination.currentPage, search, filter, sortBy, showToast]);

  const rows = customersData;
  if (loading) return <LoadingState message="Loading customers..." />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Customer List <span className="text-ink/70">({totalRecords})</span></h3>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by ID, name, territory, or contact" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
              {['Active Customers', 'Inactive Customers', 'All Customers'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {['Name'].map(o => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
            <button className="button" type="button" onClick={() => navigate('/sales/customers/new')}>Add Customer</button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const exportRows = rows.map((c) => ({
                  customer_id: formatCustomerDisplayId(c),
                  name: formatCustomerFullName(c),
                  territory: c.territory_name || '',
                  phone: c.contact_phone || '',
                  status: c.status || '',
                  address: c.address || '',
                }));
                if (downloadPdf(exportRows, { filename: 'sales-customers.pdf', title: 'Sales Customers' })) showToast('Customer list exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
          </div>
        </div>
        {totalRecords ? <>
          <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Customer Name</th>
                    <th>Territory</th>
                    <th>Primary Contact</th>
                    <th>Secondary Contact</th>
                    <th>Relationship</th>
                    <th>Purchase Volume</th>
                    <th>Activity Updated</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(customer => {
              const primaryName = formatContactPersonName(customer);
              const secondaryName = formatSecondaryContactName(customer) || '—';
              const activityUpdated = customer.activityUpdatedAt || customer.activityupdatedat || customer.activity?.updated_at;
              return <tr key={customer.customer_id} className="clickable-row" onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=customers`)}>
                        <td><span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.82rem'
                  }}>{formatCustomerDisplayId(customer)}</span></td>
                        <td>{formatCustomerFullName(customer)}</td>
                        <td>{customer.territory_name || '—'}</td>
                        <td>{primaryName}</td>
                        <td>{secondaryName}</td>
                        <td>{customer.secondary_contact_relationship || '—'}</td>
                        <td>{formatPurchaseVolumeUnits(resolvePurchaseVolumeUnits(customer))}</td>
                        <td>{activityUpdated ? formatDisplayDateTime(activityUpdated) : '—'}</td>
                        <td><StatusBadge status={customer.status} /></td>
                        <td className="table-actions" onClick={e => e.stopPropagation()}>
                          <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}?from=customers`)}>
                            <NavIcon name="view" />
                          </button>
                          <button className="icon-action-button" type="button" title="Open Map" onClick={() => handleCustomerNavigate(customer, showToast)}>
                            <NavIcon name="map" />
                          </button>
                        </td>
                      </tr>;
            })}
                </tbody>
              </table>
            </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No customers found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => {
      setSearch('');
      setFilter('Active Customers');
    }} />}
      </section>
    </div>;
}
function CustomerFormPage({
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    address: '',
    latitude: '',
    longitude: '',
    contact_phone: '',
    contact_person_fname: '',
    contact_person_mname: '',
    contact_person_lname: '',
    contact_person_phone: '',
    secondary_contact_fname: '',
    secondary_contact_lname: '',
    secondary_contact_phone: '',
    secondary_contact_relationship: '',
    territory_id: '',
    status: 'Active',
    create_portal_account: true,
    portal_email: '',
  });
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchTerritories();
      if (res.success) setTerritories(res.data || []);
      setLoading(false);
    }
    load();
  }, []);
  useEffect(() => {
    const phone = form.contact_phone.trim();
    const email = form.portal_email.trim();
    if (!phone && !email) {
      setDuplicateMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await lookupCustomersForDuplicate({
        contact_phone: phone || undefined,
        portal_email: email || undefined,
      });
      setDuplicateMatches(res.success ? res.data || [] : []);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.contact_phone, form.portal_email]);
  const updateField = (name, value) => {
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
    setErrors(prev => ({
      ...prev,
      [name]: undefined
    }));
  };
  const handleSubmit = async () => {
    const nextErrors = {};
    const required = ['first_name', 'last_name', 'address', 'contact_phone', 'contact_person_fname', 'contact_person_lname', 'contact_person_phone'];
    required.forEach(field => {
      if (!String(form[field] || '').trim()) nextErrors[field] = 'Required';
    });
    const primaryKey = `${form.contact_person_fname}|${form.contact_person_phone}`.toLowerCase();
    const secondaryKey = `${form.secondary_contact_fname}|${form.secondary_contact_phone}`.toLowerCase();
    if (form.secondary_contact_fname && form.secondary_contact_phone && primaryKey === secondaryKey) {
      nextErrors.secondary_contact_phone = 'Secondary contact must be different from the primary contact.';
    }
    if (form.create_portal_account && !form.portal_email.trim()) {
      nextErrors.portal_email = 'Portal email is required when creating a customer login.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please complete all required fields.', 'error');
      return;
    }
    if (duplicateMatches.length) {
      showToast('Possible duplicate customer found. Review matches before saving.', 'error');
      return;
    }
    setSubmitting(true);
    const result = await createCustomer({
      ...form,
      middle_name: form.middle_name.trim() || null,
      contact_person_mname: form.contact_person_mname.trim() || null,
      secondary_contact_fname: form.secondary_contact_fname.trim() || null,
      secondary_contact_lname: form.secondary_contact_lname.trim() || null,
      secondary_contact_phone: form.secondary_contact_phone.trim() || null,
      secondary_contact_relationship: form.secondary_contact_relationship.trim() || null,
      territory_id: form.territory_id ? Number(form.territory_id) : undefined,
      latitude: form.latitude !== '' ? Number(form.latitude) : undefined,
      longitude: form.longitude !== '' ? Number(form.longitude) : undefined,
      branch_id: currentUser?.branchId ?? undefined,
      account_manager_id: currentUser?.id ?? undefined,
      create_portal_account: Boolean(form.create_portal_account),
      portal_email: form.portal_email.trim() || undefined,
    });
    setSubmitting(false);
    if (!result.success || !result.data) {
      showToast(result.message || 'Failed to create customer.', 'error');
      return;
    }
    const portal = result.portal;
    if (portal?.emailSent === false && portal?.email) {
      showToast(
        result.message || `Customer saved but email was not delivered to ${portal.email}. Use Resend Invitation on the customer page.`,
        'error'
      );
    } else {
      showToast(result.message || 'Customer created successfully.', 'success');
    }
    navigate(`/sales/customer-detail/${result.data.customer_id}?from=customers`, {
      state: portal?.emailSent === false && portal?.activationUrl
        ? { portalActivationUrl: portal.activationUrl, portalEmail: portal.email }
        : undefined,
    });
  };
  if (loading) return <LoadingState message="Loading customer form..." />;
  return <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Add Customer</h3>
          <p className="muted">Register a customer for your branch. Search runs automatically on phone or portal email to help prevent duplicates.</p>
        </div>
        {duplicateMatches.length ? (
          <section className="panel content-panel" style={{ borderColor: '#fcd34d', background: 'rgba(245,158,11,0.06)', marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>Possible existing customers</h4>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer Code</th>
                    <th>Name</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicateMatches.map((match) => (
                    <tr key={match.customer_id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{match.customer_code || match.customer_id}</span></td>
                      <td>{match.first_name} {match.last_name}</td>
                      <td>{match.contact_phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="cust-first">First Name *</label>
            <input id="cust-first" value={form.first_name} onChange={e => updateField('first_name', e.target.value)} />
            {errors.first_name ? <p className="form-error">{errors.first_name}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="cust-middle">Middle Name</label>
            <input id="cust-middle" value={form.middle_name} onChange={e => updateField('middle_name', e.target.value)} placeholder="Middle name (optional)" />
          </div>
          <div className="form-group">
            <label htmlFor="cust-last">Last Name *</label>
            <input id="cust-last" value={form.last_name} onChange={e => updateField('last_name', e.target.value)} />
            {errors.last_name ? <p className="form-error">{errors.last_name}</p> : null}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="cust-address">Address *</label>
          <input id="cust-address" value={form.address} onChange={e => updateField('address', e.target.value)} />
          {errors.address ? <p className="form-error">{errors.address}</p> : null}
        </div>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="cust-lat">Latitude</label>
            <input id="cust-lat" type="number" step="any" value={form.latitude} onChange={e => updateField('latitude', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="cust-lng">Longitude</label>
            <input id="cust-lng" type="number" step="any" value={form.longitude} onChange={e => updateField('longitude', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="cust-phone">Business Phone *</label>
          <input id="cust-phone" value={form.contact_phone} onChange={e => updateField('contact_phone', e.target.value)} />
          {errors.contact_phone ? <p className="form-error">{errors.contact_phone}</p> : null}
        </div>
        <div className="form-group">
          <label htmlFor="cust-territory">Territory</label>
          <select id="cust-territory" className="filter-select" value={form.territory_id} onChange={e => updateField('territory_id', e.target.value)}>
            <option value="">Select territory</option>
            {territories.map(t => <option key={t.territory_id} value={t.territory_id}>{t.territory_name}</option>)}
          </select>
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Primary Contact Person</h3></div>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="pc-fname">First Name *</label>
            <input id="pc-fname" value={form.contact_person_fname} onChange={e => updateField('contact_person_fname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="pc-mname">Middle Name</label>
            <input id="pc-mname" value={form.contact_person_mname} onChange={e => updateField('contact_person_mname', e.target.value)} placeholder="Middle name (optional)" />
          </div>
          <div className="form-group">
            <label htmlFor="pc-lname">Last Name *</label>
            <input id="pc-lname" value={form.contact_person_lname} onChange={e => updateField('contact_person_lname', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="pc-phone">Phone *</label>
          <input id="pc-phone" value={form.contact_person_phone} onChange={e => updateField('contact_person_phone', e.target.value)} />
        </div>
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Customer Portal Access</h3>
          <p className="muted">When you save, Corvex sends an official activation email to the customer&apos;s inbox (e.g. Gmail). They set their own password from that link (expires in 24 hours by default).</p>
        </div>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={form.create_portal_account}
            onChange={(e) => updateField('create_portal_account', e.target.checked)}
          />
          Create customer portal account (send invitation)
        </label>
        {form.create_portal_account ? (
          <div className="form-group" style={{ marginTop: 12 }}>
            <label htmlFor="portal-email">Customer portal email *</label>
            <input
              id="portal-email"
              type="email"
              value={form.portal_email}
              onChange={(e) => updateField('portal_email', e.target.value)}
              placeholder="customer@business.com"
            />
            {errors.portal_email ? <p className="form-error">{errors.portal_email}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Secondary Contact Person</h3>
          <p className="muted">Optional backup contact — must not be the same person as the primary contact.</p>
        </div>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="sc-fname">First Name</label>
            <input id="sc-fname" value={form.secondary_contact_fname} onChange={e => updateField('secondary_contact_fname', e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="sc-lname">Last Name</label>
            <input id="sc-lname" value={form.secondary_contact_lname} onChange={e => updateField('secondary_contact_lname', e.target.value)} />
          </div>
        </div>
        <div className="account-detail-grid two-up">
          <div className="form-group">
            <label htmlFor="sc-phone">Phone</label>
            <input id="sc-phone" value={form.secondary_contact_phone} onChange={e => updateField('secondary_contact_phone', e.target.value)} />
            {errors.secondary_contact_phone ? <p className="form-error">{errors.secondary_contact_phone}</p> : null}
          </div>
          <div className="form-group">
            <label htmlFor="sc-rel">Relationship</label>
            <select id="sc-rel" className="filter-select" value={form.secondary_contact_relationship} onChange={e => updateField('secondary_contact_relationship', e.target.value)}>
              <option value="">Select relationship</option>
              {CONTACT_RELATIONSHIP_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="cust-status">Status</label>
          <select id="cust-status" className="filter-select" value={form.status} onChange={e => updateField('status', e.target.value)}>
            {['Active', 'Inactive'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/sales/customers')}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving...' : 'Save Customer'}</button>
      </div>
    </div>;
}
function portalStatusLabel(status) {
  switch (status) {
    case 'invited':
      return 'Pending portal activation';
    case 'active':
      return 'Portal active';
    case 'pending':
      return 'Pending portal activation';
    default:
      return 'No portal account';
  }
}

function CustomerDetailPage({
  customerId,
  parentContext,
  navigate,
  showToast
}) {
  const location = useLocation();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalEmail, setPortalEmail] = useState('');
  const [lastActivationUrl, setLastActivationUrl] = useState('');
  const [resending, setResending] = useState(false);
  useEffect(() => {
    const pending = location.state?.portalActivationUrl;
    if (pending) {
      setLastActivationUrl(pending);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location.pathname, location.search, location.state, navigate]);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) {
        setCustomer(res.data);
        setPortalEmail(res.data.portal_email || '');
      }
      setLoading(false);
    }
    load();
  }, [customerId]);
  const handleResendPortal = async () => {
    if (!portalEmail.trim()) {
      showToast('Enter the customer portal email.', 'error');
      return;
    }
    setResending(true);
    const result = await resendCustomerPortalInvitation(customerId, portalEmail.trim());
    setResending(false);
    if (!result.success) {
      showToast(result.message || 'Failed to resend invitation.', 'error');
      return;
    }
    if (result.portal?.emailSent) {
      setLastActivationUrl('');
    } else {
      setLastActivationUrl(result.portal?.activationUrl || '');
    }
    showToast(result.message || 'Portal invitation sent.', 'success');
    const refreshed = await fetchCustomerById(customerId);
    if (refreshed.success && refreshed.data) setCustomer(refreshed.data);
  };
  if (loading) return <LoadingState message="Loading customer details..." />;
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back to Customers" onAction={() => navigate('/sales/customers')} />;
  const purchaseVolumeUnits = resolvePurchaseVolumeUnits(customer);
  const outstandingBalance = customer.activity?.outstanding_balance || 0;
  const lastVisit = customer.activity?.last_sales_visit ? formatDisplayDate(customer.activity.last_sales_visit) : 'N/A';
  const creditLimit = customer.creditInfo?.credit_limit || 10000;
  const activityUpdatedAt = customer.activity?.updated_at;
  const customerSince = customer.created_at ? formatDisplayDate(customer.created_at) : 'N/A';
  const displayId = formatCustomerDisplayId(customer);
  const ownerName = formatCustomerFullName(customer);
  const primaryContactName = formatContactPersonName(customer);
  const secondaryName = formatSecondaryContactName(customer);
  return <div className="page account-detail-page">
      <StatsGrid stats={[{
      label: 'Customer ID',
      value: displayId
    }, {
      label: 'Purchase Volume',
      value: formatPurchaseVolumeUnits(purchaseVolumeUnits)
    }, {
      label: 'Outstanding',
      value: formatCurrency(outstandingBalance)
    }, {
      label: 'Last Visit',
      value: lastVisit
    }, {
      label: 'Account Manager',
      value: customer.account_manager_name || '—'
    }, {
      label: 'Customer Since',
      value: customerSince
    }]} />

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{ownerName}</h3>
          <p className="muted">{displayId} · {customer.branch_name || '—'} · Status: <StatusBadge status={customer.status} /></p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <h4 className="subsection-title">Account Information</h4>
            <DetailRowsTable rows={[
              { label: 'Customer ID', value: displayId },
              { label: 'First Name', value: customer.first_name || '—' },
              { label: 'Middle Name', value: formatMiddleNameDisplay(customer.middle_name) },
              { label: 'Last Name', value: customer.last_name || '—' },
              { label: 'Branch', value: customer.branch_name || '—' },
              { label: 'Account Manager', value: customer.account_manager_name || '—' },
              { label: 'Assigned Sales Agent', value: customer.assigned_sales_agent_name || '—' },
              { label: 'Territory', value: customer.territory_name || '—' },
              { label: 'Business Phone', value: customer.contact_phone || '—' },
              { label: 'Status', value: <StatusBadge status={customer.status} /> },
              { label: 'Portal access', value: <StatusBadge status={portalStatusLabel(customer.portal_status)} /> },
              ...(customer.portal_email ? [{ label: 'Portal email', value: customer.portal_email }] : []),
              { label: 'Created At', value: customer.created_at ? formatDisplayDateTime(customer.created_at) : 'N/A' },
              { label: 'Updated At', value: customer.updated_at ? formatDisplayDateTime(customer.updated_at) : 'N/A' },
              { label: 'Address', value: customer.address || '—' },
              { label: 'Latitude', value: customer.latitude ?? '—' },
              { label: 'Longitude', value: customer.longitude ?? '—' },
            ]} />
          </div>
          <div>
            <h4 className="subsection-title">Primary Contact</h4>
            <DetailRowsTable rows={[
              { label: 'Name', value: primaryContactName },
              { label: 'Middle Name', value: formatMiddleNameDisplay(customer.contact_person_mname) },
              { label: 'Phone', value: customer.contact_person_phone || '—' },
            ]} />
            {secondaryName ? (
              <>
                <h4 className="subsection-title" style={{ marginTop: 12 }}>Secondary Contact</h4>
                <DetailRowsTable rows={[
                  { label: 'Name', value: secondaryName },
                  { label: 'Phone', value: customer.secondary_contact_phone || '—' },
                  { label: 'Relationship', value: customer.secondary_contact_relationship || '—' },
                ]} />
              </>
            ) : null}
          </div>
        </div>
      </section>

      {customer.portal_status !== 'active' ? (
        <section className="panel content-panel account-detail-panel">
          <div className="panel-section-header"><h3>Customer Portal Invitation</h3></div>
          <p className="muted">Sends the activation email automatically when SMTP is configured. The sales agent never sets the customer password.</p>
          <div className="form-group">
            <label htmlFor="detail-portal-email">Portal email</label>
            <input id="detail-portal-email" type="email" value={portalEmail} onChange={(e) => setPortalEmail(e.target.value)} />
          </div>
          <button className="button secondary" type="button" onClick={handleResendPortal} disabled={resending}>
            {resending ? 'Sending…' : 'Send / Resend Invitation'}
          </button>
          {lastActivationUrl ? (
            <p className="muted" style={{ marginTop: 12, wordBreak: 'break-all' }}>
              Email not sent — copy this activation link for the customer: {lastActivationUrl}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>Customer Activity</h3>
        </div>
        <div className="account-detail-grid two-up">
          <DetailRowsTable
            fieldHeader="Activity"
            detailsHeader="Details"
            rows={[
              { label: 'Purchase Volume (units)', value: formatPurchaseVolumeUnits(purchaseVolumeUnits) },
              { label: 'Outstanding Balance', value: formatCurrency(outstandingBalance) },
              { label: 'Last Sales Visit', value: lastVisit },
              { label: 'Last Collection Date', value: customer.activity?.last_collection_date ? formatDisplayDate(customer.activity.last_collection_date) : 'N/A' },
              { label: 'Activity Updated At', value: activityUpdatedAt ? formatDisplayDateTime(activityUpdatedAt) : '—' },
            ]}
          />
          <div>
            <h4 className="subsection-title">Credit Performance</h4>
            <DetailRowsTable rows={[
              { label: 'Credit Limit', value: formatCurrency(creditLimit) },
              { label: 'Outstanding Balance', value: formatCurrency(outstandingBalance) },
            ]} />
            <div className="progress-bar-container" style={{ marginTop: 8 }}>
              <div className="progress-bar" style={{
              width: `${Math.min(outstandingBalance / (creditLimit || 1) * 100, 100)}%`,
              backgroundColor: outstandingBalance > creditLimit * 0.8 ? '#ef4444' : '#1A4162'
            }} />
            </div>
          </div>
        </div>
      </section>

      {customer.creditInfo && <section className="panel content-panel account-detail-panel">
          <div className="panel-section-header">
            <h3>Credit Information</h3>
          </div>
          <DetailRowsTable rows={[
            { label: 'Credit Limit', value: formatCurrency(Number(customer.creditInfo.credit_limit || 0)) },
            { label: 'Monthly Income', value: formatCurrency(Number(customer.creditInfo.monthly_income || 0)) },
            { label: 'Credit Score', value: customer.creditInfo.credit_score || '—' },
            { label: 'Employment Status', value: customer.creditInfo.employment_status || '—' },
            { label: 'Approved By', value: customer.creditInfo.approved_by_name || '—' },
            { label: 'Approved Date', value: formatDisplayDate(customer.creditInfo.approved_date) },
            { label: 'Credit Info ID', value: customer.creditInfo.credit_info_id || '—' },
            { label: 'Created At', value: formatDisplayDateTime(customer.creditInfo.created_at) },
            { label: 'Updated At', value: formatDisplayDateTime(customer.creditInfo.updated_at) },
          ]} />
        </section>}

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Location Map</h3>
          <p className="muted">Customer address: {customer.address}</p>
        </div>
        <div style={{
        minHeight: 300,
        borderRadius: 8,
        overflow: 'hidden'
      }}>
          <LeafletMap center={customer.latitude && customer.longitude ? [Number(customer.latitude), Number(customer.longitude)] : [7.1907, 125.4553]} zoom={15} height={300} markers={[{
          id: customer.customer_id,
          position: customer.latitude && customer.longitude ? [Number(customer.latitude), Number(customer.longitude)] : [7.1907, 125.4553],
          popup: `<strong>${customer.first_name} ${customer.last_name}</strong><br/>${customer.address}`,
          label: String(customer.customer_id),
          color: '#0B1E30'
        }]} />
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Recent Payments</h3>
        </div>
        <div className="table-shell">
          <table className="corvex-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt #</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Collector</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customer.paymentHistory && customer.paymentHistory.length ? customer.paymentHistory.map(p => <tr key={p.payment_id || p.receipt_number}>
                  <td>{formatDisplayDate(p.payment_date)}</td>
                  <td><span style={{
                  fontFamily: 'monospace',
                  fontSize: '0.82rem'
                }}>{p.receipt_number || '—'}</span></td>
                  <td>{formatCurrency(Number(p.amount))}</td>
                  <td>{p.payment_method || 'Cash'}</td>
                  <td>{p.collector_name || '—'}</td>
                  <td>
                    <StatusBadge status={p.payment_status || 'Completed'} />
                  </td>
                </tr>) : <tr><td colSpan="6" style={{
                textAlign: 'center',
                color: '#5F7385',
                padding: 16
              }}>No recent payments</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(parentContext === 'schedule' ? '/sales/schedule' : '/sales/customers')}>Back</button>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(`/sales/ci-form/${customer.customer_id}?from=${parentContext || 'customers'}`)}
        >
          Request Credit Investigation
        </button>
        <button className="button ghost" type="button" onClick={() => navigate('/sales/credit-investigations')}>My CIs</button>
        <button className="button" type="button" onClick={() => navigate(`/sales/log-sale/${customer.customer_id}`)}>Log a Sale</button>
      </div>
    </div>;
}
function LogSalePage({
  customerId,
  purchaseRequestId,
  navigate,
  showToast
}) {
  const currentUser = getCurrentUser();
  const today = new Date().toISOString().slice(0, 10);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerId: customerId ? String(customerId) : '',
    paymentMethodId: '',
    invoicesDate: today,
    dueDate: '',
    notes: ''
  });
  const [lineItems, setLineItems] = useState([{
    productId: '',
    quantity: 1
  }]);
  const [errors, setErrors] = useState({});
  const [deviceSales, setDeviceSales] = useState([]);
  const [linkedPurchaseRequestId, setLinkedPurchaseRequestId] = useState(purchaseRequestId ? String(purchaseRequestId) : '');
  useEffect(() => {
    if (customerId) {
      setForm(prev => ({
        ...prev,
        customerId: String(customerId)
      }));
    }
  }, [customerId]);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [customerResult, paymentResult] = await Promise.all([fetchCustomers({
        limit: 200
      }), fetchPaymentMethods()]);
      if (customerResult.success) setCustomers(customerResult.data || []);
      if (paymentResult.success) setPaymentMethods(paymentResult.data || []);
      try {
        const apiClient = (await import('../../api/apiClient.js')).default;
        const params = {
          limit: 100
        };
        if (currentUser?.branchId) params.branch_id = currentUser.branchId;
        const productResponse = await apiClient.get('/products', {
          params
        });
        if (productResponse.data?.success) {
          setProducts(productResponse.data.data || []);
        }
      } catch (err) {
        console.error('[LogSale] product load error:', err.message);
      }
      if (purchaseRequestId) {
        const pr = await fetchSalesPurchaseRequestById(purchaseRequestId);
        if (pr.success && pr.data) {
          setLinkedPurchaseRequestId(String(pr.data.request_id));
          setForm((prev) => ({
            ...prev,
            customerId: String(pr.data.customer_id),
            notes: [prev.notes, pr.data.notes].filter(Boolean).join('\n').trim()
              || `Fulfilling purchase request #${pr.data.request_id}`,
          }));
          if (pr.data.items?.length) {
            setLineItems(pr.data.items.map((item) => ({
              productId: String(item.product_id),
              quantity: Number(item.quantity) || 1,
            })));
          }
        } else {
          showToast(pr.message || 'Could not load purchase request.', 'error');
        }
      }
      setDeviceSales(await loadWaiting('sales_invoices'));
      setLoading(false);
    }
    load();
  }, [currentUser?.branchId, purchaseRequestId, showToast]);
  const totalAmount = useMemo(() => lineItems.reduce((sum, line) => {
    const product = products.find(p => String(p.product_id) === String(line.productId));
    const quantity = Number(line.quantity) || 0;
    const unitPrice = product ? Number(product.unit_price) : 0;
    return sum + unitPrice * quantity;
  }, 0), [lineItems, products]);
  const updateLineItem = (index, field, value) => {
    setLineItems(prev => prev.map((line, i) => i === index ? {
      ...line,
      [field]: value
    } : line));
    setErrors(prev => ({
      ...prev,
      items: undefined
    }));
  };
  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      productId: '',
      quantity: 1
    }]);
  };
  const removeLineItem = index => {
    setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };
  const handleSubmit = async () => {
    const nextErrors = {};
    if (!form.customerId) nextErrors.customerId = 'Select a customer.';
    if (!form.paymentMethodId) nextErrors.paymentMethodId = 'Select a payment method.';
    if (!form.invoicesDate) nextErrors.invoicesDate = 'Invoice date is required.';
    const items = lineItems.filter(line => line.productId).map(line => ({
      product_id: Number(line.productId),
      quantity: Number(line.quantity)
    }));
    if (!items.length) nextErrors.items = 'Add at least one product line.';
    items.forEach(item => {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        nextErrors.items = 'Each line must have a quantity greater than zero.';
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    const customer = customers.find((row) => String(row.customer_id) === String(form.customerId));
    const payload = {
      customer_id: Number(form.customerId),
      payment_method_id: Number(form.paymentMethodId),
      invoices_date: form.invoicesDate,
      due_date: form.dueDate || undefined,
      notes: form.notes,
      items,
      purchase_request_id: linkedPurchaseRequestId ? Number(linkedPurchaseRequestId) : undefined,
      customer_name: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : 'Sale',
    };
    const keepLocal = async () => {
      if (!isSalesOfflineEnabled()) {
        showToast('Turn on offline mode in Settings to keep this sale on the device.', 'error');
        return;
      }
      await saveOfflineRecord({ tableName: 'sales_invoices', payload: { ...payload, saved_offline: true } });
      showToast(
        isSalesAutoSyncEnabled()
          ? 'Saved on this device. It will sync when you are online.'
          : 'Saved on this device. Send it from Settings while auto-sync is off.',
        'success'
      );
      setDeviceSales(await loadWaiting('sales_invoices'));
    };
    if (!isBrowserOnline()) {
      await keepLocal();
      return;
    }
    setSubmitting(true);
    const result = await createSalesInvoice(payload);
    setSubmitting(false);
    if (!result.success || !result.data) {
      if (result.offline) {
        await keepLocal();
        return;
      }
      showToast(result.message || 'Failed to log sale.', 'error');
      return;
    }
    showToast(result.message || 'Sale logged successfully.', 'success');
    navigate(`/sales/invoices/${encodeURIComponent(result.data.invoice_number)}`);
  };
  if (loading) return <LoadingState message="Loading log a sale form..." />;
  return <div className="page">
      <DeviceQueue rows={deviceSales} />
      <section className="panel form-panel content-panel">
        <div className="panel-section-header">
          <h3>Log a Sale</h3>
          <p className="muted">Record a customer sales invoice and line items for branch review.</p>
          {linkedPurchaseRequestId ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Prefilled from purchase request #{linkedPurchaseRequestId}. Submitting will create the invoice and mark the request as invoiced.
            </p>
          ) : null}
        </div>

        <div className="field-report-form">
          <div className="field-report-filter-row log-sale-filter-row">
            <label className="field-report-field" htmlFor="log-sale-customer">
              <span>Customer *</span>
              <select id="log-sale-customer" className="filter-select" value={form.customerId} onChange={e => {
              setForm(prev => ({
                ...prev,
                customerId: e.target.value
              }));
              setErrors(prev => ({
                ...prev,
                customerId: undefined
              }));
            }}>
                <option value="">Select customer</option>
                {customers.map(c => <option key={c.customer_id} value={c.customer_id}>
                    {c.first_name} {c.last_name} (ID {c.customer_id})
                  </option>)}
              </select>
              {errors.customerId ? <p className="form-error">{errors.customerId}</p> : null}
            </label>
            <label className="field-report-field" htmlFor="log-sale-payment">
              <span>Payment Method *</span>
              <select id="log-sale-payment" className="filter-select" value={form.paymentMethodId} onChange={e => {
              setForm(prev => ({
                ...prev,
                paymentMethodId: e.target.value
              }));
              setErrors(prev => ({
                ...prev,
                paymentMethodId: undefined
              }));
            }}>
                <option value="">Select payment method</option>
                {paymentMethods.map(method => <option key={method.payment_method_id} value={method.payment_method_id}>
                    {method.method_name}
                  </option>)}
              </select>
              {errors.paymentMethodId ? <p className="form-error">{errors.paymentMethodId}</p> : null}
            </label>
            <label className="field-report-field" htmlFor="log-sale-date">
              <span>Invoice Date *</span>
              <input
                id="log-sale-date"
                className="filter-input"
                type="date"
                value={form.invoicesDate}
                onChange={e => setForm(prev => ({
                  ...prev,
                  invoicesDate: e.target.value
                }))}
              />
              {errors.invoicesDate ? <p className="form-error">{errors.invoicesDate}</p> : null}
            </label>
            <label className="field-report-field" htmlFor="log-sale-due">
              <span>Due Date</span>
              <input
                id="log-sale-due"
                className="filter-input"
                type="date"
                value={form.dueDate}
                onChange={e => setForm(prev => ({
                  ...prev,
                  dueDate: e.target.value
                }))}
              />
            </label>
          </div>

          <div className="form-group field-report-block">
            <label htmlFor="log-sale-notes">Notes</label>
            <textarea id="log-sale-notes" placeholder="Product details, delivery notes, or payment terms..." value={form.notes} onChange={e => setForm(prev => ({
            ...prev,
            notes: e.target.value
          }))} />
          </div>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Line Items</h3>
          <button className="button secondary" type="button" onClick={addLineItem}>Add Product</button>
        </div>
        {errors.items ? <p className="form-error">{errors.items}</p> : null}
        <div className="table-shell">
          <table className="corvex-table log-sale-lines-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit Price</th>
                <th>Quantity</th>
                <th>Line Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => {
              const product = products.find(p => String(p.product_id) === String(line.productId));
              const unitPrice = product ? Number(product.unit_price) : 0;
              const quantity = Number(line.quantity) || 0;
              const lineTotal = unitPrice * quantity;
              return <tr key={`line-${index}`}>
                    <td>
                      <select className="filter-select" value={line.productId} onChange={e => updateLineItem(index, 'productId', e.target.value)}>
                        <option value="">Select product</option>
                        {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                      </select>
                    </td>
                    <td>{product ? formatCurrency(unitPrice) : '—'}</td>
                    <td>
                      <QuantityStepper
                        value={line.quantity}
                        min={1}
                        onChange={(next) => updateLineItem(index, 'quantity', next)}
                        aria-label={`Quantity for line ${index + 1}`}
                      />
                    </td>
                    <td>{product ? formatCurrency(lineTotal) : '—'}</td>
                    <td>
                      <button className="button ghost" type="button" onClick={() => removeLineItem(index)} disabled={lineItems.length <= 1}>
                        Remove
                      </button>
                    </td>
                  </tr>;
            })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{
        marginTop: 12
      }}>Invoice total: <strong>{formatCurrency(totalAmount)}</strong></p>
      </section>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/sales/dashboard')}>Cancel</button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Sale'}
        </button>
      </div>
    </div>;
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
function SalesCISubmissionsPage({
  navigate,
  showToast
}) {
  const [filter, setFilter] = useState('All');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    const res = await fetchSalesCreditInvestigations({ status: filter === 'All' ? undefined : filter });
    if (res.success) setItems((res.data || []).map(mapCreditInvestigationRow));
    else if (showToast) showToast(res.message || 'Failed to load credit investigations.', 'error');
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [filter]);
  const pagination = usePagination(items);
  const rows = pagination.paginatedData;
  if (loading && !items.length) return <LoadingState message="Loading credit investigations..." />;
  return <div className="page">
      <section className="panel content-panel">
        <div className="list-section-header">
          <h3>My Credit Investigations</h3>
        </div>
        <div className="list-section-toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented-control">
            {['All', 'Pending', 'Approved', 'Rejected', 'Revision Requested'].map(f => (
              <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        </div>
        {items.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr><th>CI #</th><th>Customer</th><th>Purpose</th><th>Submitted</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map(ci => <tr key={ci.id} className="clickable-row" onClick={() => navigate(`/sales/credit-investigations/${ci.ciId}`)}>
                    <td>{ci.ciId}</td>
                    <td>{ci.customerName}</td>
                    <td>{ci.purpose || '—'}</td>
                    <td>{formatDisplayDate(ci.submissionDate)}</td>
                    <td><StatusBadge status={ci.status} /></td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="icon-action-button"
                        type="button"
                        title="View"
                        aria-label={`View credit investigation ${ci.ciId}`}
                        onClick={() => navigate(`/sales/credit-investigations/${ci.ciId}`)}
                      >
                        <NavIcon name="view" />
                      </button>
                      {(ci.status === 'Rejected' || ci.status === 'Revision Requested') && ci.customerId ? (
                        <button
                          className="icon-action-button"
                          type="button"
                          title="Resubmit"
                          aria-label={`Resubmit credit investigation ${ci.ciId}`}
                          onClick={() => navigate(`/sales/ci-form/${ci.customerId}?from=customers`)}
                        >
                          <NavIcon name="reset" />
                        </button>
                      ) : null}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No credit investigations" description="Request a CI from a customer profile, or adjust the status filter." actionLabel="Browse customers" onAction={() => navigate('/sales/customers')} />}
      </section>
    </div>;
}
function SalesCIDetailPage({
  ciId,
  navigate,
  showToast
}) {
  const [ci, setCi] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchSalesCreditInvestigationById(ciId);
      if (res.success && res.data) setCi(mapCreditInvestigationRow(res.data));
      else {
        setCi(null);
        if (showToast) showToast(res.message || 'Credit investigation not found.', 'error');
      }
      setLoading(false);
    }
    load();
  }, [ciId, showToast]);
  if (loading) return <LoadingState message="Loading credit investigation..." />;
  if (!ci) {
    return <EmptyState title="Not found" description="This submission is not on your account." actionLabel="Back to list" onAction={() => navigate('/sales/credit-investigations')} />;
  }
  const canResubmit = ci.status === 'Rejected' || ci.status === 'Revision Requested';
  return <div className="page">
      <StatsGrid stats={[{
        label: 'Status',
        value: ci.status
      }, {
        label: 'Monthly income',
        value: formatCurrency(ci.monthlyIncome)
      }, {
        label: 'Risk score',
        value: String(ci.riskScore ?? '—')
      }]} />
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>CI #{ci.ciId} · {ci.customerName}</h3>
          <p className="muted">Submitted {formatDisplayDateTime(ci.submissionDate)} · Branch review by manager</p>
        </div>
        <DetailRowsTable rows={[
          { label: 'Purpose', value: ci.purpose || '—' },
          { label: 'Business type', value: ci.businessType || '—' },
          { label: 'References', value: ci.references || '—' },
          { label: 'Remarks', value: ci.formRemarks || '—' },
          ...(ci.rejectionReason ? [{ label: 'Decision notes', value: ci.rejectionReason }] : []),
        ]} />
      </section>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/credit-investigations')}>Back to list</button>
        {ci.customerId ? (
          <button className="button secondary" type="button" onClick={() => navigate(`/sales/customer-detail/${ci.customerId}?from=customers`)}>Customer profile</button>
        ) : null}
        {canResubmit && ci.customerId ? (
          <button className="button" type="button" onClick={() => navigate(`/sales/ci-form/${ci.customerId}?from=customers`)}>Submit revised CI</button>
        ) : null}
      </div>
    </div>;
}
function CIFormPage({
  customerId,
  parentContext,
  navigate,
  showToast
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const contextQuery = `?from=${parentContext}`;
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCustomerById(customerId);
      if (res.success && res.data) setCustomer(res.data);
      setLoading(false);
    }
    load();
  }, [customerId]);
  if (loading) return <LoadingState message="Loading customer..." />;
  if (!customer) return <EmptyState title="Customer not found" actionLabel="Back" onAction={() => navigate('/sales/customers')} />;
  return <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Credit Investigation Form</h3><p className="muted">Customer: {customer.first_name} {customer.last_name}</p></div>
        <div className="form-group"><label>Purpose of CI</label><select className="filter-select" value={formData.purpose ?? ''} onChange={e => setFormData(p => ({
          ...p,
          purpose: e.target.value
        }))}><option value="">Select purpose</option>{['Credit Limit Increase', 'New Account', 'Delinquency Review'].map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Monthly Income</label><input type="number" placeholder="₱ amount" value={formData.income ?? ''} onChange={e => setFormData(p => ({
          ...p,
          income: e.target.value
        }))} /></div>
        <div className="form-group"><label>Business Type</label><select className="filter-select" value={formData.businessType ?? ''} onChange={e => setFormData(p => ({
          ...p,
          businessType: e.target.value
        }))}><option value="">Select type</option>{['Retail', 'Wholesale', 'Convenience Store', 'Service'].map(o => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Character References</label><textarea placeholder="Reference names and contacts..." value={formData.references ?? ''} onChange={e => setFormData(p => ({
          ...p,
          references: e.target.value
        }))} /></div>
        <div className="form-group"><label>Remarks</label><textarea placeholder="Additional notes..." value={formData.remarks ?? ''} onChange={e => setFormData(p => ({
          ...p,
          remarks: e.target.value
        }))} /></div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate(`/sales/customer-detail/${customer.customer_id}${contextQuery}`)}>Cancel</button>
        <button className="button" type="button" onClick={async () => {
        const result = await submitSalesCreditInvestigation({
          customer_id: customer.customer_id,
          purpose: formData.purpose,
          monthly_income: formData.income,
          business_type: formData.businessType,
          references_summary: formData.references,
          form_remarks: formData.remarks,
        });
        if (!result.success) {
          showToast(result.message || 'Submit failed.', 'error');
          return;
        }
        showToast(result.message || 'CI submitted for branch approval.', 'success');
        const newId = result.data?.ci_id;
        navigate(newId ? `/sales/credit-investigations/${newId}` : '/sales/credit-investigations');
      }}>Submit for Branch Approval</button>
      </div>
    </div>;
}
function InventoryPage({
  navigate,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Name');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const branchId = getCurrentUser()?.branch?.id;
        const res = await apiClient.get('/products', {
          params: branchId ? { branch_id: branchId, limit: 200 } : { limit: 200 },
        });
        if (res.data.success) {
          setProducts(res.data.data);
          setCategories(res.data.categories || []);
        }
      } catch (err) {
        console.error('[SalesInventory] load error:', err.message);
      }
      setLoading(false);
    }
    loadProducts();
  }, []);
  const filtered = useMemo(() => {
    let results = [...products];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter(p => p.product_name.toLowerCase().includes(query) || p.category_name && p.category_name.toLowerCase().includes(query));
    if (category !== 'All') results = results.filter(p => p.category_id === Number(category));
    if (sortBy === 'Product Name') results.sort((a, b) => a.product_name.localeCompare(b.product_name));else if (sortBy === 'Unit Price') results.sort((a, b) => a.unit_price - b.unit_price);
    return results;
  }, [products, search, category, sortBy]);
  const pagination = usePagination(filtered, {
    resetKey: `${search}|${category}|${sortBy}`,
  });
  const paginated = pagination.paginatedData;
  if (loading) return <LoadingState message="Loading inventory..." />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Inventory Viewer</h3>
        </div>
        <div className="list-section-toolbar suppliers-toolbar audit-logs-toolbar">
          <div className="list-section-controls audit-logs-filters">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search products by name or category"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search inventory"
            />
            <select
              className="filter-select"
              value={category}
              onChange={e => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
            <select
              className="filter-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort inventory"
            >
              {['Product Name', 'Unit Price'].map(o => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button
              className="button secondary whitespace-nowrap"
              type="button"
              onClick={() => {
                const rows = filtered.map((p) => ({
                  product_id: p.product_id,
                  name: p.product_name,
                  category: p.category_name || '',
                  unit_price: p.unit_price,
                  status: p.status || '',
                }));
                if (downloadPdf(rows, { filename: 'sales-inventory.pdf', title: 'Sales Inventory' })) showToast('Inventory exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
          </div>
        </div>
        {filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Product ID</th><th>Product Name</th><th>Category</th><th>Unit Price</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginated.map(product => <tr key={product.product_id} className="clickable-row" onClick={() => navigate(`/sales/inventory/${product.product_id}`)}>
                    <td>{product.product_id}</td>
                    <td>{product.product_name}</td>
                    <td>{product.category_name || product.category_id}</td>
                    <td>{formatCurrency(product.unit_price)}</td>
                    <td><StatusBadge status={product.status} /></td>
                    <td className="table-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/sales/inventory/${product.product_id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No products found" description="Adjust your search or category filter." />}
      </section>
      {selectedProduct ? <aside className="panel content-panel product-drawer" role="dialog" aria-label="Product details">
          <div className="panel-section-header">
            <h3>{selectedProduct.name}</h3>
            <button className="toast-dismiss" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close">×</button>
          </div>
          <DetailRowsTable rows={[
            { label: 'SKU', value: selectedProduct.sku },
            { label: 'Category', value: selectedProduct.category },
            { label: 'Stock', value: `${selectedProduct.stock} units` },
            { label: 'Unit Price', value: formatCurrency(selectedProduct.unitPrice) },
            { label: 'Branch', value: selectedProduct.branch },
            { label: 'Status', value: <StatusBadge status={selectedProduct.status} /> },
          ]} />
          <button className="button" type="button" onClick={() => navigate(`/sales/inventory/${selectedProduct.id}`)}>Open Product Details</button>
        </aside> : null}
    </div>;
}
function ProductDetailsPage({
  productId,
  navigate
}) {
  const [product, setProduct] = useState(null);
  const [branchStock, setBranchStock] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await apiClient.get(`/products/${productId}`);
      if (res.data.success) {
        setProduct(res.data.data);
        const branchId = getCurrentUser()?.branch?.id;
        const inv = res.data.data?.inventory || [];
        setBranchStock(branchId ? inv.find((row) => row.branch_id === branchId) : inv[0]);
      }
      setLoading(false);
    }
    load();
  }, [productId]);
  if (loading) return <LoadingState message="Loading product..." />;
  if (!product) return <EmptyState title="Product not found" actionLabel="Back to Inventory" onAction={() => navigate('/sales/inventory')} />;
  return <div className="page">
      <StatsGrid stats={[{
      label: 'Current Stock',
      value: String(branchStock?.available_stock ?? '—')
    }, {
      label: 'Unit Price',
      value: formatCurrency(product.unit_price)
    }, {
      label: 'Status',
      value: branchStock?.stock_status || product.status
    }]} />
      <section className="panel content-panel">
        <DetailRowsTable rows={[
          { label: 'Product', value: product.product_name },
          { label: 'SKU', value: product.sku },
          { label: 'Category', value: product.category_name || '—' },
          { label: 'Branch', value: branchStock?.branch_name || getCurrentUser()?.branch?.name || '—' },
          { label: 'Reorder Level', value: `${branchStock?.reorder_level ?? product.reorder_point ?? '—'} units` },
        ]} />
      </section>
      <div className="flex justify-end mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/sales/inventory')}>Back to Inventory</button>
      </div>
    </div>;
}
export function SalesHistoryPage({
  navigate,
  showToast,
  historyBasePath = '/sales/history',
  getInvoiceDetailPath = (invoiceNumber) => `/sales/invoices/${encodeURIComponent(invoiceNumber)}`,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
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

  const productNames = useMemo(() => Array.from(new Set(invoices.flatMap(item => item.product_names || []))).sort(), [invoices]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter(item => {
      const customerName = item.customer_name || `${item.first_name || ''} ${item.last_name || ''}`.trim();
      const matchesSearch = !query || customerName.toLowerCase().includes(query) || String(item.invoice_number || '').toLowerCase().includes(query);
      const matchesProduct = productFilter === 'All' || (item.product_names || []).includes(productFilter);
      return matchesSearch && matchesProduct;
    });
  }, [search, productFilter, invoices]);
  const clientPager = usePagination(filtered, { pageSize: DEFAULT_PAGE_SIZE, resetKey: `${search}|${productFilter}` });
  const useClientSlice = Boolean(search.trim() || productFilter !== 'All');
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
            <select
              className="filter-select"
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              aria-label="Filter by product"
            >
              <option value="All">All Products</option>
              {productNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <input className="filter-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
            <input className="filter-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="To date" />
          </div>
          <div className="list-section-actions suppliers-toolbar-actions">
            <button
              className="button secondary whitespace-nowrap"
              type="button"
              onClick={() => {
                const exportRows = rows.map((item) => ({
                  invoice_number: item.invoice_number,
                  customer: item.customer_name || `${item.first_name || ''} ${item.last_name || ''}`.trim(),
                  date: item.invoice_date || item.created_at || '',
                  total: item.total_amount,
                  status: item.status || '',
                }));
                if (downloadPdf(exportRows, { filename: 'sales-history.pdf', title: 'Sales History' })) showToast('Sales history exported as PDF.', 'success');
                else showToast('Nothing to export.', 'error');
              }}
            >
              Export PDF
            </button>
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

function FieldActivityReportsPage({ showToast }) {
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
  const [deviceReports, setDeviceReports] = useState([]);

  async function loadDeviceReports() {
    try {
      const rows = await loadWaiting('field_activity_reports');
      setDeviceReports(rows);
    } catch {
      setDeviceReports([]);
    }
  }

  async function loadReports() {
    setLoading(true);
    const today = manilaToday();
    const [reportsResult, visitsResult] = await Promise.all([
      fetchSalesFieldReports(),
      fetchFieldVisits({ scheduled_date: today, status: 'All' }),
    ]);
    if (reportsResult.success) setReports(reportsResult.data || []);
    if (visitsResult.success) setVisits(visitsResult.data || []);
    await loadDeviceReports();
    setLoading(false);
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function keepReportOnDevice() {
    const visit = visits.find((row) => String(row.visit_id) === String(form.visit_id));
    await saveOfflineRecord({
      tableName: 'field_activity_reports',
      payload: {
        visit_id: Number(form.visit_id),
        activity_type: form.activity_type,
        remarks: form.remarks.trim(),
        photo: form.photo,
        customer_name: visit?.customer_name || '',
        visit_status: visit?.status || '',
      },
    });
    showToast(
      isSalesAutoSyncEnabled()
        ? 'Saved on this device. It will sync when you are online.'
        : 'Saved on this device. Send it from Settings while auto-sync is off.',
      'success'
    );
    setForm({ visit_id: '', activity_type: '', remarks: '', photo: '', photoName: '' });
    await loadDeviceReports();
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!form.visit_id) nextErrors.visit_id = 'Select a visit.';
    if (!form.activity_type) nextErrors.activity_type = 'Select an activity type.';
    if (!form.remarks.trim()) nextErrors.remarks = 'Remarks are required.';
    if (!form.photo) nextErrors.photo = 'Photo evidence is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!isBrowserOnline()) {
      if (isSalesOfflineEnabled()) {
        await keepReportOnDevice();
      } else {
        showToast('Turn on offline mode in Settings to keep this report on the device.', 'error');
      }
      return;
    }
    setSubmitting(true);
    const result = await submitSalesFieldReport({
      visit_id: Number(form.visit_id),
      activity_type: form.activity_type,
      remarks: form.remarks.trim(),
      photo: form.photo,
    });
    setSubmitting(false);
    if (result.success) {
      showToast(result.message || 'Report submitted.', 'success');
      setForm({ visit_id: '', activity_type: '', remarks: '', photo: '', photoName: '' });
      loadReports();
    } else if (result.offline && isSalesOfflineEnabled()) {
      await keepReportOnDevice();
    } else {
      showToast(result.message || 'Failed to submit report.', 'error');
    }
  };

  const pagination = usePagination(reports);
  if (loading) return <LoadingState message="Loading field activity reports..." />;

  return <div className="page">
    <section className="panel content-panel">
      <div className="panel-section-header">
        <h3>Field Activity Reports</h3>
        <p className="muted">Submit visit activity for today's sales schedule ({reports.length} report{reports.length === 1 ? '' : 's'} on file).</p>
      </div>
      {deviceReports.length ? <DeviceQueue rows={deviceReports} /> : null}
      <form className="field-report-form" onSubmit={handleSubmit}>
        <div className="field-report-filter-row">
          <label className="field-report-field">
            <span>Visit / Customer<span className="required">*</span></span>
            <select className="filter-select" value={form.visit_id} onChange={(e) => setForm((p) => ({ ...p, visit_id: e.target.value }))}>
              <option value="">Select today's visit</option>
              {visits.map((v) => <option key={v.visit_id} value={v.visit_id}>
                {v.customer_name} — {v.visit_type} ({formatDisplayDate(v.scheduled_date)}, {v.status})
              </option>)}
            </select>
            {errors.visit_id ? <p className="form-error">{errors.visit_id}</p> : null}
          </label>
          <label className="field-report-field">
            <span>Activity Type<span className="required">*</span></span>
            <select className="filter-select" value={form.activity_type} onChange={(e) => setForm((p) => ({ ...p, activity_type: e.target.value }))}>
              <option value="">Select activity type</option>
              {['Sales Visit', 'Canvassing', 'Delivery', 'Site Check', 'Follow-up', 'Customer Not Available'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.activity_type ? <p className="form-error">{errors.activity_type}</p> : null}
          </label>
        </div>
        {!visits.length ? <p className="field-report-hint">No visits scheduled for today. Reports can be filed once a visit is assigned.</p> : null}
        <div className="form-group field-report-block">
          <label>Remarks<span className="required">*</span></label>
          <textarea rows={3} placeholder="Describe the visit outcome, order taken, or follow-up needed..." value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
          {errors.remarks ? <p className="form-error">{errors.remarks}</p> : null}
        </div>
        <div className="form-group field-report-block">
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
          {form.photoName ? <p className="muted">Selected: {form.photoName}</p> : null}
          {form.photo ? <img src={form.photo} alt="Report preview" style={{ marginTop: 8, maxWidth: 200, maxHeight: 140, borderRadius: 8, border: '1px solid #BADBE9' }} /> : null}
          {errors.photo ? <p className="form-error">{errors.photo}</p> : null}
        </div>
        <div className="flex justify-end">
          <button className="button" type="submit" disabled={submitting || !visits.length}>
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </form>
    </section>
    {reports.length ? <section className="panel content-panel">
      <div className="corvex-table-wrapper">
        <table className="corvex-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Activity</th>
              <th>Visit Date</th>
              <th>Sync</th>
              <th>Photo</th>
              <th>Submitted</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {pagination.paginatedData.map((r) => <tr key={r.report_id}>
              <td>{r.customer_name}</td>
              <td>{r.activity_type}</td>
              <td>{formatDisplayDate(r.scheduled_date)}</td>
              <td><StatusBadge status={r.sync_status} /></td>
              <td>
                {r.photo ? (
                  <a href={r.photo} target="_blank" rel="noreferrer">
                    <img src={r.photo} alt="Report" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #BADBE9' }} />
                  </a>
                ) : '—'}
              </td>
              <td>{formatDisplayDateTime(r.created_at)}</td>
              <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.remarks}>{r.remarks || '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
    </section> : <EmptyState title="No field activity reports yet" description="Submit a report after a scheduled sales visit." />}
  </div>;
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
    ciId: page.params?.ciId,
    customerId: page.params?.customerId,
    visitId: page.params?.visitId,
    productId: page.params?.productId,
    invoiceId: page.params?.invoiceId,
    parentContext: page.parentContext,
    purchaseRequestId: page.purchaseRequestId,
    requestId: page.params?.requestId,
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
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...props} />;
    case 'customers':
      return <CustomersPage {...props} />;
    case 'purchaseRequests':
      return <SalesPurchaseRequestsPage {...props} />;
    case 'purchaseRequestDetail':
      return <SalesPurchaseReviewPage {...props} />;
    case 'customerForm':
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
      return <SalesCISubmissionsPage {...props} />;
    case 'ciSubmissionDetail':
      return <SalesCIDetailPage {...props} />;
    case 'ciForm':
      return <CIFormPage {...props} />;
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
      return <CreditHistoryListPage navigate={navigate} showToast={showToast} basePath="/sales/credit-history" userBranch={getCurrentUser()?.branch?.name} />;
    case 'creditDetail':
      return <CreditHistoryDetailPage creditId={page.params?.creditId} navigate={navigate} basePath="/sales/credit-history" />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}