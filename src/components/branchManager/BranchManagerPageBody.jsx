import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../data/branchManagerMockData';
import {
  fetchCreditInvestigations,
  fetchCreditInvestigationById,
  patchCreditInvestigation,
  fetchSpecialCollectionRequests,
  patchSpecialCollectionRequest,
  fetchPendingSalesInvoices,
  patchSalesInvoiceReview,
  fetchCollectionsForReview,
  patchCollectionReview,
  mapCreditInvestigationRow,
  mapSpecialCollectionRow,
} from '../../api/approvalsService.js';
import { fetchOperationalAlerts, patchOperationalAlert, mapOperationalAlertRow } from '../../api/operationalAlertsService.js';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, mapNotificationRow } from '../../api/notificationService.js';
import { fetchInventoryTransfers, patchInventoryTransfer, mapInventoryTransferRow } from '../../api/inventoryService.js';
import { BranchInventoryViewPage } from '../inventory/BranchInventoryViewPage.jsx';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { DetailRowsTable } from '../shared/DetailRowsTable';
import { AccountProfilePanel } from '../shared/AccountProfilePanel';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { StatusBadge } from '../StatusBadge';
import { requestLogout, getCurrentUser } from '../../api/authService.js';
import {
  getBranchAnalytics,
  getBranchStaff,
  getBranchCustomers,
  getBranchCustomerById,
  getBranchAlerts,
  getBranchAuditLogs,
  getBranchCollectorDetail,
  getBranchSalesAgentDetail,
  getFieldActivityReports,
  getFieldActivityReport,
  fetchCollectorSawPriority,
  assignCollectorCollectionRoute,
} from '../../api/branchManagerService.js';
import { getReportCollection, getReportSales, getReportInventory, getReportDelinquency, getReportCompliance, getReportKPI, getReportInvoices } from '../../api/reportsService.js';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';
import { TerritoriesPage } from '../territories/TerritoriesPage';
import { InvoiceDetailsPage } from '../sales/InvoiceDetailsPage';
import { BranchLeafletPage } from './BranchLeafletPage';
import { formatMiddleNameDisplay } from '../../utils/customerDisplay.js';
import { downloadPdf, exportRows } from '../../utils/dataExport.js';
import { chartSeries } from '../../theme/palette.js';
import { ChartDrilldownModal } from '../shared/ChartDrilldownModal.jsx';
import { useChartDrilldown } from '../../hooks/useChartDrilldown.js';
import { formatCurrency as formatMoney } from '../../utils/formatters.js';

// Re-export for use in other components
export { getBranchAnalytics, getBranchStaff, getBranchCustomers, getBranchAlerts };
const C = chartSeries;
function Severity({
  severity
}) {
  return <StatusBadge status={severity} />;
}
function Card({
  title,
  sub,
  children
}) {
  return <section className="panel content-panel relative overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
        <div><h3>{title}</h3>{sub && <p className="text-ink/70" style={{
          margin: '2px 0 0',
          fontSize: '0.85rem'
        }}>{sub}</p>}</div>
      </div>
      {children}
    </section>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({
  navigate,
  branchName,
  opsBase,
  showToast
}) {
  const currentUser = getCurrentUser();
  const userName = currentUser?.fullName || 'User';
  const userBranch = currentUser?.branch?.name || branchName || 'Branch';
  const { drilldown, closeDrilldown, openApiDrilldown } = useChartDrilldown({ showToast });
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [customers, setCustomers] = useState({
    mapAccounts: []
  });
  const [collectionData, setCollectionData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [delinquencyData, setDelinquencyData] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState([]);
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [analyticsData, alertsData, staffData, customersData, reportCollection, reportSales, reportDelinquency, reportKpi, notifData] = await Promise.all([
        getBranchAnalytics(),
        getBranchAlerts(),
        getBranchStaff(),
        getBranchCustomers(),
        getReportCollection(),
        getReportSales(),
        getReportDelinquency(),
        getReportKPI(),
        fetchNotifications(),
      ]);
      if (analyticsData.success) setAnalytics(analyticsData.data);
      if (alertsData.success) setAlerts(alertsData.data.alerts || []);
      if (staffData.success) setStaff(staffData.data);
      if (customersData.success) setCustomers(customersData.data);
      if (reportCollection.success) setCollectionData(reportCollection.data);
      if (reportSales.success) setSalesData(reportSales.data);
      if (reportDelinquency.success) setDelinquencyData(reportDelinquency.data);
      if (reportKpi.success) setKpi(reportKpi.data);
      if (notifData.success) {
        const rows = notifData.data || [];
        setUnread(rows.filter(n => n.status !== 'Read').length);
        setRecentNotifications(rows.slice(0, 5));
      }
      setLoading(false);
    }
    fetchData();
  }, []);
  const critical = alerts.filter(a => a.severity === 'Critical');
  if (loading) return <LoadingState variant="dashboard" message="Loading dashboard..." />;
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{userBranch}</p>
          <h2>{userName}</h2>
          <p className="text-ink/70">Branch Health: <strong>{analytics?.healthScore || 0}/100</strong></p>
        </div>
        <Link to={`${opsBase}/notifications`} className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-full transition-colors cursor-pointer" aria-label={`${unread} unread`}>
          <NavIcon name="bell" />{unread > 0 && <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex justify-center items-center rounded-full bg-red text-white text-[0.7rem] font-bold border-2 border-mint">{unread}</span>}
        </Link>
      </section>

      <Stats stats={[{
      label: 'Collection Rate',
      value: `${analytics?.collectionRateToday || kpi?.collectionRate || 0}%`
    }, {
      label: 'Route Compliance',
      value: `${analytics?.routeCompliance || 0}%`
    }, {
      label: 'Sales Visit Completion',
      value: `${analytics?.salesVisitCompletion || 0}%`
    }, {
      label: 'Overdue Accounts',
      value: String(kpi?.overdueCount || 0),
      title: 'Customers with an invoice past its due date.'
    }, {
      label: 'Stock Alerts',
      value: String(kpi?.stockAlertsCount || analytics?.stockAlertsCount || 0)
    }]} />

      {recentNotifications.length ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3 style={{ margin: 0 }}>Operational Updates</h3>
            <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/notifications`)}>
              Open inbox
            </button>
          </div>
          <ul className="notification-list" style={{ margin: 0 }}>
            {recentNotifications.map((n) => (
              <li key={n.notification_id} className={`notification-item${n.status === 'Read' ? '' : ' unread'}`}>
                <div>
                  <strong>{n.title}</strong>
                  <p className="muted">{n.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid two-up">
        <Card title="Daily Collection vs Target" sub="This week · click a point for payment records">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={collectionData?.daily || []}
              style={{ cursor: 'pointer' }}
              onClick={(state) => {
                const day = state?.activeLabel;
                if (!day) return;
                openApiDrilldown(
                  { type: 'collection_day', day },
                  {
                    title: 'Daily collections',
                    category: `Day: ${day}`,
                    dateRange: 'Last 7 days',
                    columnSet: 'collection',
                    legend: [
                      { label: 'Day', value: day },
                      { label: 'Collected', value: formatMoney(state?.activePayload?.find((p) => p.dataKey === 'amount')?.value || 0) },
                    ],
                    filenameBase: `collections-${day}`,
                  }
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="target" name="Target" stroke="#BADBE9" fill="#BADBE9" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="amount" name="Collected" stroke="#1A4162" fill="#1A4162" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Sales vs Target" sub="This week · click a bar for invoices">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={salesData?.weekly || []}
              style={{ cursor: 'pointer' }}
              onClick={(state) => {
                const day = state?.activeLabel;
                if (!day) return;
                openApiDrilldown(
                  { type: 'sales_day', day },
                  {
                    title: 'Daily sales invoices',
                    category: `Day: ${day}`,
                    dateRange: 'Last 7 days',
                    columnSet: 'sales',
                    legend: [
                      { label: 'Day', value: day },
                      { label: 'Actual', value: formatMoney(state?.activePayload?.find((p) => p.dataKey === 'actual')?.value || 0) },
                    ],
                    filenameBase: `sales-${day}`,
                  }
                );
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} /><Legend />
              <Bar dataKey="target" name="Target" fill="#BADBE9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#1A4162" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Delinquency Trend" sub="Weekly overdue accounts · click for current overdue list">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={delinquencyData?.delinquency || []}
              style={{ cursor: 'pointer' }}
              onClick={() => openApiDrilldown(
                { type: 'delinquency' },
                {
                  title: 'Overdue accounts',
                  category: 'Delinquency',
                  dateRange: 'Current',
                  columnSet: 'customers',
                  filenameBase: 'delinquency',
                }
              )}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" /><XAxis dataKey="week" tick={{
              fontSize: 12
            }} /><YAxis tick={{
              fontSize: 12
            }} /><Tooltip /><Legend />
              <Area type="monotone" dataKey="accounts" name="Overdue" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="rate" name="Rate %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Critical Alerts</h3>
            <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/alerts`)}>View All</button>
          </div>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {critical.slice(0, 4).map(a => <li key={a.id}><div><strong>{a.title}</strong><span className="text-ink/70">{a.category}</span></div><Severity severity={a.severity} /></li>)}
            {!critical.length ? <li className="text-ink/70">No critical alerts right now.</li> : null}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button className="button" type="button" onClick={() => navigate(`${opsBase}/field-operations`)}>Field Operations</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/field-activity-reports`)}>Field Reports</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/customers`)}>Customers</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/ci-approvals`)}>Approve CIs</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/leaflet`)}>Leaflet | OpenStreetMap</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/reports`)}>Reports</button>
      </div>
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}

// ── Field Operations (combined hub + tab navigation) ─────────────────────────
function FieldOperationsHub({
  navigate,
  showToast,
  pageType,
  opsBase
}) {
  const { drilldown, closeDrilldown, openLocalDrilldown } = useChartDrilldown({ showToast });
  const initialTab = pageType === 'collectorRoutes' ? 'collectors'
    : pageType === 'salesSchedules' ? 'sales'
      : pageType === 'routePerformance' ? 'performance'
        : 'overview';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const tabs = [{
    key: 'overview',
    label: 'Overview'
  }, {
    key: 'collectors',
    label: 'Collector Routes'
  }, {
    key: 'sales',
    label: 'Sales Schedules'
  }, {
    key: 'performance',
    label: 'Route Performance'
  }];
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [staffData, analyticsData] = await Promise.all([getBranchStaff(), getBranchAnalytics()]);
      if (staffData.success) setStaff(staffData.data);
      if (analyticsData.success) setAnalytics(analyticsData.data);
      setLoading(false);
    }
    fetchData();
  }, []);
  const collectorChart = staff.collectors.map(c => ({
    name: c.name.split(' ')[0],
    compliance: c.complianceScore,
    recovery: c.recoveryRate
  }));
  const salesChart = staff.salesAgents.map(a => ({
    name: a.name.split(' ')[0],
    visits: a.visitCompletionRate,
    conversion: a.conversionRate
  }));
  const pagination_staff_collectors = usePagination(staff.collectors);
  const paginated_staff_collectors = pagination_staff_collectors.paginatedData;
  const pagination_staff_sales = usePagination(staff.salesAgents);
  const paginated_staff_sales = pagination_staff_sales.paginatedData;
  if (loading) return <LoadingState variant="dashboard" message="Loading field operations..." />;
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && <>
        <Stats stats={[{
        label: 'Active Collectors',
        value: String(staff.collectors.length)
      }, {
        label: 'Active Sales Agents',
        value: String(staff.salesAgents.length)
      }, {
        label: 'Route Compliance',
        value: `${analytics?.routeCompliance || 0}%`
      }, {
        label: 'Sales Completion',
        value: `${analytics?.salesVisitCompletion || 0}%`
      }]} />
        <div className="grid two-up">
          <Card title="Collector Performance" sub="Compliance & recovery · click a bar">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={collectorChart}
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (!label) return;
                  const match = staff.collectors.filter((c) => String(c.name || '').split(' ')[0] === label);
                  openLocalDrilldown({
                    title: 'Collector performance',
                    category: label,
                    columnSet: 'staff',
                    rows: match.map((c) => ({
                      name: c.name,
                      complianceScore: c.complianceScore,
                      recoveryRate: c.recoveryRate,
                      status: c.status || 'Active',
                    })),
                    totals: [{ label: 'Collectors', value: match.length }],
                    filenameBase: `collector-${label}`,
                  });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                <XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="compliance" name="Compliance" fill="#1A4162" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovery" name="Recovery" fill="#0B1E30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Performance" sub="Visit completion & conversion · click a bar">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={salesChart}
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (!label) return;
                  const match = staff.salesAgents.filter((a) => String(a.name || '').split(' ')[0] === label);
                  openLocalDrilldown({
                    title: 'Sales agent performance',
                    category: label,
                    columnSet: 'staff',
                    rows: match.map((a) => ({
                      name: a.name,
                      visitCompletionRate: a.visitCompletionRate,
                      conversionRate: a.conversionRate,
                      status: a.status || 'Active',
                    })),
                    totals: [{ label: 'Agents', value: match.length }],
                    filenameBase: `agent-${label}`,
                  });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                <XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="visits" name="Visit Completion" fill="#1A4162" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversion" name="Conversion" fill="#0B1E30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Collector Performance Summary" sub="Current branch metrics">
          <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          padding: '12px 0'
        }}>
            {staff.collectors.slice(0, 4).map(c => <div key={c.id} style={{
            background: '#eef0f4',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #BADBE9'
          }}>
                <strong style={{
              fontSize: '0.9rem'
            }}>{c.name}</strong>
                <div style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: '0.85rem',
              color: '#5F7385'
            }}>
                  <span>Assigned: {c.accountsAssigned}</span>
                  <span>Visited: {c.accountsVisited}</span>
                  <span>Pending: {c.accountsPending}</span>
                  <span>Compliance: {c.complianceScore}%</span>
                  <span>Collected: {formatCurrency(c.collectionAmount)}</span>
                </div>
              </div>)}
          </div>
        </Card>
      </>}

      {tab === 'collectors' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header"><h3>Collectors <span className="text-ink/70">({staff.collectors.length})</span></h3></div>
          {staff.collectors.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Assigned</th>
                    <th>Visited</th>
                    <th>Pending</th>
                    <th>Compliance</th>
                    <th>Collected</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_staff_collectors.map(c => <tr key={c.id} className="clickable-row" onClick={() => navigate(`${opsBase}/field-operations/collectors/${c.id}`)}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.accountsAssigned}</td>
                      <td>{c.accountsVisited}</td>
                      <td>{c.accountsPending}</td>
                      <td>{c.complianceScore}%</td>
                      <td>{formatCurrency(c.collectionAmount)}</td>
                      <td className="table-actions" onClick={e => e.stopPropagation()}>
                        <button className="icon-action-button" type="button" title="Expand Route" onClick={() => navigate(`${opsBase}/field-operations/collectors/${c.id}`)}><NavIcon name="view" /></button>
                        <button className="icon-action-button" type="button" title="View on Map" onClick={() => navigate(`${opsBase}/leaflet`)}><NavIcon name="map" /></button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_staff_collectors} />
          </> : <EmptyState title="No collectors" description="Collectors assigned to this branch will appear here." />}
        </section>}

      {tab === 'sales' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header"><h3>Sales Agents <span className="text-ink/70">({staff.salesAgents.length})</span></h3></div>
          {staff.salesAgents.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Customers</th>
                    <th>Visits</th>
                    <th>Sales</th>
                    <th>Revenue</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_staff_sales.map(a => <tr key={a.id} className="clickable-row" onClick={() => navigate(`${opsBase}/field-operations/sales/${a.id}`)}>
                      <td><strong>{a.name}</strong></td>
                      <td>{a.customersAssigned}</td>
                      <td>{a.visitsCompleted}</td>
                      <td>{a.salesLogged}</td>
                      <td>{formatCurrency(a.totalSalesAmount)}</td>
                      <td className="table-actions" onClick={e => e.stopPropagation()}>
                        <button className="icon-action-button" type="button" title="Expand Schedule" onClick={() => navigate(`${opsBase}/field-operations/sales/${a.id}`)}><NavIcon name="view" /></button>
                        <button className="icon-action-button" type="button" title="View on Map" onClick={() => navigate(`${opsBase}/leaflet`)}><NavIcon name="map" /></button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_staff_sales} />
          </> : <EmptyState title="No sales agents" description="Sales agents assigned to this branch will appear here." />}
        </section>}

      {tab === 'performance' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Route Performance Summary</h3></div>
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Staff</th><th>Type</th><th>Compliance</th><th>Recovery / Revenue</th><th>Missed</th></tr></thead>
              <tbody>
                {paginated_staff_collectors.map(c => <tr key={c.id}><td>{c.name}</td><td>Collector</td><td>{c.complianceScore}%</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>)}
                {staff.salesAgents.map(a => <tr key={a.id}><td>{a.name}</td><td>Sales</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>—</td></tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_staff_collectors} /></>
        </section>}
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}
function manilaDateInputValue() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function CollectorDetailPage({
  collectorId,
  navigate,
  opsBase,
  showToast,
}) {
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [routeDetail, setRouteDetail] = useState(null);
  const [sawRows, setSawRows] = useState([]);
  const [sawMeta, setSawMeta] = useState(null);
  const [assignedIds, setAssignedIds] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [scheduledDate, setScheduledDate] = useState(manilaDateInputValue);
  const [assignBusy, setAssignBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function reloadSaw(date) {
    const sawRes = await fetchCollectorSawPriority(collectorId, { scheduled_date: date });
    if (sawRes.success) {
      setSawRows(sawRes.data || []);
      setSawMeta(sawRes.meta || null);
      setAssignedIds(new Set((sawRes.meta?.assignedCustomerIds || []).map(String)));
    }
  }
  useEffect(() => {
    async function load() {
      setLoading(true);
      const date = scheduledDate;
      const [staffResult, detailResult, sawRes] = await Promise.all([
        getBranchStaff(),
        getBranchCollectorDetail(collectorId),
        fetchCollectorSawPriority(collectorId, { scheduled_date: date }),
      ]);
      if (staffResult.success) setStaff(staffResult.data);
      if (detailResult.success) setRouteDetail(detailResult.data);
      if (sawRes.success) {
        setSawRows(sawRes.data || []);
        setSawMeta(sawRes.meta || null);
        setAssignedIds(new Set((sawRes.meta?.assignedCustomerIds || []).map(String)));
      }
      setLoading(false);
    }
    load();
  }, [collectorId, scheduledDate]);
  const c = staff.collectors.find(x => x.id === String(collectorId));
  const route = routeDetail?.route || c?.route || [];
  const pagination_c_route = usePagination(route);
  const paginated_c_route = pagination_c_route.paginatedData;
  const pagination_saw = usePagination(sawRows);
  const paginated_saw = pagination_saw.paginatedData;
  const mapCenter = routeDetail?.mapMarkers?.[0]?.position || [7.1907, 125.4553];

  function toggleSelected(customerId) {
    const id = String(customerId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitAssignment(payload) {
    setAssignBusy(true);
    const res = await assignCollectorCollectionRoute(collectorId, {
      scheduled_date: scheduledDate,
      ...payload,
    });
    setAssignBusy(false);
    if (res.success) {
      showToast?.(res.message || 'Collection visits scheduled.', 'success');
      setSelectedIds(new Set());
      await reloadSaw(scheduledDate);
      const detailResult = await getBranchCollectorDetail(collectorId);
      if (detailResult.success) setRouteDetail(detailResult.data);
    } else {
      showToast?.(res.message || 'Could not assign visits.', 'error');
    }
  }

  if (loading) return <LoadingState variant="detail" message="Loading collector details..." />;
  if (!c) return <EmptyState title="Collector not found" actionLabel="Back" onAction={() => navigate(`${opsBase}/field-operations`)} />;
  return <div className="page">
      <Stats stats={[{
      label: 'Compliance',
      value: `${c.complianceScore}%`
    }, {
      label: 'Success Rate',
      value: `${c.collectionSuccessRate}%`
    }, {
      label: 'Avg Visit',
      value: c.avgVisitDuration
    }, {
      label: 'Recovery',
      value: `${c.recoveryRate}%`
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <div>
            <h3>Assign today&apos;s collection route</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              SAW ranking (balance 40%, overdue 30%, distance 30%) · {sawMeta?.stats?.ranked ?? sawRows.length} eligible
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-2 text-sm">
              Date
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
              disabled={assignBusy}
              onClick={() => submitAssignment({ assign_top_n: 5 })}
            >
              Assign top 5
            </button>
            <button
              className="button"
              type="button"
              disabled={assignBusy || selectedIds.size === 0}
              onClick={() => submitAssignment({ customer_ids: [...selectedIds].map(Number) })}
            >
              Assign selected ({selectedIds.size})
            </button>
          </div>
        </div>
        {sawRows.length ? (
          <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Rank</th>
                    <th>Customer</th>
                    <th>Balance</th>
                    <th>Days overdue</th>
                    <th>Distance</th>
                    <th>SAW</th>
                    <th>Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_saw.map((row) => {
                    const id = String(row.customer_id);
                    const already = assignedIds.has(id);
                    return (
                      <tr key={id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            disabled={already}
                            onChange={() => toggleSelected(id)}
                            aria-label={`Select ${row.customer_name}`}
                          />
                        </td>
                        <td><strong>#{row.rank}</strong></td>
                        <td>{row.customer_name}</td>
                        <td>{formatCurrency(row.outstanding_balance || 0)}</td>
                        <td>{row.days_overdue ?? 0}</td>
                        <td>{Number(row.distance_km) ? `${Number(row.distance_km).toFixed(1)} km` : '—'}</td>
                        <td>{row.score != null ? Number(row.score).toFixed(3) : '—'}</td>
                        <td>{already ? <StatusBadge status="Pending" /> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_saw} />
          </>
        ) : (
          <EmptyState
            title="No SAW-eligible customers"
            description="Active accounts with balance, coordinates, and open invoices will appear here."
          />
        )}
      </section>
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Route Timeline</h3><span className="text-ink/70">GPS: {routeDetail?.gpsAttendance ?? c.gpsAttendance ? 'Active' : 'Off'}</span></div>
        {route.length ? <><div className="corvex-table-wrapper"><table className="corvex-table"><thead><tr><th>Account</th><th>Status</th><th>Time</th><th>Amount</th></tr></thead><tbody>{paginated_c_route.map(r => <tr key={`${r.account}-${r.time}`}><td>{r.account}</td><td><StatusBadge status={r.status} /></td><td>{formatDisplayDate(r.time)}</td><td>{r.amount ? formatCurrency(r.amount) : '—'}</td></tr>)}</tbody></table></div><Pagination {...pagination_c_route} /></> : <EmptyState title="No route data" description="Collection visits will appear here once scheduled." />}
        <div style={{
        marginTop: 16
      }}>
          <LeafletMap center={mapCenter} zoom={13} height={400} polylines={routeDetail?.polylines || []} markers={routeDetail?.mapMarkers || []} />
        </div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations`)}>Back</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/leaflet`)}>View on Map</button>
      </div>
    </div>;
}
function SalesAgentDetailPage({
  agentId,
  navigate,
  opsBase
}) {
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [detail, setDetail] = useState({ customers: [], productPerformance: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [staffResult, detailResult] = await Promise.all([
        getBranchStaff(),
        getBranchSalesAgentDetail(agentId),
      ]);
      if (staffResult.success) setStaff(staffResult.data);
      if (detailResult.success && detailResult.data) setDetail(detailResult.data);
      setLoading(false);
    }
    load();
  }, [agentId]);
  const a = staff.salesAgents.find(x => x.id === String(agentId));
  const customers = detail.customers?.length ? detail.customers : a?.customers || [];
  const productPerformance = detail.productPerformance?.length ? detail.productPerformance : a?.productPerformance || [];
  const pagination_customers = usePagination(customers);
  const pagination_products = usePagination(productPerformance);
  if (loading) return <LoadingState variant="detail" message="Loading agent details..." />;
  if (!a) return <EmptyState title="Agent not found" actionLabel="Back" onAction={() => navigate(`${opsBase}/field-operations`)} />;
  return <div className="page">
      <Stats stats={[{
      label: 'Visit Completion',
      value: `${a.visitCompletionRate}%`
    }, {
      label: 'Conversion',
      value: `${a.conversionRate}%`
    }, {
      label: 'Avg Sale',
      value: formatCurrency(a.avgSaleValue)
    }, {
      label: 'New Customers',
      value: String(a.newCustomersAcquired)
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        {customers.length ? <>
          <div className="list-section-header"><h3>Customers <span className="text-ink/70">({customers.length})</span></h3></div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Customer</th></tr></thead>
              <tbody>
                {pagination_customers.paginatedData.map(c => <tr key={c}><td>{c}</td></tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination_customers} />
        </> : null}
        {productPerformance.length ? <>
          <div className="list-section-header" style={{ marginTop: customers.length ? 16 : 0 }}>
            <h3>Product Performance <span className="text-ink/70">({productPerformance.length})</span></h3>
          </div>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>Product</th><th>Units</th></tr></thead>
              <tbody>
                {pagination_products.paginatedData.map(p => <tr key={p.product}><td><strong>{p.product}</strong></td><td>{p.units} units</td></tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination_products} />
        </> : null}
        {!customers.length && !productPerformance.length ? <EmptyState title="No activity yet" description="Customers and sales mix will appear after visits and invoices are logged." /> : null}
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/field-operations`)}>Back</button>
      </div>
    </div>;
}

// ── Reports & Analytics (combined with tab nav) ───────────────────────────────
function ReportsHubPage({
  navigate,
  showToast,
  pageType
}) {
  const { drilldown, closeDrilldown, openApiDrilldown, openLocalDrilldown } = useChartDrilldown({ showToast });
  const initialTab = pageType === 'reportSales' ? 'sales'
    : pageType === 'reportInventory' ? 'inventory'
      : pageType === 'reportDelinquency' ? 'delinquency'
        : 'collection';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [collectionData, setCollectionData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [delinquencyData, setDelinquencyData] = useState(null);
  const [complianceData, setComplianceData] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const tabs = [{
    key: 'collection',
    label: 'Collections'
  }, {
    key: 'sales',
    label: 'Sales'
  }, {
    key: 'inventory',
    label: 'Inventory'
  }, {
    key: 'delinquency',
    label: 'Delinquency'
  }, {
    key: 'invoices',
    label: 'Sales Invoices'
  }];
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [staffResult, collectionResult, salesResult, inventoryResult, delinquencyResult, complianceResult, kpiResult, invoiceResult] = await Promise.all([getBranchStaff(), getReportCollection(), getReportSales(), getReportInventory(), getReportDelinquency(), getReportCompliance(), getReportKPI(), getReportInvoices()]);
      if (staffResult.success) setStaff(staffResult.data || {
        collectors: [],
        salesAgents: []
      });
      if (collectionResult.success) setCollectionData(collectionResult.data);
      if (salesResult.success) setSalesData(salesResult.data);
      if (inventoryResult.success) setInventoryData(inventoryResult.data);
      if (delinquencyResult.success) setDelinquencyData(delinquencyResult.data);
      if (complianceResult.success) setComplianceData(complianceResult.data);
      if (kpiResult.success) setKpi(kpiResult.data);
      if (invoiceResult.success) setInvoices(invoiceResult.data || []);
      setLoading(false);
    }
    load();
  }, []);
  const collectorAmt = (staff?.collectors || []).map(c => ({
    name: c.name.split(' ')[0],
    amount: c.collectionAmount,
    compliance: c.complianceScore
  }));
  const agentRev = (staff?.salesAgents || []).map(a => ({
    name: a.name.split(' ')[0],
    revenue: a.totalSalesAmount,
    visits: a.visitCompletionRate
  }));
  const pagination_inventoryData_lowStockItems = usePagination(inventoryData?.lowStockItems || []);
  const paginated_inventoryData_lowStockItems = pagination_inventoryData_lowStockItems.paginatedData;
  const pagination_invoices = usePagination(invoices || []);
  const paginated_invoices = pagination_invoices.paginatedData;
  if (loading) return <LoadingState message="Loading reports..." />;
  const exportBranchReport = (format) => {
    let rows = [];
    if (tab === 'collection') rows = (collectionData?.daily || []).map((row) => ({ day: row.day, collected: row.amount, target: row.target }));
    else if (tab === 'sales') rows = (salesData?.weekly || []).map((row) => ({ day: row.day, actual: row.actual, target: row.target, invoices: row.invoices }));
    else if (tab === 'inventory') rows = (inventoryData?.lowStockItems || []).map((row) => ({ product: row.product_name, sku: row.sku, stock: row.available_stock, status: row.status }));
    else if (tab === 'delinquency') rows = (delinquencyData?.delinquency || []).map((row) => ({ week: row.week, accounts: row.accounts, rate: row.rate }));
    else rows = (invoices || []).map((row) => ({ invoice: row.invoice_number, customer: row.customer_name, amount: row.total_amount, date: row.invoices_date, status: row.status }));
    const ok = exportRows(rows, { format, filename: `branch-${tab}-report`, title: `Branch ${tab} Report` });
    if (ok) showToast(format === 'pdf' ? 'Report exported as PDF.' : 'Excel file downloaded.', 'success');
    else showToast('Nothing to export.', 'error');
  };
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => { setTab(t.key); setViewingInvoiceId(null); }}>{t.label}</button>)}
      </div>
      <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      marginBottom: 20
    }}>
        <button className="button secondary" type="button" onClick={() => exportBranchReport('pdf')}>Export PDF</button>
        <button className="button secondary" type="button" onClick={() => exportBranchReport('excel')}>Export Excel</button>
      </div>

      {tab === 'collection' && <>
          <Stats stats={[{
        label: 'Collections (7 days)',
        value: formatCurrency(collectionData?.summary?.totalCollected || 0)
      }, {
        label: 'Collection Rate',
        value: `${collectionData?.summary?.collectionRate || 0}%`
      }, {
        label: 'Target',
        value: formatCurrency(collectionData?.summary?.totalTarget || 0)
      }, {
        label: 'Active Days',
        value: String(collectionData?.summary?.daysWithCollections || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Daily Collection vs Target" sub="Last 7 days · click for payment records">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={collectionData?.daily || []}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const day = state?.activeLabel;
                    if (!day) return;
                    openApiDrilldown(
                      { type: 'collection_day', day },
                      { title: 'Daily collections', category: `Day: ${day}`, dateRange: 'Last 7 days', columnSet: 'collection', filenameBase: `collections-${day}` }
                    );
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="target" name="Target" stroke="#BADBE9" fill="#BADBE9" strokeWidth={2} strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="amount" name="Collected" stroke="#1A4162" fill="#1A4162" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Collector Amounts" sub="Click a bar for collector summary">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={collectorAmt}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const label = state?.activeLabel;
                    if (!label) return;
                    const match = (staff.collectors || []).filter((c) => String(c.name || '').startsWith(label) || String(c.name || '').split(' ')[0] === label);
                    openLocalDrilldown({
                      title: 'Collector performance',
                      category: label,
                      dateRange: 'Current branch metrics',
                      columnSet: 'staff',
                      rows: (match.length ? match : collectorAmt.filter((r) => r.name === label)).map((c) => ({
                        name: c.name,
                        complianceScore: c.complianceScore ?? c.compliance,
                        recoveryRate: c.recoveryRate ?? c.recovery,
                        status: c.status || 'Active',
                      })),
                      totals: [{ label: 'Collectors', value: match.length || 1 }],
                      filenameBase: `collector-${label}`,
                    });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="name" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="amount" name="Collected (₱)" fill="#1A4162" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="compliance" name="Compliance %" fill="#0B1E30" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>}

      {tab === 'sales' && <>
          <Stats stats={[{
        label: 'Sales (7 days)',
        value: formatCurrency(salesData?.summary?.totalActual || 0)
      }, {
        label: 'Sales Efficiency',
        value: `${salesData?.summary?.salesEfficiency || 0}%`
      }, {
        label: 'Invoices',
        value: String(salesData?.summary?.totalInvoices || 0)
      }, {
        label: 'Target',
        value: formatCurrency(salesData?.summary?.totalTarget || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Sales vs Target" sub="Last 7 days · click for invoices">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={salesData?.weekly || []}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const day = state?.activeLabel;
                    if (!day) return;
                    openApiDrilldown(
                      { type: 'sales_day', day },
                      { title: 'Daily sales invoices', category: `Day: ${day}`, dateRange: 'Last 7 days', columnSet: 'sales', filenameBase: `sales-${day}` }
                    );
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="#BADBE9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#1A4162" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Agent Revenue & Visits" sub="Click a bar for agent summary">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={agentRev}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const label = state?.activeLabel;
                    if (!label) return;
                    const match = (staff.salesAgents || []).filter((a) => String(a.name || '').startsWith(label) || String(a.name || '').split(' ')[0] === label);
                    openLocalDrilldown({
                      title: 'Sales agent performance',
                      category: label,
                      dateRange: 'Current branch metrics',
                      columnSet: 'staff',
                      rows: (match.length ? match : agentRev.filter((r) => r.name === label)).map((a) => ({
                        name: a.name,
                        visitCompletionRate: a.visitCompletionRate ?? a.visits,
                        conversionRate: a.conversionRate ?? a.conversion,
                        status: a.status || 'Active',
                      })),
                      totals: [{ label: 'Agents', value: match.length || 1 }],
                      filenameBase: `agent-${label}`,
                    });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="name" tick={{
                fontSize: 12
              }} />
                  <YAxis yAxisId="l" tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#1A4162" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="r" dataKey="visits" name="Visit %" fill="#0B1E30" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>}

      {tab === 'inventory' && <>
          <Stats stats={[{
        label: 'Inventory Health',
        value: `${inventoryData?.healthPct || 0}%`
      }, {
        label: 'Stock Alerts',
        value: String(inventoryData?.alertsCount || 0)
      }, {
        label: 'Total Products',
        value: String(inventoryData?.totalProducts || 0)
      }, {
        label: 'Out of Stock',
        value: String(inventoryData?.summary?.outOfStock || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Inventory Status" sub="Click a segment for matching stock rows">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[{
                name: 'Sufficient',
                value: inventoryData?.summary?.sufficient || 0,
                color: '#1A4162'
              }, {
                name: 'Low Stock',
                value: inventoryData?.summary?.low || 0,
                color: '#f59e0b'
              }, {
                name: 'Critical',
                value: inventoryData?.summary?.critical || 0,
                color: '#ef4444'
              }, {
                name: 'Out of Stock',
                value: inventoryData?.summary?.outOfStock || 0,
                color: '#5F7385'
              }]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({
                name,
                value
              }) => `${name}: ${value}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(slice) => {
                      const status = slice?.name;
                      if (!status) return;
                      openApiDrilldown(
                        { type: 'inventory_status', status },
                        { title: 'Inventory records', category: status, dateRange: 'Current stock', columnSet: 'inventory', filenameBase: `inventory-${status}` }
                      );
                    }}
                  >
                    {[{
                  name: 'Sufficient',
                  color: '#1A4162'
                }, {
                  name: 'Low Stock',
                  color: '#f59e0b'
                }, {
                  name: 'Critical',
                  color: '#ef4444'
                }, {
                  name: 'Out of Stock',
                  color: '#5F7385'
                }].map(entry => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Items Requiring Attention">
              <><div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Status</th></tr></thead>
                  <tbody>
                    {(inventoryData?.lowStockItems || []).length ? paginated_inventoryData_lowStockItems.map(item => <tr key={item.sku}>
                        <td>{item.product_name}</td>
                        <td>{item.sku}</td>
                        <td>{item.available_stock}</td>
                        <td><StatusBadge status={item.status} /></td>
                      </tr>) : <tr><td colSpan={4}>All products are at sufficient stock levels.</td></tr>}
                  </tbody>
                </table>
              </div><Pagination {...pagination_inventoryData_lowStockItems} /></>
            </Card>
          </div>
        </>}

      {tab === 'delinquency' && <>
          <Stats stats={[{
        label: 'Overdue Accounts',
        value: String(delinquencyData?.summary?.totalOverdue || 0)
      }, {
        label: 'Avg Rate',
        value: `${delinquencyData?.summary?.avgRate || 0}%`
      }, {
        label: 'Trend',
        value: delinquencyData?.summary?.trend || 'stable'
      }, {
        label: 'Branch Health',
        value: `${kpi?.healthScore || 0}/100`
      }]} />
          <div className="grid two-up">
            <Card title="Delinquency Trend" sub="Weekly overdue accounts · click for overdue list">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={delinquencyData?.delinquency || []}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openApiDrilldown(
                    { type: 'delinquency' },
                    { title: 'Overdue accounts', category: 'Delinquency', dateRange: 'Current', columnSet: 'customers', filenameBase: 'delinquency' }
                  )}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="week" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 12
              }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="accounts" name="Overdue" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="rate" name="Rate %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Route Compliance Trend" sub="Weekly per collector">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={complianceData?.compliance?.[0]?.data?.map((d, i) => {
              const point = {
                week: d.week
              };
              complianceData.compliance.forEach(c => {
                point[c.name] = c.data[i]?.rate || 0;
              });
              return point;
            }) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" />
                  <XAxis dataKey="week" tick={{
                fontSize: 12
              }} />
                  <YAxis domain={[80, 100]} unit="%" tick={{
                fontSize: 12
              }} />
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                  {complianceData?.compliance?.map((c, i) => <Line key={c.name} type="monotone" dataKey={c.name} stroke={['#1A4162', '#0B1E30', '#5F7385', '#f59e0b', '#ef4444'][i % 5]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>}

      {tab === 'invoices' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4" style={{
        marginBottom: 8
      }}>
            <h3>Sales Invoices</h3>
          </div>

          {invoices.length ? <>
              <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 16,
          margin: '4px 0 20px'
        }}>
                {[{
            label: 'Total Invoices',
            value: String(invoices.length)
          }, {
            label: 'Confirmed',
            value: String(invoices.filter(i => i.status === 'Confirmed').length)
          }, {
            label: 'Pending Review',
            value: String(invoices.filter(i => i.status === 'Pending Review').length)
          }, {
            label: 'Total Value',
            value: formatCurrency(invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0))
          }].map(s => <div key={s.label} style={{
            padding: 14,
            background: '#eef0f4',
            border: '1px solid #BADBE9',
            borderRadius: 8
          }}>
                    <span style={{
              fontSize: '0.78rem',
              color: '#5F7385',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.03em'
            }}>{s.label}</span>
                    <strong style={{
              display: 'block',
              fontSize: '1.35rem',
              marginTop: 4
            }}>{s.value}</strong>
                  </div>)}
              </div>

              <><div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Invoice Date</th>
                      <th>Total Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated_invoices.map(inv => {
                  const invoiceKey = inv.invoice_number || inv.sales_invoices_id;
                  return <tr
                    key={inv.sales_invoices_id}
                    className="clickable-row"
                    onClick={() => setViewingInvoiceId(invoiceKey)}
                  >
                          <td style={{
                      fontFamily: 'monospace',
                      fontSize: '0.82rem'
                    }}>{inv.invoice_number}</td>
                          <td>{inv.customer_name || '—'}</td>
                          <td>{formatDisplayDate(inv.invoices_date)}</td>
                          <td style={{
                      fontWeight: 600
                    }}>{formatCurrency(Number(inv.total_amount))}</td>
                          <td>
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="table-actions" onClick={e => e.stopPropagation()}>
                            <button
                              className="icon-action-button"
                              type="button"
                              title="View"
                              onClick={() => setViewingInvoiceId(invoiceKey)}
                            >
                              <NavIcon name="view" />
                            </button>
                          </td>
                        </tr>;
                })}
                  </tbody>
                </table>
              </div><Pagination {...pagination_invoices} /></>
            </> : <EmptyState title="No invoices found" description="No sales invoices exist for this branch yet." />}
        </section>}

      {viewingInvoiceId ? <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Sales invoice details"
        onClick={() => setViewingInvoiceId(null)}
      >
          <div
            className="modal-content"
            style={{
              maxWidth: 880,
              width: 'min(880px, 100%)',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <InvoiceDetailsPage
              invoiceId={viewingInvoiceId}
              navigate={navigate}
              showToast={showToast}
              embedded
              onBack={() => setViewingInvoiceId(null)}
            />
          </div>
        </div> : null}

      {tab !== 'invoices' && <div style={{
      marginTop: 24
    }}>
          <Card title="Overall KPI Summary">
            <Stats stats={[{
              label: 'Health Score',
              value: `${kpi?.healthScore || 0}/100`
            }, {
              label: 'Active Collectors',
              value: String(kpi?.activeCollectors || 0)
            }, {
              label: 'Active Sales Agents',
              value: String(kpi?.activeSalesAgents || 0)
            }, {
              label: 'Total Customers',
              value: String(kpi?.totalCustomers || 0)
            }, {
              label: 'Outstanding Balance',
              value: formatCurrency(kpi?.totalOutstanding || 0)
            }, {
              label: 'Credit Limit',
              value: formatCurrency(kpi?.totalCreditLimit || 0),
              title: 'Total credit limit on customer accounts.'
            }, {
              label: 'Credit Used',
              value: formatCurrency(kpi?.creditUsed || 0),
              title: 'Outstanding balance counted against those limits.'
            }, {
              label: 'Credit Remaining',
              value: formatCurrency(kpi?.creditRemaining || 0),
              title: 'Credit limit minus the outstanding balance.'
            }, {
              label: 'Collections (7d)',
              value: formatCurrency(kpi?.totalCollectionsAmount || 0)
            }, {
              label: 'Sales (7d)',
              value: formatCurrency(kpi?.totalSalesAmount || 0)
            }, {
              label: 'Inventory Health',
              value: `${kpi?.inventoryHealth || 0}%`,
              title: 'In-stock items ÷ monitored items × 100.'
            }]} />
          </Card>
        </div>}
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}

// ── Staff Performance (improved) ──────────────────────────────────────────────
function StaffPerformancePage({
  navigate,
  pageType
}) {
  const initialTab = pageType === 'staffCollectors' ? 'collectors'
    : pageType === 'staffSales' ? 'sales'
      : pageType === 'staffScorecards' ? 'scorecards'
        : 'overview';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [period, setPeriod] = useState('Daily');
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [complianceData, setComplianceData] = useState(null);
  const tabs = [{
    key: 'overview',
    label: 'Overview'
  }, {
    key: 'collectors',
    label: 'Collectors'
  }, {
    key: 'sales',
    label: 'Sales Agents'
  }, {
    key: 'scorecards',
    label: 'Scorecards'
  }];
  useEffect(() => {
    async function load() {
      const [staffResult, complianceResult] = await Promise.all([getBranchStaff(), getReportCompliance()]);
      if (staffResult.success) setStaff(staffResult.data);
      if (complianceResult.success) setComplianceData(complianceResult.data);
    }
    load();
  }, []);
  const topCollector = [...staff.collectors].sort((a, b) => b.complianceScore - a.complianceScore)[0];
  const topAgent = [...staff.salesAgents].sort((a, b) => b.totalSalesAmount - a.totalSalesAmount)[0];
  const combined = [...staff.collectors.map(c => ({
    name: c.name,
    role: 'Collector',
    score: c.complianceScore,
    metric: `${c.recoveryRate}% recovery`
  })), ...staff.salesAgents.map(a => ({
    name: a.name,
    role: 'Sales',
    score: a.visitCompletionRate,
    metric: formatCurrency(a.totalSalesAmount)
  }))].sort((a, b) => b.score - a.score);
  const collectorBar = staff.collectors.map(c => ({
    name: c.name.split(' ')[0],
    score: c.complianceScore,
    recovery: c.recoveryRate,
    missed: c.missedVisits
  }));
  const salesBar = staff.salesAgents.map(a => ({
    name: a.name.split(' ')[0],
    visits: a.visitCompletionRate,
    conversion: a.conversionRate,
    newCustomers: a.newCustomersAcquired
  }));
  const complianceChartData = complianceData?.compliance?.[0]?.data?.map((d, i) => {
    const point = {
      week: d.week
    };
    complianceData.compliance.forEach(c => {
      point[c.name] = c.data[i]?.rate || 0;
    });
    return point;
  }) || [];
  const pagination_____staff_collectors__sort__a_b___b_complianceScore_a_complianceScore_ = usePagination([...staff.collectors].sort((a, b) => b.complianceScore - a.complianceScore));
  const paginated_____staff_collectors__sort__a_b___b_complianceScore_a_complianceScore_ = pagination_____staff_collectors__sort__a_b___b_complianceScore_a_complianceScore_.paginatedData;
  const pagination_____staff_salesAgents__sort__a_b___b_totalSalesAmount_a_totalSalesAmount_ = usePagination([...staff.salesAgents].sort((a, b) => b.totalSalesAmount - a.totalSalesAmount));
  const paginated_____staff_salesAgents__sort__a_b___b_totalSalesAmount_a_totalSalesAmount_ = pagination_____staff_salesAgents__sort__a_b___b_totalSalesAmount_a_totalSalesAmount_.paginatedData;
  const pagination_scorecards = usePagination(combined);
  const paginated_scorecards = pagination_scorecards.paginatedData;
  return <div className="page">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && <>
        <Stats stats={[{
        label: 'Active Collectors',
        value: String(staff.collectors.length)
      }, {
        label: 'Active Sales Agents',
        value: String(staff.salesAgents.length)
      }, {
        label: 'Top Collector',
        value: topCollector ? topCollector.name.split(' ')[0] : '—'
      }, {
        label: 'Top Sales Agent',
        value: topAgent ? topAgent.name.split(' ')[0] : '—'
      }]} />
        <div className="grid two-up">
          <Card title="Collector Scorecard" sub="Compliance & recovery rates">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" /><XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="score" name="Compliance" fill="#1A4162" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovery" name="Recovery" fill="#0B1E30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Scorecard" sub="Visit completion & conversion">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" /><XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="visits" name="Visit Completion" fill="#1A4162" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversion" name="Conversion" fill="#0B1E30" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Route Compliance Trend" sub="Weekly per collector">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={complianceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#BADBE9" /><XAxis dataKey="week" tick={{
              fontSize: 12
            }} /><YAxis domain={[80, 100]} unit="%" tick={{
              fontSize: 12
            }} /><Tooltip formatter={v => `${v}%`} /><Legend />
              {complianceData?.compliance?.map((c, i) => <Line key={c.name} type="monotone" dataKey={c.name} stroke={['#1A4162', '#0B1E30', '#5F7385', '#f59e0b', '#ef4444'][i % 5]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </>}

      {tab === 'collectors' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Collector Rankings</h3>
            <div className="segmented-control">
              {['Daily', 'Weekly', 'Monthly'].map(p => <button key={p} className={period === p ? 'segment active' : 'segment'} type="button" onClick={() => setPeriod(p)}>{p}</button>)}
            </div>
          </div>
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>#</th><th>Collector</th><th>Compliance</th><th>Collections</th><th>Recovery</th><th>Missed</th></tr></thead>
              <tbody>
                {paginated_____staff_collectors__sort__a_b___b_complianceScore_a_complianceScore_.map((c, i) => <tr key={c.id}><td>{i + 1}</td><td>{c.name}</td><td>{c.complianceScore}%</td><td>{formatCurrency(c.collectionAmount)}</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_____staff_collectors__sort__a_b___b_complianceScore_a_complianceScore_} /></>
        </section>}

      {tab === 'sales' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Sales Agent Rankings</h3>
            <div className="segmented-control">
              {['Daily', 'Weekly', 'Monthly'].map(p => <button key={p} className={period === p ? 'segment active' : 'segment'} type="button" onClick={() => setPeriod(p)}>{p}</button>)}
            </div>
          </div>
          <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead><tr><th>#</th><th>Agent</th><th>Visit Completion</th><th>Revenue</th><th>New Customers</th><th>Sales</th></tr></thead>
              <tbody>
                {paginated_____staff_salesAgents__sort__a_b___b_totalSalesAmount_a_totalSalesAmount_.map((a, i) => <tr key={a.id}><td>{i + 1}</td><td>{a.name}</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>{a.newCustomersAcquired}</td><td>{a.salesLogged}</td></tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_____staff_salesAgents__sort__a_b___b_totalSalesAmount_a_totalSalesAmount_} /></>
        </section>}

      {tab === 'scorecards' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header"><h3>Overall Rankings <span className="text-ink/70">({combined.length})</span></h3></div>
          {combined.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Score</th>
                    <th>Metric</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_scorecards.map((s, i) => <tr key={`${s.role}-${s.name}`}>
                      <td>#{(pagination_scorecards.currentPage - 1) * 10 + i + 1}</td>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.role}</td>
                      <td>{s.score}%</td>
                      <td>{s.metric}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_scorecards} />
          </> : <EmptyState title="No rankings yet" description="Staff scorecards will appear once performance data is available." />}
        </section>}
    </div>;
}

// ── CI Queue ──────────────────────────────────────────────────────────────────
function CIQueuePage({
  navigate,
  showToast,
  opsBase
}) {
  const [filter, setFilter] = useState('Pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    const res = await fetchCreditInvestigations({ status: filter === 'All' ? undefined : filter });
    if (res.success) setItems((res.data || []).map(mapCreditInvestigationRow));
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [filter]);
  const filtered = items;
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  const handlePatch = async (ci, status, rejectionReason) => {
    const result = await patchCreditInvestigation(ci.ciId, { status, rejection_reason: rejectionReason });
    if (result.success) {
      showToast(`CI ${status.toLowerCase()} for ${ci.customerName}.`, status === 'Rejected' ? 'error' : 'success');
      reload();
    } else showToast(result.message || 'Action failed.', 'error');
  };
  if (loading && !items.length) return <LoadingState message="Loading credit investigations..." />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Credit Investigation Queue</h3>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="segmented-control">
            {['Pending', 'Approved', 'Rejected', 'All'].map(f => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}
          </div>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper"><table className="corvex-table">
            <thead><tr><th>Customer</th><th>Submitted By</th><th>Date</th><th>Delinquency</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{paginated_filtered.map(ci => <tr key={ci.id}><td>{ci.customerName}</td><td>{ci.submittedBy}</td><td>{formatDisplayDate(ci.submissionDate)}</td><td><StatusBadge status={ci.delinquencyStatus} /></td><td><StatusBadge status={ci.status} /></td><td className="table-actions">
              <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`${opsBase}/ci-approvals/${ci.id}`)}><NavIcon name="view" /></button>
              {ci.status === 'Pending' && <><button className="icon-action-button" type="button" title="Approve" onClick={() => handlePatch(ci, 'Approved')}><NavIcon name="check" /></button><button className="icon-action-button danger" type="button" title="Reject" onClick={() => {
                const reason = window.prompt('Rejection reason (required):');
                if (!reason?.trim()) {
                  showToast('Reason required.', 'error');
                  return;
                }
                handlePatch(ci, 'Rejected', reason.trim());
              }}><NavIcon name="close" /></button></>}
            </td></tr>)}</tbody>
          </table></div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No CI records" description="No items match this filter." />}
      </section>
    </div>;
}
function CIDetailPage({
  ciId,
  navigate,
  showToast,
  opsBase
}) {
  const [ci, setCi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchCreditInvestigationById(ciId);
      if (res.success && res.data) setCi(mapCreditInvestigationRow(res.data));
      else setCi(null);
      setLoading(false);
    }
    load();
  }, [ciId]);
  const pagination_ci_paymentHistory = usePagination(ci?.paymentHistory || []);
  const paginated_ci_paymentHistory = pagination_ci_paymentHistory.paginatedData;
  const applyStatus = async (status, rejectionReason) => {
    const result = await patchCreditInvestigation(ciId, { status, rejection_reason: rejectionReason });
    if (result.success) {
      showToast(`CI ${status.toLowerCase()}.`, status === 'Rejected' ? 'error' : 'success');
      navigate(`${opsBase}/ci-approvals`);
    } else showToast(result.message || 'Action failed.', 'error');
  };
  if (loading) return <LoadingState message="Loading credit investigation..." />;
  if (!ci) return <EmptyState title="CI not found" actionLabel="Back" onAction={() => navigate(`${opsBase}/ci-approvals`)} />;
  return <div className="page">
      <Stats stats={[{
      label: 'Customer',
      value: ci.customerName
    }, {
      label: 'Risk Score',
      value: String(ci.riskScore)
    }, {
      label: 'Delinquency',
      value: ci.delinquencyStatus
    }, {
      label: 'Map Zone',
      value: ci.leafletClassification
    }]} />
      <section className="panel content-panel relative overflow-hidden">
        <DetailRowsTable rows={[
          { label: 'Purpose', value: ci.purpose || '—' },
          { label: 'Monthly Income', value: formatCurrency(ci.monthlyIncome) },
          { label: 'Business Type', value: ci.businessType || '—' },
          { label: 'References', value: ci.references || '—' },
          { label: 'Remarks', value: ci.formRemarks || '—' },
        ]} />
        {ci.delinquencyFlags.length ? <div style={{
        marginTop: 16,
        padding: 12,
        background: 'rgba(220,38,38,0.06)',
        borderRadius: 12
      }}><strong>Delinquency Flags:</strong><ul className="flag-list" style={{
          marginTop: 8
        }}>{ci.delinquencyFlags.map(f => <li key={f}>{f}</li>)}</ul></div> : null}
        {ci.paymentHistory.length ? <><h4 className="subsection-title">Payment History</h4><><div className="corvex-table-wrapper"><table className="corvex-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{paginated_ci_paymentHistory.map(p => <tr key={p.date}><td>{p.date}</td><td>{formatCurrency(p.amount)}</td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table></div><Pagination {...pagination_ci_paymentHistory} /></></> : null}
      </section>
      {showReject && <section className="panel form-panel content-panel"><div className="form-group"><label>Rejection Reason<span className="required">*</span></label><textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Mandatory reason..." /></div></section>}
      {ci.status === 'Pending' ? <div className="flex justify-end gap-2 mt-4">
          <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/ci-approvals`)}>Back</button>
          <button className="button secondary" type="button" onClick={() => applyStatus('Revision Requested')}>Request Revision</button>
          <button className="button secondary" type="button" onClick={() => {
        if (showReject) {
          if (!rejectReason.trim()) {
            showToast('Reason required.', 'error');
            return;
          }
          applyStatus('Rejected', rejectReason.trim());
        } else setShowReject(true);
      }}>{showReject ? 'Confirm Reject' : 'Reject'}</button>
          <button className="button" type="button" onClick={() => applyStatus('Approved')}>Approve</button>
        </div> : <div className="flex justify-end gap-2 mt-4">
          <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/ci-approvals`)}>Back</button>
        </div>}
    </div>;
}

// ── Customers ─────────────────────────────────────────────────────────────────
function CustomersPage({
  navigate,
  branchName,
  opsBase,
  showToast
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBranchCustomers();
      if (result.success) setCustomers(result.data.customers || []);
      setLoading(false);
    }
    load();
  }, []);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      const matchSearch = !q || c.customerName.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q) || (c.contact_phone || '').includes(q);
      const matchStatus = statusFilter === 'All' || c.status === statusFilter;
      const matchPayment = paymentFilter === 'All' || c.paymentStatus === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [search, statusFilter, paymentFilter, customers]);
  const totalOutstanding = customers.reduce((sum, c) => sum + (c.outstanding_balance || 0), 0);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  if (loading) return <LoadingState message="Loading customers..." />;
  return <div className="page">
      <Stats stats={[{
      label: 'Total Customers',
      value: String(customers.length)
    }, {
      label: 'Active',
      value: String(customers.filter(c => c.status === 'Active').length)
    }, {
      label: 'With Balance',
      value: String(customers.filter(c => c.outstanding_balance > 0).length)
    }, {
      label: 'Total Outstanding',
      value: formatCurrency(totalOutstanding)
    }]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <h3>Branch Customers</h3>
          <div className="list-section-actions">
            <button className="button secondary" type="button" onClick={() => {
              const rows = filtered.map((c) => ({
                customer: c.customerName,
                address: c.address || '',
                phone: c.contact_phone || '',
                outstanding: c.outstanding_balance || 0,
                payment: c.paymentStatus || '',
                status: c.status || '',
              }));
              if (downloadPdf(rows, { filename: 'branch-customers.pdf', title: 'Branch Customers' })) showToast('Customer list exported as PDF.', 'success');
              else showToast('Nothing to export.', 'error');
            }}>Export PDF</button>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by customer name, address, or phone" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Active', 'Inactive'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <select className="filter-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
              {['All', 'Current', 'Overdue'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Payment Status' : s}</option>)}
            </select>
          </div>
          <span className="list-section-subtitle">{branchName}</span>
        </div>
        {filtered.length ? <><div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Contact</th>
                  <th>Outstanding</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated_filtered.map(c => <tr key={c.id}>
                    <td><strong>{c.customerName}</strong></td>
                    <td>{c.address || '—'}</td>
                    <td>{formatPhone(c.contact_phone)}</td>
                    <td>{formatCurrency(c.outstanding_balance || 0)}</td>
                    <td><StatusBadge status={c.paymentStatus} /></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`${opsBase}/customers/${c.id}`)}>
                        <NavIcon name="view" />
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No customers found" description="Adjust your search or filters, or add customers through the system." />}
      </section>
    </div>;
}
function CustomerDetailPage({
  customerId,
  navigate,
  branchName,
  opsBase
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailTab, setDetailTab] = useState('contact');
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBranchCustomerById(customerId);
      if (result.success) setCustomer(result.data);
      setLoading(false);
    }
    load();
  }, [customerId]);
  if (loading) return <LoadingState message="Loading customer..." />;
  if (!customer) {
    return <EmptyState title="Customer not found" description="This customer may not belong to your branch or no longer exists." actionLabel="Back to Customers" onAction={() => navigate(`${opsBase}/customers`)} />;
  }
  const name = `${customer.first_name} ${customer.last_name}`;
  const paymentStatus = Number(customer.activity?.outstanding_balance || 0) > 0 ? 'Overdue' : 'Current';
  const customerSince = customer.created_at ? formatDisplayDate(customer.created_at) : '—';
  const detailTabs = [
    { key: 'contact', label: 'Contact Information' },
    { key: 'activity', label: 'Account Activity' },
    { key: 'credit', label: 'Credit Information' },
  ];
  const activeDetailTab = detailTabs.find((tab) => tab.key === detailTab) || detailTabs[0];
  return <div className="page">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{customer.branch_name || branchName}</p>
          <h2>{name}</h2>
          <p className="text-ink/70">{customer.address || 'No address on file'}</p>
        </div>
      </section>

      <Stats stats={[{
      label: 'Status',
      value: <StatusBadge status={customer.status || '—'} />
    }, {
      label: 'Payment Status',
      value: <StatusBadge status={paymentStatus} />
    }, {
      label: 'Outstanding',
      value: formatCurrency(Number(customer.activity?.outstanding_balance || 0))
    }, {
      label: 'Purchase Volume',
      value: formatCurrency(Number(customer.activity?.purchase_volume || 0))
    }, {
      label: 'Account Manager',
      value: customer.account_manager_name || '—'
    }, {
      label: 'Customer Since',
      value: customerSince
    }]} />

      <section className="panel content-panel relative overflow-hidden">
        <div className="segmented-control" style={{ marginBottom: 16 }}>
          {detailTabs.map((tab) => (
            <button
              key={tab.key}
              className={detailTab === tab.key ? 'segment active' : 'segment'}
              type="button"
              onClick={() => setDetailTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>{activeDetailTab.label}</h3>
        </div>

        {detailTab === 'contact' && (
          <DetailRowsTable rows={[
            { label: 'Customer Name', value: name },
            { label: 'Middle Name', value: formatMiddleNameDisplay(customer.middle_name) },
            { label: 'Branch', value: customer.branch_name || branchName },
            { label: 'Address', value: customer.address || '—' },
            { label: 'Contact Phone', value: formatPhone(customer.contact_phone) },
            { label: 'Contact Person', value: [customer.contact_person_fname, customer.contact_person_lname].filter(Boolean).join(' ') || '—' },
            { label: 'Contact Person Middle Name', value: formatMiddleNameDisplay(customer.contact_person_mname) },
            { label: 'Contact Person Phone', value: customer.contact_person_phone || '—' },
            { label: 'Account Manager', value: customer.account_manager_name || '—' },
            { label: 'Customer Since', value: customerSince },
          ]} />
        )}

        {detailTab === 'activity' && (
          <DetailRowsTable
            fieldHeader="Activity"
            detailsHeader="Details"
            rows={[
              { label: 'Outstanding Balance', value: formatCurrency(Number(customer.activity?.outstanding_balance || 0)) },
              { label: 'Purchase Volume', value: formatCurrency(Number(customer.activity?.purchase_volume || 0)) },
              { label: 'Last Collection', value: customer.activity?.last_collection_date ? formatDisplayDate(customer.activity.last_collection_date) : '—' },
              { label: 'Last Sales Visit', value: customer.activity?.last_sales_visit ? formatDisplayDate(customer.activity.last_sales_visit) : '—' },
            ]}
          />
        )}

        {detailTab === 'credit' && (
          customer.creditInfo ? (
            <DetailRowsTable rows={[
              { label: 'Credit Limit', value: formatCurrency(Number(customer.creditInfo.credit_limit || 0)) },
              { label: 'Monthly Income', value: formatCurrency(Number(customer.creditInfo.monthly_income || 0)) },
              { label: 'Credit Score', value: customer.creditInfo.credit_score || '—' },
              { label: 'Employment Status', value: customer.creditInfo.employment_status || '—' },
              { label: 'Approved By', value: customer.creditInfo.approved_by_name || '—' },
              { label: 'Approved Date', value: customer.creditInfo.approved_date ? formatDisplayDate(customer.creditInfo.approved_date) : '—' },
            ]} />
          ) : (
            <EmptyState title="No credit information" description="This customer has no credit record on file." />
          )
        )}
      </section>

      {customer.latitude && customer.longitude ? <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Location</h3></div>
          <div style={{
        minHeight: 220,
        borderRadius: 8,
        overflow: 'hidden'
      }}>
            <LeafletMap center={[Number(customer.latitude), Number(customer.longitude)]} zoom={15} height={220} markers={[{
          id: customer.customer_id,
          position: [Number(customer.latitude), Number(customer.longitude)],
          label: name.substring(0, 2).toUpperCase(),
          color: paymentStatus === 'Overdue' ? '#ef4444' : '#0B1E30',
          popup: name
        }]} />
          </div>
        </section> : null}

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/customers`)}>Back to Customers</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/leaflet`)}>View on Map</button>
      </div>
    </div>;
}

// ── Alerts, Notifications, Profile, Audit ────────────────────────────────────
function AlertsPage({
  navigate,
  showToast,
  currentUser
}) {
  const [filter, setFilter] = useState('All');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const res = await fetchOperationalAlerts({ status: 'Open' });
    if (res.success) setAlerts((res.data || []).map(mapOperationalAlertRow));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  const filtered = useMemo(() => {
    if (filter === 'All') return alerts;
    return alerts.filter(a => (a.category || '').toLowerCase().includes(filter.toLowerCase()));
  }, [alerts, filter]);
  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;
  const assignAlert = async (alertId) => {
    const result = await patchOperationalAlert(alertId, { assigned_to: currentUser?.id });
    if (result.success) {
      showToast('Follow-up assigned to you.', 'success');
      load();
    } else showToast(result.message || 'Assign failed.', 'error');
  };
  const resolveAlert = async (alertId) => {
    const result = await patchOperationalAlert(alertId, { status: 'Resolved' });
    if (result.success) {
      showToast('Resolved.', 'success');
      load();
    } else showToast(result.message || 'Resolve failed.', 'error');
  };
  if (loading && !alerts.length) return <LoadingState message="Loading alerts..." />;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header"><h3>Alerts <span className="text-ink/70">({filtered.length})</span></h3></div>
        <div className="list-section-toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented-control">
            {['All', 'Collection', 'Sales', 'Inventory', 'Route'].map(f => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}
          </div>
        </div>
        {filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Message</th>
                  <th>Severity</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(a => <tr key={a.id}>
                    <td><strong>{a.title}</strong></td>
                    <td>{a.category || a.type || '—'}</td>
                    <td>{a.message}</td>
                    <td><Severity severity={a.severity} /></td>
                    <td>{formatDisplayDateTime(a.time || a.date)}</td>
                    <td><StatusBadge status={a.resolved || a.status === 'Resolved' ? 'Resolved' : (a.status || 'Open')} /></td>
                    <td className="table-actions">
                      {!a.resolved && a.status !== 'Resolved' ? <>
                        <button className="icon-action-button" type="button" title="Assign" onClick={() => assignAlert(a.id)}><NavIcon name="user" /></button>
                        <button className="icon-action-button" type="button" title="Resolve" onClick={() => resolveAlert(a.id)}><NavIcon name="check" /></button>
                      </> : <span className="muted">—</span>}
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No alerts" description="No alerts match this filter." />}
      </section>
    </div>;
}
function NotificationsPage({
  navigate,
  showToast,
  opsBase
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const load = async () => {
    setLoading(true);
    const res = await fetchNotifications();
    if (res.success) {
      setItems((res.data || []).map(row => mapNotificationRow(row, { opsBase, orgBase: '/operating-manager' })));
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [opsBase]);
  const filtered = useMemo(() => {
    if (filter === 'Unread') return items.filter(n => !n.read);
    if (filter === 'All') return items;
    return items.filter(n => (n.category || n.type || '').toLowerCase().includes(filter.toLowerCase()));
  }, [items, filter]);
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="segmented-control">{['All', 'Unread', 'CI', 'Route', 'Delinquency', 'Inventory', 'Staff'].map(f => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}</div>
          <button className="button" type="button" onClick={async () => {
          const res = await markAllNotificationsRead();
          if (res.success) {
            showToast('All marked read.', 'success');
            load();
          }
        }}>Mark All as Read</button>
        </div>
      </section>
      {loading && !items.length ? <LoadingState message="Loading notifications..." /> : filtered.length ? <div className="notification-list">
          {filtered.map(item => <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="text-ink/70">{item.message}</p><span className="notification-time">{formatDisplayDateTime(item.time)}</span></div>
              <div className="notification-actions">
                {!item.read && <button className="button ghost" type="button" onClick={async () => {
            const res = await markNotificationRead(item.id);
            if (res.success) load();
          }}>Mark Read</button>}
                {item.relatedTo ? <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>Open</button> : null}
              </div>
            </article>)}
        </div> : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>;
}
function ProfilePage({
  navigate,
  showToast,
  opsBase
}) {
  return <AccountProfilePanel
    showToast={showToast}
    title="Branch Manager Profile"
    subtitle="View your personal details and update your account password."
    extraActions={<>
      <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/audit-log`)}>Audit Log</button>
      <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Approval Center</button>
    </>}
  />;
}
function ApprovalCenterPage({
  navigate,
  showToast,
  opsBase
}) {
  const [tab, setTab] = useState('ci');
  const [ciList, setCiList] = useState([]);
  const [transferList, setTransferList] = useState([]);
  const [specialList, setSpecialList] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [collectionList, setCollectionList] = useState([]);
  const [confirmedCollections, setConfirmedCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    const [ciRes, trRes, scRes, invRes, pendingPayRes, confirmedPayRes] = await Promise.all([
      fetchCreditInvestigations(),
      fetchInventoryTransfers(),
      fetchSpecialCollectionRequests(),
      fetchPendingSalesInvoices(),
      fetchCollectionsForReview('Pending'),
      fetchCollectionsForReview('Completed'),
    ]);
    if (ciRes.success) setCiList((ciRes.data || []).map(mapCreditInvestigationRow));
    if (trRes.success) {
      const pending = (trRes.data || []).filter(t => ['Pending Approval', 'Submitted'].includes(t.status));
      setTransferList(pending.map(mapInventoryTransferRow));
    }
    if (scRes.success) setSpecialList((scRes.data || []).map(mapSpecialCollectionRow));
    if (invRes.success) setInvoiceList(invRes.data || []);
    if (pendingPayRes.success) setCollectionList(pendingPayRes.data || []);
    if (confirmedPayRes.success) setConfirmedCollections(confirmedPayRes.data || []);
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, []);
  const tabs = [{
    key: 'ci',
    label: `Credit Investigations (${ciList.filter(c => c.status === 'Pending').length})`
  }, {
    key: 'transfers',
    label: `Inventory Transfers (${transferList.filter(t => t.status === 'Pending Approval').length})`
  }, {
    key: 'special',
    label: `Special Collections (${specialList.filter(s => s.status === 'Pending').length})`
  }, {
    key: 'invoices',
    label: `Sales Invoices (${invoiceList.length})`
  }, {
    key: 'collections',
    label: `Collections (${collectionList.length})`
  }];
  const totalPending = ciList.filter(c => c.status === 'Pending').length + transferList.filter(t => t.status === 'Pending Approval').length + specialList.filter(s => s.status === 'Pending').length + invoiceList.length + collectionList.length;
  const approveCI = async (ciId) => {
    const result = await patchCreditInvestigation(ciId, { status: 'Approved' });
    if (result.success) {
      showToast('CI approved successfully.', 'success');
      reload();
    } else showToast(result.message || 'Approve failed.', 'error');
  };
  const rejectCI = async (ciId) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) {
      showToast('Reason required.', 'error');
      return;
    }
    const result = await patchCreditInvestigation(ciId, { status: 'Rejected', rejection_reason: reason.trim() });
    if (result.success) {
      showToast('CI rejected.', 'success');
      reload();
    } else showToast(result.message || 'Reject failed.', 'error');
  };
  const approveTransfer = async (transferId) => {
    const result = await patchInventoryTransfer(transferId, { status: 'Approved' });
    if (result.success) {
      showToast('Transfer approved.', 'success');
      reload();
    } else showToast(result.message || 'Approve failed.', 'error');
  };
  const rejectTransfer = async (transferId) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) {
      showToast('Reason required.', 'error');
      return;
    }
    const result = await patchInventoryTransfer(transferId, {
      status: 'Rejected',
      approval_info: reason.trim(),
    });
    if (result.success) {
      showToast('Transfer rejected.', 'success');
      reload();
    } else showToast(result.message || 'Reject failed.', 'error');
  };
  const approveSpecial = async (requestId) => {
    const result = await patchSpecialCollectionRequest(requestId, { status: 'Approved' });
    if (result.success) {
      showToast('Special collection approved.', 'success');
      reload();
    } else showToast(result.message || 'Approve failed.', 'error');
  };
  const rejectSpecial = async (requestId) => {
    const result = await patchSpecialCollectionRequest(requestId, { status: 'Rejected' });
    if (result.success) {
      showToast('Special collection rejected.', 'success');
      reload();
    } else showToast(result.message || 'Reject failed.', 'error');
  };
  const confirmInvoice = async (invoiceId) => {
    const result = await patchSalesInvoiceReview(invoiceId, { status: 'Confirmed' });
    if (result.success) {
      showToast(result.message || 'Invoice confirmed.', 'success');
      reload();
    } else showToast(result.message || 'Confirm failed.', 'error');
  };
  const rejectInvoice = async (invoiceId) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) {
      showToast('Reason required.', 'error');
      return;
    }
    const result = await patchSalesInvoiceReview(invoiceId, { status: 'Cancelled', review_note: reason.trim() });
    if (result.success) {
      showToast(result.message || 'Invoice rejected.', 'success');
      reload();
    } else showToast(result.message || 'Reject failed.', 'error');
  };
  const confirmCollection = async (paymentId) => {
    const result = await patchCollectionReview(paymentId, { action: 'confirm' });
    if (result.success) {
      showToast(result.message || 'Collection confirmed.', 'success');
      reload();
    } else showToast(result.message || 'Confirm failed.', 'error');
  };
  const rejectCollection = async (paymentId) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) {
      showToast('Reason required.', 'error');
      return;
    }
    const result = await patchCollectionReview(paymentId, { action: 'reject', review_note: reason.trim() });
    if (result.success) {
      showToast(result.message || 'Collection rejected.', 'success');
      reload();
    } else showToast(result.message || 'Reject failed.', 'error');
  };
  const reverseCollection = async (paymentId) => {
    const reason = window.prompt('Reversal reason (required):');
    if (!reason?.trim()) {
      showToast('Reason required.', 'error');
      return;
    }
    const result = await patchCollectionReview(paymentId, { action: 'reverse', review_note: reason.trim() });
    if (result.success) {
      showToast(result.message || 'Collection reversed.', 'success');
      reload();
    } else showToast(result.message || 'Reverse failed.', 'error');
  };
  const RiskBadge = ({
    score
  }) => {
    const color = score >= 70 ? '#dc2626' : score >= 40 ? '#d97706' : '#2A9B6A';
    const label = score >= 70 ? 'High Risk' : score >= 40 ? 'Medium' : 'Low Risk';
    return <span style={{
      fontWeight: 600,
      color,
      whiteSpace: 'nowrap'
    }}>{label} ({score})</span>;
  };
  const pagination_ciList = usePagination(ciList);
  const paginated_ciList = pagination_ciList.paginatedData;
  const pagination_transferList = usePagination(transferList);
  const paginated_transferList = pagination_transferList.paginatedData;
  const pagination_specialList = usePagination(specialList);
  const paginated_specialList = pagination_specialList.paginatedData;
  const pagination_invoiceList = usePagination(invoiceList);
  const paginated_invoiceList = pagination_invoiceList.paginatedData;
  const pagination_collectionList = usePagination(collectionList);
  const paginated_collectionList = pagination_collectionList.paginatedData;
  const pagination_confirmedCollections = usePagination(confirmedCollections);
  const paginated_confirmedCollections = pagination_confirmedCollections.paginatedData;
  if (loading && !ciList.length && !transferList.length && !specialList.length && !invoiceList.length && !collectionList.length && !confirmedCollections.length) {
    return <LoadingState message="Loading approval center..." />;
  }
  return <div className="page">
      {/* Summary bar */}
      <Stats stats={[{
        label: 'Total Pending',
        value: String(totalPending),
      }, {
        label: 'CI Approvals',
        value: String(ciList.filter(c => c.status === 'Pending').length),
      }, {
        label: 'Transfer Approvals',
        value: String(transferList.filter(t => t.status === 'Pending Approval').length),
      }, {
        label: 'Special Collections',
        value: String(specialList.filter(s => s.status === 'Pending').length),
      }, {
        label: 'Sales Invoices',
        value: String(invoiceList.length),
      }, {
        label: 'Collections',
        value: String(collectionList.length),
      }]} />

      {/* Tab navigation */}
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ── CI Approvals ── */}
      {tab === 'ci' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Credit Investigation Queue</h3>
            <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/ci-approvals`)}>Open Full CI Queue</button>
          </div>
          {ciList.length ? <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr><th>Customer</th><th>Submitted By</th><th>Purpose</th><th>Income</th><th>Risk Score</th><th>Delinquency</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {paginated_ciList.map(ci => <tr key={ci.id}>
                      <td><strong>{ci.customerName}</strong><span className="text-ink/70" style={{
                    display: 'block',
                    fontSize: '0.8rem'
                  }}>{ci.id}</span></td>
                      <td>{ci.submittedBy}<span className="text-ink/70" style={{
                    display: 'block',
                    fontSize: '0.8rem'
                  }}>{formatDisplayDate(ci.submissionDate)}</span></td>
                      <td>{ci.purpose}</td>
                      <td>{formatCurrency(ci.monthlyIncome)}</td>
                      <td><RiskBadge score={ci.riskScore} /></td>
                      <td><StatusBadge status={ci.delinquencyStatus} /></td>
                      <td><StatusBadge status={ci.status} /></td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`${opsBase}/ci-approvals/${ci.id}`)}><NavIcon name="view" /></button>
                        {ci.status === 'Pending' && <>
                          <button className="icon-action-button" type="button" title="Approve" onClick={() => approveCI(ci.ciId)}><NavIcon name="check" /></button>
                          <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectCI(ci.ciId)}><NavIcon name="close" /></button>
                        </>}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_ciList} /></> : <EmptyState title="No CI records" description="No credit investigation forms on file." />}
        </section>}

      {/* ── Inventory Transfers ── */}
      {tab === 'transfers' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Inventory Transfer Requests</h3>
            <p className="text-ink/70" style={{
          margin: 0,
          fontSize: '0.85rem'
        }}>Review and approve cross-branch stock movements.</p>
          </div>
          {transferList.length ? <><div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr><th>Transfer ID</th><th>Product</th><th>Qty</th><th>From</th><th>To</th><th>Value</th><th>Requested By</th><th>Date</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {paginated_transferList.map(t => <tr key={t.id}>
                      <td><strong>{t.ref || t.id}</strong></td>
                      <td>{t.product}</td>
                      <td>{t.qty} units</td>
                      <td style={{
                  fontSize: '0.85rem'
                }}>{t.from.replace(' Branch', '')}</td>
                      <td style={{
                  fontSize: '0.85rem'
                }}>{t.to.replace(' Branch', '')}</td>
                      <td style={{
                  fontWeight: 600
                }}>{formatCurrency(t.value)}</td>
                      <td>{t.requestedBy}</td>
                      <td>{formatDisplayDate(t.date)}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="table-actions">
                        {['Pending Approval', 'Submitted'].includes(t.status) && <>
                          <button className="icon-action-button" type="button" title="Approve" onClick={() => approveTransfer(t.id)}><NavIcon name="check" /></button>
                          <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectTransfer(t.id)}><NavIcon name="close" /></button>
                        </>}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div><Pagination {...pagination_transferList} /></> : <EmptyState title="No transfer requests" description="All transfers have been processed." />}
        </section>}

      {/* ── Special Collections ── */}
      {tab === 'special' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Special Collection Requests <span className="text-ink/70">({specialList.length})</span></h3>
            <p className="list-section-subtitle">Extended terms and partial collection approvals submitted by field collectors.</p>
          </div>
          {specialList.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Account</th>
                    <th>Requested By</th>
                    <th>Date</th>
                    <th>Request Type</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_specialList.map(s => <tr key={s.id}>
                      <td><strong>{s.customerName}</strong></td>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.accountNumber || '—'}</span></td>
                      <td>{s.requestedBy || '—'}</td>
                      <td>{formatDisplayDate(s.date)}</td>
                      <td>{s.requestType || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(s.amount)}</td>
                      <td>{s.notes || '—'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="table-actions">
                        {s.status === 'Pending' ? <>
                          <button className="icon-action-button" type="button" title="Approve" onClick={() => approveSpecial(s.requestId)}><NavIcon name="check" /></button>
                          <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectSpecial(s.requestId)}><NavIcon name="close" /></button>
                        </> : <span className="muted">—</span>}
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_specialList} />
          </> : <EmptyState title="No special collection requests" description="All requests have been processed." />}
        </section>}

      {tab === 'invoices' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Sales invoices waiting for review <span className="text-ink/70">({invoiceList.length})</span></h3>
            <p className="list-section-subtitle">Confirm a sale logged by a sales agent, or reject it to return the stock and reopen the purchase request.</p>
          </div>
          {invoiceList.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Sales Agent</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_invoiceList.map((inv) => {
                    let items = inv.items;
                    if (typeof items === 'string') {
                      try { items = JSON.parse(items); } catch { items = []; }
                    }
                    if (!Array.isArray(items)) items = [];
                    return <tr key={inv.sales_invoices_id}>
                      <td><strong>{inv.invoice_number}</strong></td>
                      <td>{inv.customer_name}</td>
                      <td>{inv.sales_agent_name}</td>
                      <td>{items.map((item) => `${item.product_name} × ${item.quantity}`).join(', ') || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(inv.total_amount))}</td>
                      <td>{formatDisplayDate(inv.invoices_date)}</td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Confirm" onClick={() => confirmInvoice(inv.sales_invoices_id)}><NavIcon name="check" /></button>
                        <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectInvoice(inv.sales_invoices_id)}><NavIcon name="close" /></button>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_invoiceList} />
          </> : <EmptyState title="No sales invoices to review" description="Invoices logged by sales agents will appear here until you confirm or reject them." />}
        </section>}

      {tab === 'collections' && <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3>Collections waiting for review <span className="text-ink/70">({collectionList.length})</span></h3>
            <p className="list-section-subtitle">Confirm a collection to lower the balance. Reject it to leave the balance unchanged.</p>
          </div>
          {collectionList.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Collector</th>
                    <th>Branch</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_collectionList.map((payment) => <tr key={payment.collectionpayment_id}>
                      <td><strong>{payment.receipt_number}</strong></td>
                      <td>{payment.customer_name}</td>
                      <td>{payment.collector_name}</td>
                      <td>{payment.branch_name || '—'}</td>
                      <td>{payment.payment_method}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(payment.amount))}</td>
                      <td>{formatDisplayDate(payment.payment_date)}</td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Confirm" onClick={() => confirmCollection(payment.collectionpayment_id)}><NavIcon name="check" /></button>
                        <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectCollection(payment.collectionpayment_id)}><NavIcon name="close" /></button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_collectionList} />
          </> : <EmptyState title="No collections to review" description="Collections logged by collectors will appear here until you confirm or reject them." />}

          <div className="list-section-header" style={{ marginTop: 28 }}>
            <h3>Confirmed collections <span className="text-ink/70">({confirmedCollections.length})</span></h3>
            <p className="list-section-subtitle">Reverse a confirmed collection to put the amount back on the balance.</p>
          </div>
          {confirmedCollections.length ? <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Collector</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_confirmedCollections.map((payment) => <tr key={payment.collectionpayment_id}>
                      <td><strong>{payment.receipt_number}</strong></td>
                      <td>{payment.customer_name}</td>
                      <td>{payment.collector_name}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(Number(payment.amount))}</td>
                      <td>{formatDisplayDate(payment.payment_date)}</td>
                      <td className="table-actions">
                        <button className="button ghost" type="button" onClick={() => reverseCollection(payment.collectionpayment_id)}>Reverse</button>
                      </td>
                    </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_confirmedCollections} />
          </> : <EmptyState title="No confirmed collections" description="Confirmed collections can be reversed from here." />}
        </section>}
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
      const result = await getBranchAuditLogs({ limit: 200 });
      if (result.success) setLogs(result.data || []);
      setLoading(false);
    }
    load();
  }, []);
  const pagination_AUDIT_LOGS = usePagination(logs);
  const paginated_AUDIT_LOGS = pagination_AUDIT_LOGS.paginatedData;
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Log</h3></div>
        {loading ? <LoadingState message="Loading audit log…" /> : <><div className="corvex-table-wrapper"><table className="corvex-table"><thead><tr><th>User</th><th>Action</th><th>Details</th><th>IP</th><th>Timestamp</th></tr></thead><tbody>{paginated_AUDIT_LOGS.length ? paginated_AUDIT_LOGS.map(l => <tr key={l.audit_id ?? l.id}><td>{l.user_name || '—'}</td><td>{l.action}</td><td>{l.status_details || l.detail || '—'}</td><td>{l.ip_address || '—'}</td><td>{formatDisplayDateTime(l.created_at || l.timestamp)}</td></tr>) : <tr><td colSpan={5}><EmptyState title="No audit entries" /></td></tr>}</tbody></table></div><Pagination {...pagination_AUDIT_LOGS} /></>}
      </section>
    </div>;
}

function SettingsPage({
  navigate,
  opsBase
}) {
  return <div className="page">
      <section className="panel content-panel relative overflow-hidden">
        <h3>Branch Settings</h3>
        <p className="text-ink/70">Manage your profile, approvals, and audit history for this branch.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button className="button" type="button" onClick={() => navigate(`${opsBase}/profile`)}>Profile</button>
          <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Approval Center</button>
          <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/audit-log`)}>Audit Log</button>
          <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/notifications`)}>Notifications</button>
        </div>
      </section>
    </div>;
}

function AccountLocationDetailPage({
  accountId,
  navigate,
  opsBase,
  branchName
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getBranchCustomerById(accountId);
      if (res.success) setCustomer(res.data);
      setLoading(false);
    }
    load();
  }, [accountId]);
  if (loading) return <LoadingState message="Loading account location..." />;
  if (!customer) {
    return <EmptyState title="Account not found" actionLabel="Back to map" onAction={() => navigate(`${opsBase}/leaflet`)} />;
  }
  const name = `${customer.first_name} ${customer.last_name}`;
  const lat = Number(customer.latitude);
  const lng = Number(customer.longitude);
  return <div className="page">
      <Stats stats={[{
      label: 'Customer',
      value: name
    }, {
      label: 'Branch',
      value: customer.branch_name || branchName
    }, {
      label: 'Outstanding',
      value: formatCurrency(Number(customer.activity?.outstanding_balance || 0))
    }]} />
      {lat && lng ? <section className="panel content-panel relative overflow-hidden">
          <LeafletMap center={[lat, lng]} zoom={15} height={360} markers={[{
        id: customer.customer_id,
        position: [lat, lng],
        label: name.substring(0, 2).toUpperCase(),
        color: '#0B1E30',
        popup: name
      }]} />
        </section> : <EmptyState title="No coordinates" description="This customer has no map pin on file." />}
      <div className="flex justify-end gap-2">
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/leaflet`)}>Back to Map</button>
        <button className="button" type="button" onClick={() => navigate(`${opsBase}/customers/${customer.customer_id}`)}>Open Customer</button>
      </div>
    </div>;
}

function reportPhotoSrc(photo) {
  if (typeof photo !== 'string') return '';
  if (photo.startsWith('data:image/') || photo.startsWith('http://') || photo.startsWith('https://')) return photo;
  return '';
}

// ── Collector field activity reports ──────────────────────────────────────────
function FieldActivityReportsPage({
  showToast,
  currentUser,
}) {
  const showBranch = currentUser?.role?.slug === 'operating_manager' || currentUser?.role?.slug === 'super_admin';
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState('All');
  const [syncFilter, setSyncFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getFieldActivityReports();
      if (result.success) {
        setReports(result.data || []);
        setTotal(Number(result.total ?? result.data?.length ?? 0));
      } else {
        showToast?.(result.message || 'Failed to load field activity reports.', 'error');
      }
      setLoading(false);
    }
    load();
  }, []);

  const activityTypes = useMemo(() => {
    const types = [...new Set(reports.map((r) => r.activity_type).filter(Boolean))].sort();
    return ['All', ...types];
  }, [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      const matchActivity = activityFilter === 'All' || r.activity_type === activityFilter;
      const matchSync = syncFilter === 'All' || r.sync_status === syncFilter;
      const haystack = [r.collector_name, r.staff_role, r.customer_name, r.remarks, r.branch_name, r.activity_type, r.visit_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchActivity && matchSync && (!q || haystack.includes(q));
    });
  }, [reports, search, activityFilter, syncFilter]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;
  const collectorCount = new Set(reports.map((r) => String(r.collector_id))).size;

  async function openReport(report) {
    setSelected(report);
    setDetailLoading(true);
    const result = await getFieldActivityReport(report.report_id);
    setDetailLoading(false);
    if (result.success && result.data) setSelected(result.data);
    else showToast?.(result.message || 'Could not open this report.', 'error');
  }

  if (loading) return <LoadingState message="Loading field activity reports..." />;

  const photoSrc = reportPhotoSrc(selected?.photo);

  return <div className="page">
      <Stats stats={[{
        label: 'Reports',
        value: String(total || reports.length),
      }, {
        label: 'Pending Sync',
        value: String(reports.filter((r) => r.sync_status === 'Pending').length),
      }, {
        label: 'With Photo',
        value: String(reports.filter((r) => r.has_photo).length),
      }, {
        label: 'Staff',
        value: String(collectorCount),
      }]} />
      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-header">
          <div>
            <h3>Field Activity Reports</h3>
            <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
              {`Visit reports submitted by collectors and sales agents${showBranch ? ' across branches' : ''}.${total > reports.length ? ` Showing the ${reports.length} most recent of ${total}.` : ''}`}
            </p>
          </div>
        </div>
        <div className="list-section-toolbar">
          <div className="list-section-controls">
            <input
              className="filter-input search"
              type="search"
              placeholder="Search staff, customer, or remarks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="filter-select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              {activityTypes.map((type) => <option key={type} value={type}>{type === 'All' ? 'All Activities' : type}</option>)}
            </select>
            <select className="filter-select" value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)}>
              {['All', 'Pending', 'Synced', 'Failed'].map((status) => <option key={status} value={status}>{status === 'All' ? 'All Sync Status' : status}</option>)}
            </select>
          </div>
        </div>
        {filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  {showBranch ? <th>Branch</th> : null}
                  <th>Customer</th>
                  <th>Activity</th>
                  <th>Visit Date</th>
                  <th>Sync</th>
                  <th>Submitted</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <tr key={r.report_id}>
                    <td><strong>{r.collector_name}</strong>{r.staff_role ? <div className="muted">{r.staff_role}</div> : null}</td>
                    {showBranch ? <td>{r.branch_name || '—'}</td> : null}
                    <td>{r.customer_name}</td>
                    <td>{r.activity_type}</td>
                    <td>{formatDisplayDate(r.scheduled_date)}</td>
                    <td><StatusBadge status={r.sync_status} /></td>
                    <td>{formatDisplayDateTime(r.created_at)}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.remarks}>{r.remarks || '—'}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View report" onClick={() => openReport(r)}><NavIcon name="view" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title="No field activity reports" description="Collector and sales agent submissions will appear here after a visit report is filed." />}
      </section>
      {selected ? <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
              <div>
                <h3 style={{ margin: 0 }}>Report {selected.report_id}</h3>
                <p className="text-ink/70" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>
                  {selected.collector_name} · {selected.customer_name}
                </p>
              </div>
              <StatusBadge status={selected.sync_status} />
            </div>
            {detailLoading ? <LoadingState message="Loading report..." /> : <div className="grid gap-3">
                <div className="grid two-up">
                  <p style={{ margin: 0 }}><span className="text-ink/70">Activity</span><br /><strong>{selected.activity_type || '—'}</strong></p>
                  <p style={{ margin: 0 }}><span className="text-ink/70">Visit</span><br /><strong>{selected.visit_type || '—'} · {formatDisplayDate(selected.scheduled_date)} · <StatusBadge status={selected.visit_status || '—'} /></strong></p>
                  {showBranch ? <p style={{ margin: 0 }}><span className="text-ink/70">Branch</span><br /><strong>{selected.branch_name || '—'}</strong></p> : null}
                  <p style={{ margin: 0 }}><span className="text-ink/70">Submitted</span><br /><strong>{formatDisplayDateTime(selected.created_at)}</strong></p>
                </div>
                <div>
                  <p className="text-ink/70" style={{ margin: '0 0 4px' }}>Remarks</p>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.remarks || '—'}</p>
                </div>
                <div>
                  <p className="text-ink/70" style={{ margin: '0 0 8px' }}>Photo evidence</p>
                  {photoSrc ? (
                    <a href={photoSrc} target="_blank" rel="noreferrer">
                      <img src={photoSrc} alt="Report evidence" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, border: '1px solid #BADBE9' }} />
                    </a>
                  ) : <p style={{ margin: 0 }}>{selected.has_photo ? 'Photo could not be displayed.' : 'No photo attached.'}</p>}
                </div>
              </div>}
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div> : null}
    </div>;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BranchManagerPageBody({
  page,
  navigate,
  showToast,
  currentUser
}) {
  const isOperatingManager = currentUser?.role?.slug === 'operating_manager';
  if (!isOperatingManager && !currentUser?.branch) {
    return <section className="panel empty-state">
        <h3>Branch not assigned</h3>
        <p className="text-ink/70">Your account is not linked to a branch. Please contact an administrator.</p>
      </section>;
  }
  const branchName = currentUser?.branch?.name || (isOperatingManager ? 'All Branches' : 'Unassigned Branch');
  const opsBase = isOperatingManager ? '/operating-manager/operations' : '/branch-manager';
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const p = {
    collectorId: page.params?.collectorId,
    agentId: page.params?.agentId,
    ciId: page.params?.ciId,
    accountId: page.params?.accountId,
    customerId: page.params?.customerId,
    pageType: page.pageType,
    navigate,
    showToast,
    branchName,
    opsBase,
    currentUser,
  };
  switch (page.pageType) {
    case 'settings':
      return <SettingsPage {...p} />;
    case 'dashboard':
      return <DashboardPage {...p} />;
    case 'customers':
      return <CustomersPage {...p} />;
    case 'customerDetail':
      return <CustomerDetailPage {...p} />;
    case 'territories':
      return <TerritoriesPage {...p} />;
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...p} />;
    case 'branchInventory':
      return <BranchInventoryViewPage showToast={showToast} branchName={branchName} />;
    case 'fieldOperations':
    case 'collectorRoutes':
    case 'salesSchedules':
    case 'routePerformance':
      return <FieldOperationsHub {...p} />;
    case 'collectorDetail':
      return <CollectorDetailPage {...p} />;
    case 'salesAgentDetail':
      return <SalesAgentDetailPage {...p} />;
    case 'ciQueue':
      return <CIQueuePage {...p} />;
    case 'ciDetail':
      return <CIDetailPage {...p} />;
    case 'leafletMap':
    case 'leafletTerritory':
    case 'leafletDelinquency':
    case 'leafletProfitability':
      return <BranchLeafletPage pageType={page.pageType} {...p} />;
    case 'accountLocationDetail':
      return <AccountLocationDetailPage {...p} />;
    case 'reports':
    case 'reportCollection':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':
      return <ReportsHubPage {...p} />;
    case 'staffPerformance':
    case 'staffCollectors':
    case 'staffSales':
    case 'staffScorecards':
      return <StaffPerformancePage {...p} />;
    case 'alerts':
      return <AlertsPage {...p} />;
    case 'creditHistory':
      return <CreditHistoryListPage navigate={navigate} showToast={showToast} basePath={`${opsBase}/credit-history`} userBranch={currentUser?.branch?.name} />;
    case 'creditDetail':
      return <CreditHistoryDetailPage creditId={page.params?.creditId} navigate={navigate} basePath={`${opsBase}/credit-history`} />;
    case 'notifications':
      return <NotificationsPage {...p} />;
    case 'approvalCenter':
      return <ApprovalCenterPage {...p} />;
    case 'profile':
      return <ProfilePage {...p} />;
    case 'auditLog':
      return <AuditLogPage {...p} />;
    default:
      return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}