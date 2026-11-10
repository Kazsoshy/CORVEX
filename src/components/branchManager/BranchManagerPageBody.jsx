import { Pagination } from '../shared/Pagination';
import { StatsGrid, Stats } from '../shared/StatsGrid';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useRef, useState } from 'react';
import { confirmAction } from '../shared/confirmAction.jsx';
import { Link } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime, formatPhone } from '../../data/branchManagerMockData';
import { ApprovalCenterPage } from './ApprovalCenterPage.jsx';
import {
  fetchOperationalAlerts,
  patchOperationalAlert,
  mapOperationalAlertRow,
  alertDeepLink,
} from '../../api/operationalAlertsService.js';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead, mapNotificationRow } from '../../api/notificationService.js';
import { BranchInventoryViewPage } from '../inventory/BranchInventoryViewPage.jsx';
import { SawResultsPage } from '../operatingManager/SawResultsPage.jsx';
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
  getStaffPerformance,
  getBranchCustomers,
  getBranchAlerts,
  getBranchAuditLogs,
} from '../../api/branchManagerService.js';
import { getReportCollection, getReportSales, getReportInventory, getReportDelinquency, getReportCompliance, getReportKPI, getReportInvoices } from '../../api/reportsService.js';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';
import { TerritoriesPage } from '../territories/TerritoriesPage';
import { InvoiceDetailsPage } from '../sales/InvoiceDetailsPage';
import { BranchLeafletPage } from './BranchLeafletPage';
import { FieldActivityReportsPage, FieldActivityReportDetailPage } from './FieldActivityReportsPages.jsx';
import { CollectorsDispatchRoster, CollectorDispatchDetailPage } from './CollectorsDispatchPages.jsx';
import { SalesAgentsDispatchRoster, SalesAgentDispatchDetailPage } from './SalesAgentsDispatchPages.jsx';
import { BranchCustomersPage, BranchCustomerDetailPage } from './BranchCustomersPages.jsx';
import { CreditInvestigationQueuePage, CreditInvestigationDetailPage } from './CreditInvestigationPages.jsx';
import { formatMiddleNameDisplay } from '../../utils/customerDisplay.js';
import { downloadPdf, exportRows } from '../../utils/dataExport.js';
import { UserSettingsPanel } from '../shared/UserSettingsPanel';
import { chartSeries } from '../../theme/palette.js';
import { ChartDrilldownModal } from '../shared/ChartDrilldownModal.jsx';
import { useChartDrilldown } from '../../hooks/useChartDrilldown.js';
import { formatCurrency as formatMoney } from '../../utils/formatters.js';
import { BranchManagerDashboardPage } from './BranchManagerDashboardPage.jsx';

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
function DashboardPage(props) {
  return <BranchManagerDashboardPage {...props} />;
}

// ── Field Operations (combined hub + tab navigation) ─────────────────────────
function FieldOperationsHub({
  navigate,
  showToast,
  pageType,
  opsBase,
  branchName,
}) {
  const { drilldown, closeDrilldown, openLocalDrilldown } = useChartDrilldown({ showToast });
  const initialTab = pageType === 'routePerformance' ? 'performance' : 'overview';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: [],
    dispatchDate: null,
  });
  const [loading, setLoading] = useState(true);
  const tabs = [{
    key: 'overview',
    label: 'Overview',
    path: `${opsBase}/field-operations`,
  }, {
    key: 'performance',
    label: 'Today\'s Routes',
    path: `${opsBase}/field-operations/performance`,
  }];
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const staffData = await getBranchStaff();
      if (staffData.success) setStaff(staffData.data || { collectors: [], salesAgents: [] });
      else {
        setStaff({ collectors: [], salesAgents: [] });
        showToast?.(staffData.message || 'Failed to load field staff.', 'error');
      }
      setLoading(false);
    }
    fetchData();
  }, [showToast]);

  const activeCollectors = (staff.collectors || []).filter((c) => c.status !== 'Inactive');
  const activeAgents = (staff.salesAgents || []).filter((a) => a.status !== 'Inactive');
  const collectorsOnRoute = activeCollectors.filter((c) => (c.todayStops || 0) > 0).length;
  const agentsAssigned = activeAgents.filter((a) => (a.areasAssignedToday || 0) > 0).length;

  const collectorDispatchChart = activeCollectors.map((c) => ({
    name: c.name.split(' ')[0],
    stops: c.todayStops || 0,
    completed: c.todayCompleted || 0,
  }));
  const salesChart = activeAgents.map((a) => ({
    name: a.name.split(' ')[0],
    areas: a.areasAssignedToday || 0,
    salesToday: a.salesTodayCount || 0,
  }));

  const routePerformanceRows = useMemo(() => [
    ...activeCollectors.map((c) => ({
      id: `collector-${c.id}`,
      staffId: c.id,
      name: c.name,
      type: 'Collector',
      detailPath: `${opsBase}/field-operations/collectors/${c.id}`,
      status: c.todayRouteStatus || 'No Route',
      progress: `${c.todayCompleted || 0}/${c.todayStops || 0} stops`,
      remaining: c.todayRemaining ?? 0,
    })),
    ...activeAgents.map((a) => ({
      id: `sales-${a.id}`,
      staffId: a.id,
      name: a.name,
      type: 'Sales',
      detailPath: `${opsBase}/field-operations/sales/${a.id}`,
      status: a.workStatus || 'No Assignment',
      progress: `${a.areasDoneToday || 0}/${a.areasAssignedToday || 0} areas`,
      remaining: Math.max(0, (a.areasAssignedToday || 0) - (a.areasDoneToday || 0)),
    })),
  ], [activeCollectors, activeAgents, opsBase]);
  const pagination_route_performance = usePagination(routePerformanceRows);
  const paginated_route_performance = pagination_route_performance.paginatedData;
  if (loading) return <LoadingState variant="dashboard" message="Loading routes and schedules..." />;
  return <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Field Operations</h3>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Assign, dispatch, and monitor today’s field work for {branchName || 'your branch'}.
          {staff.dispatchDate ? ` · Dispatch date ${formatDisplayDate(staff.dispatchDate)}` : ''}
        </p>
      </section>
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => { setTab(t.key); navigate(t.path); }}>{t.label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/field-operations/collectors`)}>
          Open Collector Dispatch
        </button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/field-operations/sales`)}>
          Open Sales Agent Dispatch
        </button>
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/staff-performance?period=week&tab=collectors`)}>
          Staff Performance
        </button>
      </div>

      {tab === 'overview' && <>
        <Stats stats={[{
        label: 'Active Collectors',
        value: String(activeCollectors.length)
      }, {
        label: 'Active Sales Agents',
        value: String(activeAgents.length)
      }, {
        label: 'Collectors On Route Today',
        value: String(collectorsOnRoute)
      }, {
        label: 'Agents With Areas Today',
        value: String(agentsAssigned)
      }]} />
        <div className="grid two-up">
          <Card title="Collector Routes Today" sub="Stops assigned vs completed today">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={collectorDispatchChart}
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (!label) return;
                  const match = activeCollectors.filter((c) => String(c.name || '').split(' ')[0] === label);
                  openLocalDrilldown({
                    title: 'Collector route today',
                    category: label,
                    columnSet: 'staff',
                    rows: match.map((c) => ({
                      name: c.name,
                      todayStops: c.todayStops,
                      todayCompleted: c.todayCompleted,
                      status: c.todayRouteStatus || 'No Route',
                    })),
                    totals: [{ label: 'Collectors', value: match.length }],
                    filenameBase: `collector-route-${label}`,
                  });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="stops" name="Stops Assigned" fill="#153450" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Stops Completed" fill="#0B2133" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Areas Today" sub="Assigned areas & sales logged today">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={salesChart}
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (!label) return;
                  const match = activeAgents.filter((a) => String(a.name || '').split(' ')[0] === label);
                  openLocalDrilldown({
                    title: 'Sales agent dispatch',
                    category: label,
                    columnSet: 'staff',
                    rows: match.map((a) => ({
                      name: a.name,
                      areasAssignedToday: a.areasAssignedToday,
                      salesTodayCount: a.salesTodayCount,
                      status: a.workStatus || a.status || 'Active',
                    })),
                    totals: [{ label: 'Agents', value: match.length }],
                    filenameBase: `agent-${label}`,
                  });
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="areas" name="Areas Assigned" fill="#153450" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salesToday" name="Sales Today" fill="#0B2133" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Dispatch shortcuts" sub="Planning happens on the dedicated dispatch pages">
          <p className="muted">Collectors get collection routes. Sales Agents get canvassing areas. Period rankings live under Staff Performance.</p>
          <div className="flex flex-wrap gap-2">
            <button className="button" type="button" onClick={() => navigate(`${opsBase}/field-operations/collectors`)}>
              Collector Dispatch
            </button>
            <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/field-operations/sales`)}>
              Sales Agent Dispatch
            </button>
          </div>
        </Card>
      </>}

      {tab === 'performance' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <div>
              <h3 style={{ margin: 0 }}>Today&apos;s operational snapshot</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Live dispatch status only. Open Staff Performance for period rankings.
              </p>
            </div>
          </div>
          {!routePerformanceRows.length ? (
            <EmptyState title="No operational data" description="Collectors and sales agents assigned to this branch will appear here." />
          ) : <>
            <div className="corvex-table-wrapper">
              <table className="corvex-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>Today Status</th>
                    <th>Progress</th>
                    <th>Remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated_route_performance.map((row) => (
                    <tr key={row.id} className="clickable-row" onClick={() => navigate(row.detailPath)}>
                      <td><strong>{row.name}</strong></td>
                      <td>{row.type}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{row.progress}</td>
                      <td>{row.remaining}</td>
                      <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="button ghost" type="button" onClick={() => navigate(row.detailPath)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination_route_performance} />
          </>}
        </section>}
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}

// ── Reports & Analytics (combined with tab nav) ───────────────────────────────
function ReportsHubPage({
  navigate,
  showToast,
  pageType,
  opsBase,
  branchName,
}) {
  const { drilldown, closeDrilldown, openApiDrilldown, openLocalDrilldown } = useChartDrilldown({ showToast });
  const initialTab = pageType === 'reportSales' ? 'sales'
    : pageType === 'reportInventory' ? 'inventory'
      : pageType === 'reportDelinquency' ? 'delinquency'
        : pageType === 'reportInvoices' ? 'invoices'
          : pageType === 'reportCollection' ? 'collection'
            : 'collection';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (pageType === 'reports') {
      navigate(`${opsBase}/reports/collection`, { replace: true });
    }
  }, [pageType, opsBase, navigate]);
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
  const [invoiceSummary, setInvoiceSummary] = useState(null);
  const [invoicePagination, setInvoicePagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [invoicePage, setInvoicePage] = useState(1);
  const [loadErrors, setLoadErrors] = useState({});
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingInvoices, setExportingInvoices] = useState(false);

  const tabs = [{
    key: 'collection',
    label: 'Collections',
    path: `${opsBase}/reports/collection`,
  }, {
    key: 'sales',
    label: 'Sales',
    path: `${opsBase}/reports/sales`,
  }, {
    key: 'inventory',
    label: 'Inventory',
    path: `${opsBase}/reports/inventory`,
  }, {
    key: 'delinquency',
    label: 'Delinquency',
    path: `${opsBase}/reports/delinquency`,
  }, {
    key: 'invoices',
    label: 'Sales Invoices',
    path: `${opsBase}/reports/invoices`,
  }];

  const reloadCore = async () => {
    setLoading(true);
    setLoadErrors({});
    const [
      staffResult,
      collectionResult,
      salesResult,
      inventoryResult,
      delinquencyResult,
      complianceResult,
      kpiResult,
    ] = await Promise.all([
      getBranchStaff(),
      getReportCollection(),
      getReportSales(),
      getReportInventory(),
      getReportDelinquency(),
      getReportCompliance(),
      getReportKPI(),
    ]);
    const nextErrors = {};
    if (staffResult.success) setStaff(staffResult.data || { collectors: [], salesAgents: [] });
    else nextErrors.staff = true;
    if (collectionResult.success) setCollectionData(collectionResult.data);
    else { setCollectionData(null); nextErrors.collection = true; }
    if (salesResult.success) setSalesData(salesResult.data);
    else { setSalesData(null); nextErrors.sales = true; }
    if (inventoryResult.success) setInventoryData(inventoryResult.data);
    else { setInventoryData(null); nextErrors.inventory = true; }
    if (delinquencyResult.success) setDelinquencyData(delinquencyResult.data);
    else { setDelinquencyData(null); nextErrors.delinquency = true; }
    if (complianceResult.success) setComplianceData(complianceResult.data);
    else { setComplianceData(null); nextErrors.compliance = true; }
    if (kpiResult.success) setKpi(kpiResult.data);
    else { setKpi(null); nextErrors.kpi = true; }
    setLoadErrors(nextErrors);
    setLoading(false);
  };

  const reloadInvoices = async (page = invoicePage) => {
    const invoiceResult = await getReportInvoices({ page, limit: 50 });
    if (invoiceResult.success) {
      setInvoices(invoiceResult.data || []);
      setInvoiceSummary(invoiceResult.summary || null);
      setInvoicePagination(invoiceResult.pagination || { page, limit: 50, total: (invoiceResult.data || []).length, totalPages: 1 });
      setLoadErrors((prev) => ({ ...prev, invoices: false }));
    } else {
      setInvoices([]);
      setInvoiceSummary(null);
      setLoadErrors((prev) => ({ ...prev, invoices: true }));
    }
  };

  useEffect(() => {
    reloadCore();
  }, []);

  useEffect(() => {
    if (tab === 'invoices') reloadInvoices(invoicePage);
  }, [tab, invoicePage]);

  const collectorAmt = (staff?.collectors || []).map(c => ({
    name: c.name.split(' ')[0],
    amount: c.collectionAmount || 0,
    visitCompletion: c.complianceScore,
  }));
  const agentRev = (staff?.salesAgents || []).map(a => ({
    name: a.name.split(' ')[0],
    revenue: a.totalSalesAmount || 0,
    visits: a.visitCompletionRate,
  }));
  const pagination_inventoryData_lowStockItems = usePagination(inventoryData?.lowStockItems || []);
  const paginated_inventoryData_lowStockItems = pagination_inventoryData_lowStockItems.paginatedData;

  const periodHint = collectionData?.periodLabel
    || salesData?.periodLabel
    || kpi?.periodLabel
    || 'Last 7 days';
  const rangeHint = collectionData?.dateFrom && collectionData?.dateTo
    ? `${formatDisplayDate(collectionData.dateFrom)} – ${formatDisplayDate(collectionData.dateTo)}`
    : null;

  const selectTab = (nextTab) => {
    const match = tabs.find((t) => t.key === nextTab);
    setViewingInvoiceId(null);
    if (match) navigate(match.path);
    else setTab(nextTab);
  };

  if (loading) return <LoadingState message="Loading reports..." />;

  const exportBranchReport = async (format) => {
    let rows = [];
    let title = `Branch ${tab} Report`;
    let filename = `branch-${tab}-report`;
    if (tab === 'collection') {
      if (loadErrors.collection || !collectionData) {
        showToast('Collections report is unavailable. Retry before exporting.', 'error');
        return;
      }
      rows = (collectionData?.daily || []).map((row) => ({ day: row.day, collected: row.amount, target: row.target }));
      title = `Collections vs Target (${periodHint}) — ${branchName || 'Branch'}`;
    } else if (tab === 'sales') {
      if (loadErrors.sales || !salesData) {
        showToast('Sales report is unavailable. Retry before exporting.', 'error');
        return;
      }
      rows = (salesData?.weekly || []).map((row) => ({ day: row.day, actual: row.actual, target: row.target, invoices: row.invoices }));
      title = `Sales Revenue vs Target (${periodHint}) — ${branchName || 'Branch'}`;
    } else if (tab === 'inventory') {
      if (loadErrors.inventory || !inventoryData) {
        showToast('Inventory report is unavailable. Retry before exporting.', 'error');
        return;
      }
      rows = (inventoryData?.lowStockItems || []).map((row) => ({ product: row.product_name, sku: row.sku, stock: row.available_stock, status: row.status }));
      title = `Inventory Alerts — ${branchName || 'Branch'}`;
    } else if (tab === 'delinquency') {
      if (loadErrors.delinquency || !delinquencyData) {
        showToast('Delinquency report is unavailable. Retry before exporting.', 'error');
        return;
      }
      rows = (delinquencyData?.delinquency || []).map((row) => ({ asOf: row.week || row.asOf, accounts: row.accounts, rate: row.rate }));
      title = `Overdue Accounts Trend — ${branchName || 'Branch'}`;
    } else {
      if (loadErrors.invoices) {
        showToast('Invoice report is unavailable. Retry before exporting.', 'error');
        return;
      }
      setExportingInvoices(true);
      const all = [];
      const limit = 200;
      let page = 1;
      let totalPages = 1;
      do {
        const res = await getReportInvoices({ page, limit });
        if (!res.success) {
          setExportingInvoices(false);
          showToast(res.message || 'Failed to load invoices for export.', 'error');
          return;
        }
        all.push(...(res.data || []));
        totalPages = Number(res.pagination?.totalPages) || 1;
        page += 1;
      } while (page <= totalPages);
      setExportingInvoices(false);
      rows = all.map((row) => ({
        invoice: row.invoice_number,
        customer: row.customer_name,
        amount: row.total_amount,
        date: row.invoices_date,
        status: row.status,
      }));
      title = `Sales Invoices (complete filtered set) — ${branchName || 'Branch'}`;
      filename = 'branch-invoices-report';
    }
    const ok = exportRows(rows, { format, filename, title });
    if (ok) showToast(format === 'pdf' ? 'Report exported as PDF.' : 'Excel file downloaded.', 'success');
    else showToast('Nothing to export.', 'error');
  };

  return <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center">
          <div>
            <h3 style={{ margin: 0 }}>Reports</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Analyze and export branch performance in greater detail than the Dashboard.
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {branchName === 'All Branches' ? 'Organization-wide view' : (branchName || 'Branch')}
              {rangeHint ? ` · ${periodHint}: ${rangeHint}` : ` · ${periodHint}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button ghost" type="button" onClick={() => { reloadCore(); if (tab === 'invoices') reloadInvoices(invoicePage); }}>
              Retry / Refresh
            </button>
            <button className="button secondary" type="button" disabled={exportingInvoices} onClick={() => exportBranchReport('pdf')}>
              {exportingInvoices ? 'Preparing…' : 'Export PDF'}
            </button>
            <button className="button secondary" type="button" disabled={exportingInvoices} onClick={() => exportBranchReport('excel')}>
              {exportingInvoices ? 'Preparing…' : 'Export Excel'}
            </button>
          </div>
        </div>
      </section>
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => selectTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'collection' && <>
          {loadErrors.collection ? (
            <EmptyState title="Collections report unavailable" description="The collections API failed. Use Retry / Refresh." />
          ) : !collectionData?.daily?.length ? (
            <EmptyState title="No collection records" description="No confirmed collections found for this reporting period." />
          ) : null}
          <Stats stats={[{
        label: 'Collections (7 days)',
        value: formatCurrency(collectionData?.summary?.totalCollected || 0)
      }, {
        label: 'Collection Rate vs Target',
        value: `${collectionData?.summary?.collectionRate ?? 0}%`
      }, {
        label: 'Period Target',
        value: formatCurrency(collectionData?.summary?.totalTarget || 0)
      }, {
        label: 'Active Days',
        value: String(collectionData?.summary?.daysWithCollections || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Daily Collection vs Target" sub={`${periodHint} · confirmed collections vs daily target × days`}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="target" name="Target" stroke="#E2E8F0" fill="#E2E8F0" strokeWidth={2} strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="amount" name="Collected" stroke="#153450" fill="#153450" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Collector Amounts" sub="Confirmed collections (₱) and visit completion (%) use separate axes">
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
                      dateRange: 'Branch staff metrics',
                      columnSet: 'staff',
                      rows: (match.length ? match : collectorAmt.filter((r) => r.name === label)).map((c) => ({
                        name: c.name,
                        complianceScore: c.complianceScore ?? c.visitCompletion,
                        status: c.status || 'Active',
                      })),
                      totals: [{ label: 'Collectors', value: match.length || 1 }],
                      filenameBase: `collector-${label}`,
                    });
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="amount" name="Collected (₱)" fill="#153450" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="r" dataKey="visitCompletion" name="Visit Completion %" fill="#0B2133" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>}

      {tab === 'sales' && <>
          {loadErrors.sales ? (
            <EmptyState title="Sales report unavailable" description="The sales API failed. Use Retry / Refresh." />
          ) : null}
          <Stats stats={[{
        label: 'Sales (7 days)',
        value: formatCurrency(salesData?.summary?.totalActual || 0)
      }, {
        label: 'Sales Revenue vs Target',
        value: `${salesData?.summary?.salesEfficiency ?? 0}%`
      }, {
        label: 'Invoices',
        value: String(salesData?.summary?.totalInvoices || 0)
      }, {
        label: 'Period Target',
        value: formatCurrency(salesData?.summary?.totalTarget || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Sales Revenue vs Target" sub={`${periodHint} · qualifying invoices vs daily target × days`}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="#E2E8F0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#153450" radius={[4, 4, 0, 0]} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
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
                  <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#153450" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="r" dataKey="visits" name="Visit Completion %" fill="#0B2133" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>}

      {tab === 'inventory' && <>
          {loadErrors.inventory ? (
            <EmptyState title="Inventory report unavailable" description="The inventory API failed. Use Retry / Refresh." />
          ) : !inventoryData?.totalProducts ? (
            <EmptyState title="No inventory records" description="No monitored stock products for this branch." />
          ) : null}
          <Stats stats={[{
        label: 'Healthy Stock Rate',
        value: `${inventoryData?.healthPct ?? 0}%`
      }, {
        label: 'Stock Alerts',
        value: String(inventoryData?.alertsCount || 0)
      }, {
        label: 'Monitored Products',
        value: String(inventoryData?.totalProducts || 0)
      }, {
        label: 'Out of Stock',
        value: String(inventoryData?.summary?.outOfStock || 0)
      }]} />
          <div className="grid two-up">
            <Card title="Inventory Status" sub="Sufficient / Low / Critical / Out — mutually exclusive bands">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Sufficient', value: inventoryData?.summary?.sufficient || 0, color: '#153450' },
                      { name: 'Low Stock', value: inventoryData?.summary?.low || 0, color: '#f59e0b' },
                      { name: 'Critical Stock', value: inventoryData?.summary?.critical || 0, color: '#ef4444' },
                      { name: 'Out of Stock', value: inventoryData?.summary?.outOfStock || 0, color: '#5F7385' },
                    ].filter((d) => d.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
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
                    {[
                      { name: 'Sufficient', color: '#153450' },
                      { name: 'Low Stock', color: '#f59e0b' },
                      { name: 'Critical Stock', color: '#ef4444' },
                      { name: 'Out of Stock', color: '#5F7385' },
                    ].map((entry) => <Cell key={entry.name} fill={entry.color} />)}
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
          {loadErrors.delinquency ? (
            <EmptyState title="Delinquency report unavailable" description="The delinquency API failed. Use Retry / Refresh." />
          ) : !delinquencyData?.delinquency?.length ? (
            <EmptyState title="No delinquency data" description="No overdue snapshot data for this reporting window." />
          ) : null}
          <Stats stats={[{
        label: 'Current Overdue Accounts',
        value: String(delinquencyData?.summary?.currentOverdue ?? delinquencyData?.summary?.totalOverdue ?? 0),
        title: 'Distinct customers with at least one unpaid past-due invoice today.',
      }, {
        label: 'Current Overdue Rate',
        value: `${delinquencyData?.summary?.avgRate || 0}%`,
      }, {
        label: 'Trend vs prior week',
        value: delinquencyData?.summary?.trend || 'stable',
      }, {
        label: 'Healthy Stock Rate',
        value: `${kpi?.inventoryHealth ?? 0}%`,
      }]} />
          <div className="grid two-up">
            <Card title="Overdue Accounts Trend" sub="Historical week-end snapshots · click a week for that population">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={delinquencyData?.delinquency || []}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const asOf = state?.activeLabel;
                    openApiDrilldown(
                      { type: 'delinquency', ...(asOf ? { asOf } : {}) },
                      {
                        title: 'Overdue accounts',
                        category: asOf ? `As of ${asOf}` : 'Current overdue',
                        dateRange: asOf || 'Current',
                        columnSet: 'customers',
                        filenameBase: asOf ? `delinquency-${asOf}` : 'delinquency',
                      }
                    );
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area yAxisId="l" type="monotone" dataKey="accounts" name="Overdue accounts" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={2} />
                  <Area yAxisId="r" type="monotone" dataKey="rate" name="Overdue rate %" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Visit Completion Rate" sub="Completed ÷ valid assigned collection visits · N/A when none assigned">
              {loadErrors.compliance ? (
                <EmptyState title="Visit completion unavailable" description="The compliance API failed." />
              ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={complianceData?.compliance?.[0]?.data?.map((d, i) => {
              const point = {
                week: d.week
              };
              complianceData.compliance.forEach(c => {
                const rate = c.data[i]?.rate;
                point[c.name] = rate == null ? null : rate;
              });
              return point;
            }) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => (v == null ? 'N/A' : `${v}%`)} />
                  <Legend />
                  {complianceData?.compliance?.map((c, i) => (
                    <Line
                      key={c.name}
                      type="monotone"
                      dataKey={c.name}
                      stroke={['#153450', '#0B2133', '#5F7385', '#f59e0b', '#ef4444'][i % 5]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>}

      {tab === 'invoices' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4" style={{
        marginBottom: 8
      }}>
            <h3>Sales Invoices</h3>
          </div>

          {loadErrors.invoices ? (
            <EmptyState title="Invoice report unavailable" description="The invoices API failed. Use Retry / Refresh." />
          ) : invoices.length ? <>
              <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 16,
          margin: '4px 0 20px'
        }}>
                {[{
            label: 'Total Invoices',
            value: String(invoiceSummary?.total ?? invoicePagination.total ?? 0)
          }, {
            label: 'Confirmed',
            value: String(invoiceSummary?.confirmed ?? 0)
          }, {
            label: 'Pending Review',
            value: String(invoiceSummary?.pendingReview ?? 0)
          }, {
            label: 'Total Value',
            value: formatCurrency(invoiceSummary?.totalValue ?? 0)
          }].map(s => <div key={s.label} style={{
            padding: 14,
            background: '#eef0f4',
            border: '1px solid #E2E8F0',
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

              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      {branchName === 'All Branches' ? <th>Branch</th> : null}
                      <th>Invoice Date</th>
                      <th>Total Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
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
                          {branchName === 'All Branches' ? <td>{inv.branch_name || '—'}</td> : null}
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
              </div>
              <Pagination
                currentPage={invoicePagination.page || invoicePage}
                totalPages={invoicePagination.totalPages || 1}
                totalRecords={invoicePagination.total || 0}
                pageSize={invoicePagination.limit || 50}
                startRecord={((invoicePagination.page || invoicePage) - 1) * (invoicePagination.limit || 50) + 1}
                endRecord={Math.min((invoicePagination.page || invoicePage) * (invoicePagination.limit || 50), invoicePagination.total || 0)}
                nextPage={() => setInvoicePage((p) => Math.min((invoicePagination.totalPages || 1), p + 1))}
                prevPage={() => setInvoicePage((p) => Math.max(1, p - 1))}
                goToPage={(page) => setInvoicePage(page)}
              />
            </> : <EmptyState title="No invoices found" description="No sales invoices exist for this scope yet." />}
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
          <Card title="Overall KPI Summary" sub={loadErrors.kpi ? 'KPI API unavailable — figures below may be incomplete.' : periodHint}>
            <Stats stats={[{
              label: 'Collection Rate vs Target',
              value: `${kpi?.collectionRate ?? 0}%`,
              title: 'Confirmed collections ÷ (daily target × period days).',
            }, {
              label: 'Healthy Stock Rate',
              value: `${kpi?.inventoryHealth ?? 0}%`,
              title: 'Sufficient products ÷ monitored products × 100.',
            }, {
              label: 'Overdue Accounts',
              value: String(kpi?.overdueCount ?? 0),
              title: 'Distinct customers with unpaid past-due invoices.',
            }, {
              label: 'Stock Alerts',
              value: String(kpi?.stockAlertsCount || 0),
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
            }]} />
          </Card>
        </div>}
      <ChartDrilldownModal {...drilldown} onClose={closeDrilldown} showToast={showToast} />
    </div>;
}

// ── Staff Performance (improved) ──────────────────────────────────────────────
function parseStaffPerformanceQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    const periodRaw = String(q.get('period') || 'week').toLowerCase();
    const period = periodRaw === 'month' ? 'month' : 'week';
    const tabRaw = String(q.get('tab') || '').toLowerCase();
    const tab = tabRaw === 'sales' ? 'sales' : 'collectors';
    return { period, tab };
  } catch {
    return { period: 'week', tab: 'collectors' };
  }
}

function formatVisitCompletion(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  return `${Number(value)}%`;
}

function StaffPerformancePage({
  navigate,
  pageType,
  opsBase,
  branchName,
  showToast,
}) {
  const pathTab = pageType === 'staffSales' ? 'sales' : 'collectors';
  const initialQuery = parseStaffPerformanceQuery();
  const [tab, setTab] = useState(pageType === 'staffPerformance' ? initialQuery.tab : pathTab);
  const [period, setPeriod] = useState(initialQuery.period);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (pageType === 'staffSales') setTab('sales');
    else if (pageType === 'staffCollectors' || pageType === 'staffScorecards') setTab('collectors');
  }, [pageType]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const result = await getStaffPerformance({ period });
      if (cancelled) return;
      if (result.success && result.data) {
        setPayload(result.data);
      } else {
        setPayload(null);
        setError(result.message || 'Failed to load staff performance.');
        showToast?.(result.message || 'Failed to load staff performance.', 'error');
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [period, showToast]);

  const syncUrl = (nextPeriod, nextTab) => {
    const params = new URLSearchParams();
    params.set('period', nextPeriod);
    params.set('tab', nextTab);
    navigate(`${opsBase}/staff-performance?${params.toString()}`);
  };

  const changePeriod = (next) => {
    setPeriod(next);
    syncUrl(next, tab);
  };

  const changeTab = (next) => {
    setTab(next);
    syncUrl(period, next);
  };

  const collectors = payload?.collectors || [];
  const salesAgents = payload?.salesAgents || [];
  const showBranchCol = Boolean(payload && payload.branchScoped === false);
  const paginationCollectors = usePagination(collectors);
  const paginationSales = usePagination(salesAgents);

  const periodLabel = payload?.periodLabel
    || (period === 'month' ? 'This Month' : 'This Week');
  const rangeLabel = payload?.dateFrom && payload?.dateTo
    ? `${formatDisplayDate(payload.dateFrom)} – ${formatDisplayDate(payload.dateTo)}`
    : '—';

  const openCollector = (id) => {
    navigate(`${opsBase}/field-operations/collectors/${id}?period=${period}`);
  };
  const openSalesAgent = (id) => {
    navigate(`${opsBase}/field-operations/sales/${id}?period=${period}`);
  };

  if (loading && !payload) {
    return <LoadingState message="Loading staff performance…" />;
  }

  return (
    <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div>
            <h3 style={{ margin: 0 }}>Staff Performance</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Review collection and sales performance for {branchName || 'your branch'}.
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {periodLabel}: {rangeLabel}
              {showBranchCol ? ' · Organization-wide view (branch shown per staff)' : ''}
            </p>
          </div>
          <div className="segmented-control">
            {[
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
            ].map((p) => (
              <button
                key={p.key}
                className={period === p.key ? 'segment active' : 'segment'}
                type="button"
                disabled={loading}
                onClick={() => changePeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="segmented-control" style={{ marginBottom: 12 }}>
        <button
          className={tab === 'collectors' ? 'segment active' : 'segment'}
          type="button"
          onClick={() => changeTab('collectors')}
        >
          Collectors ({collectors.length})
        </button>
        <button
          className={tab === 'sales' ? 'segment active' : 'segment'}
          type="button"
          onClick={() => changeTab('sales')}
        >
          Sales Agents ({salesAgents.length})
        </button>
      </div>

      {error && !payload ? (
        <EmptyState title="Could not load performance" description={error} />
      ) : null}

      {tab === 'collectors' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3 style={{ margin: 0 }}>Collector rankings</h3>
            <p className="list-section-subtitle">
              Ranked by visit completion, then confirmed collections. Visit Completion = completed ÷ valid assigned visits in the period (N/A when none assigned).
            </p>
          </div>
          {!collectors.length ? (
            <EmptyState title="No collectors" description="Active collectors for this scope will appear here." />
          ) : (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Collector</th>
                      {showBranchCol ? <th>Branch</th> : null}
                      <th>Visit Completion</th>
                      <th>Collected</th>
                      <th>Missed Visits</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationCollectors.paginatedData.map((c) => (
                      <tr
                        key={c.id}
                        className="clickable-row"
                        onClick={() => openCollector(c.id)}
                      >
                        <td>#{c.rank}</td>
                        <td><strong>{c.name}</strong></td>
                        {showBranchCol ? <td>{c.branchName || '—'}</td> : null}
                        <td>{formatVisitCompletion(c.visitCompletion)}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(c.collectedAmount || 0)}</td>
                        <td>{c.missedVisits ?? 0}</td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="button ghost" type="button" onClick={() => openCollector(c.id)}>
                            Open details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationCollectors} />
            </>
          )}
        </section>
      ) : null}

      {tab === 'sales' ? (
        <section className="panel content-panel relative overflow-hidden">
          <div className="list-section-header">
            <h3 style={{ margin: 0 }}>Sales Agent rankings</h3>
            <p className="list-section-subtitle">
              Ranked by confirmed invoice revenue, then visit completion, then new customers created in the period.
            </p>
          </div>
          {!salesAgents.length ? (
            <EmptyState title="No sales agents" description="Active sales agents for this scope will appear here." />
          ) : (
            <>
              <div className="corvex-table-wrapper">
                <table className="corvex-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Sales Agent</th>
                      {showBranchCol ? <th>Branch</th> : null}
                      <th>Visit Completion</th>
                      <th>Confirmed Revenue</th>
                      <th>New Customers</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationSales.paginatedData.map((a) => (
                      <tr
                        key={a.id}
                        className="clickable-row"
                        onClick={() => openSalesAgent(a.id)}
                      >
                        <td>#{a.rank}</td>
                        <td><strong>{a.name}</strong></td>
                        {showBranchCol ? <td>{a.branchName || '—'}</td> : null}
                        <td>{formatVisitCompletion(a.visitCompletion)}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(a.confirmedRevenue || 0)}</td>
                        <td>{a.newCustomers ?? 0}</td>
                        <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="button ghost" type="button" onClick={() => openSalesAgent(a.id)}>
                            Open details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationSales} />
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

// ── Alerts & Exceptions (BM exception desk) ───────────────────────────────────
function AlertsPage({
  navigate,
  showToast,
  currentUser,
  opsBase,
  branchName,
}) {
  const [view, setView] = useState('open'); // open | mine | resolved
  const [category, setCategory] = useState('All');
  const [severity, setSeverity] = useState('All');
  const [search, setSearch] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveNote, setResolveNote] = useState('');
  const [escalateTarget, setEscalateTarget] = useState(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const params = { limit: 200 };
    if (view === 'open') params.status = 'Open';
    else if (view === 'mine') {
      params.mine = '1';
      params.status = 'Open';
    } else if (view === 'resolved') params.status = 'Resolved';
    if (category !== 'All') params.category = category;
    if (severity !== 'All') params.severity = severity;
    if (search.trim()) params.search = search.trim();

    const res = await fetchOperationalAlerts(params);
    if (res.success) {
      setAlerts((res.data || []).map(mapOperationalAlertRow));
    } else {
      setAlerts([]);
      setLoadError(res.message || 'Failed to load alerts.');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [view, category, severity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return alerts;
    return alerts.filter((a) => (
      String(a.title || '').toLowerCase().includes(q)
      || String(a.message || '').toLowerCase().includes(q)
      || String(a.category || '').toLowerCase().includes(q)
      || String(a.assignedToName || '').toLowerCase().includes(q)
    ));
  }, [alerts, search]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;
  const alertLock = useRef(false);

  const assignAlert = async (alertId) => {
    if (alertLock.current) return;
    alertLock.current = true;
    const alert = alerts.find((item) => item.id === alertId);
    const confirmed = await confirmAction({
      title: 'Assign alert',
      message: 'This assigns the follow-up to you.',
      detail: alert?.title || alert?.message || `Alert ${alertId}`,
      confirmLabel: 'Assign to me',
    });
    if (!confirmed) {
      alertLock.current = false;
      return;
    }
    const result = await patchOperationalAlert(alertId, { assigned_to: currentUser?.id });
    alertLock.current = false;
    if (result.success) {
      showToast('Assigned to you.', 'success');
      load();
    } else showToast(result.message || 'Assign failed.', 'error');
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    const note = resolveNote.trim();
    if (!note) {
      showToast('Resolution note is required.', 'error');
      return;
    }
    setSaving(true);
    const result = await patchOperationalAlert(resolveTarget.id, {
      status: 'Resolved',
      resolution_note: note,
    });
    setSaving(false);
    if (result.success) {
      showToast('Exception resolved.', 'success');
      setResolveTarget(null);
      setResolveNote('');
      load();
    } else showToast(result.message || 'Resolve failed.', 'error');
  };

  const submitEscalate = async () => {
    if (!escalateTarget) return;
    const reason = escalateReason.trim();
    if (!reason) {
      showToast('Escalation reason is required.', 'error');
      return;
    }
    setSaving(true);
    const result = await patchOperationalAlert(escalateTarget.id, {
      escalate: true,
      escalation_reason: reason,
    });
    setSaving(false);
    if (result.success) {
      showToast('Escalated to organization review.', 'success');
      setEscalateTarget(null);
      setEscalateReason('');
      load();
    } else showToast(result.message || 'Escalate failed.', 'error');
  };

  if (loading && !alerts.length && !loadError) return <LoadingState message="Loading alerts..." />;

  const emptyTitle = view === 'resolved'
    ? 'No resolved exceptions yet'
    : view === 'mine'
      ? 'Nothing assigned to you'
      : 'No open exceptions';
  const emptyDesc = loadError
    ? loadError
    : view === 'resolved'
      ? 'Resolved exceptions will appear here with their resolution notes.'
      : view === 'mine'
        ? 'Assign an open exception to yourself to track ownership.'
        : category !== 'All' || severity !== 'All' || search.trim()
          ? 'No alerts match the selected filters.'
          : 'Branch exceptions that need follow-up will appear here.';

  return <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center">
          <div>
            <h3 style={{ margin: 0 }}>Alerts & Exceptions</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Open branch exceptions — assign ownership and resolve after follow-up.
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {branchName === 'All Branches' ? 'Organization-wide view' : (branchName || 'Branch')}
              {` · ${filtered.length} shown`}
            </p>
          </div>
          <button className="button ghost" type="button" onClick={load}>Retry / Refresh</button>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-toolbar" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div className="segmented-control">
            {[
              { key: 'open', label: 'Open' },
              { key: 'mine', label: 'Assigned to Me' },
              { key: 'resolved', label: 'Resolved' },
            ].map((v) => (
              <button
                key={v.key}
                className={view === v.key ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="segmented-control">
            {['All', 'Field Incident', 'Inventory', 'Collection', 'Delinquency', 'Route Operations'].map((f) => (
              <button
                key={f}
                className={category === f ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setCategory(f)}
              >
                {f === 'Route Operations' ? 'Route' : f}
              </button>
            ))}
          </div>
          <div className="segmented-control">
            {['All', 'Critical', 'Warning', 'Informational'].map((s) => (
              <button
                key={s}
                className={severity === s ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setSeverity(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ minWidth: 200, flex: '1 1 200px' }}
            placeholder="Search title, message, owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          />
        </div>

        {loadError && !filtered.length ? (
          <EmptyState title="Alerts unavailable" description={loadError} />
        ) : filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Created</th>
                  <th>Age</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const deep = alertDeepLink(a, opsBase);
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.title}</strong>
                        <div className="muted" style={{ fontSize: '0.85rem', marginTop: 2, maxWidth: 360 }}>
                          {a.message}
                        </div>
                        {a.escalated ? (
                          <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>Escalated</div>
                        ) : null}
                        {a.resolved && a.resolutionNote ? (
                          <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                            Resolution: {a.resolutionNote}
                          </div>
                        ) : null}
                      </td>
                      <td>{a.category || a.type || '—'}</td>
                      <td><Severity severity={a.severity} /></td>
                      <td>{formatDisplayDateTime(a.time || a.date)}</td>
                      <td>{a.resolved ? '—' : a.ageLabel}</td>
                      <td>{a.assignedToName || 'Unassigned'}</td>
                      <td>
                        <StatusBadge status={a.resolved ? 'Resolved' : (a.escalated ? 'Escalated' : (a.status || 'Open'))} />
                      </td>
                      <td className="table-actions">
                        {deep ? (
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Open related record"
                            onClick={() => navigate(deep)}
                          >
                            <NavIcon name="view" />
                          </button>
                        ) : null}
                        {!a.resolved ? <>
                          <button
                            className="icon-action-button"
                            type="button"
                            title={a.assignedTo === currentUser?.id ? 'Assigned to you' : 'Assign to Me'}
                            onClick={() => assignAlert(a.id)}
                          >
                            <NavIcon name="user" />
                          </button>
                          <button
                            className="icon-action-button"
                            type="button"
                            title="Resolve"
                            onClick={() => { setResolveTarget(a); setResolveNote(''); }}
                          >
                            <NavIcon name="check" />
                          </button>
                          {!a.escalated ? (
                            <button
                              className="icon-action-button"
                              type="button"
                              title="Escalate"
                              onClick={() => { setEscalateTarget(a); setEscalateReason(''); }}
                            >
                              <NavIcon name="alert" />
                            </button>
                          ) : null}
                        </> : <span className="muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : <EmptyState title={emptyTitle} description={emptyDesc} />}
      </section>

      {resolveTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Resolve exception" onClick={() => !saving && setResolveTarget(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Resolve exception</h3>
            <p className="muted">{resolveTarget.title}</p>
            <label className="field-label" htmlFor="resolve-note">Resolution note</label>
            <textarea
              id="resolve-note"
              className="input"
              rows={4}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Describe the follow-up completed…"
            />
            <div className="flex gap-2 justify-end" style={{ marginTop: 12 }}>
              <button className="button ghost" type="button" disabled={saving} onClick={() => setResolveTarget(null)}>Cancel</button>
              <button className="button" type="button" disabled={saving} onClick={submitResolve}>
                {saving ? 'Saving…' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {escalateTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Escalate exception" onClick={() => !saving && setEscalateTarget(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Escalate to organization</h3>
            <p className="muted">{escalateTarget.title}</p>
            <label className="field-label" htmlFor="escalate-reason">Reason</label>
            <textarea
              id="escalate-reason"
              className="input"
              rows={4}
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="Why does this need OM / org-level intervention?"
            />
            <div className="flex gap-2 justify-end" style={{ marginTop: 12 }}>
              <button className="button ghost" type="button" disabled={saving} onClick={() => setEscalateTarget(null)}>Cancel</button>
              <button className="button" type="button" disabled={saving} onClick={submitEscalate}>
                {saving ? 'Saving…' : 'Escalate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
    title="Branch profile"
    extraActions={<>
      <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/audit-log`)}>Audit log</button>
      <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Approval center</button>
    </>}
    settings={<SettingsPage embedded navigate={navigate} opsBase={opsBase} />}
  />;
}
function branchActivityLabel(log) {
  return String(log?.activity_label || log?.activity || log?.action || '—').trim() || '—';
}

function branchActivityDetailRows(log) {
  if (!log) return [];
  return [
    { key: 'timestamp', label: 'Date & Time', value: formatDisplayDateTime(log.created_at) },
    { key: 'user', label: 'User', value: log.user_name || (log.user_id ? `User #${log.user_id}` : 'System') },
    { key: 'role', label: 'Role', value: log.role_name || '—' },
    { key: 'module', label: 'Module', value: log.module || '—' },
    { key: 'activity', label: 'Activity', value: branchActivityLabel(log) },
    { key: 'status', label: 'Status', value: <StatusBadge status={log.status || log.status_details || '—'} /> },
    { key: 'reference', label: 'Reference', value: log.affected_record || '—' },
    { key: 'branch', label: 'Affected Branch', value: log.branch_name || '—' },
    { key: 'description', label: 'Details', value: String(log.description || log.status_details || '—') },
    { key: 'ip', label: 'IP Address', value: log.ip_address || '—' },
  ];
}

function referenceDeepLink(log, opsBase) {
  const ref = String(log?.affected_record || '');
  const [kind, id] = ref.split(':');
  if (!kind || !id) return null;
  if (kind === 'credit_investigation') return `${opsBase}/ci-approvals/${id}`;
  if (kind === 'invoice') return `${opsBase}/reports/invoices`;
  if (kind === 'customer') return `${opsBase}/customers/${id}`;
  if (kind === 'alert') return `${opsBase}/alerts`;
  if (kind === 'collection_payment' || kind === 'payment') return `${opsBase}/credit-history`;
  if (kind === 'restock' || kind === 'stock_count' || kind === 'transfer') return `${opsBase}/approval-center`;
  return null;
}

function AuditLogPage({
  navigate,
  showToast,
  opsBase,
  branchName,
}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleGroup, setModuleGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewingLog, setViewingLog] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const result = await getBranchAuditLogs({
      limit: 300,
      module: moduleGroup,
      search: search.trim() || undefined,
      actor: actor.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
    if (result.success) setLogs(result.data || []);
    else {
      setLogs([]);
      setError(result.message || 'Failed to load branch activity.');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [moduleGroup, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    // Server already filters; keep lightweight client search for typing without reload.
    const q = search.trim().toLowerCase();
    const a = actor.trim().toLowerCase();
    return logs.filter((l) => {
      if (a && !String(l.user_name || '').toLowerCase().includes(a)) return false;
      if (!q) return true;
      return (
        String(l.user_name || '').toLowerCase().includes(q)
        || String(l.module || '').toLowerCase().includes(q)
        || String(branchActivityLabel(l)).toLowerCase().includes(q)
        || String(l.description || l.status_details || '').toLowerCase().includes(q)
        || String(l.affected_record || '').toLowerCase().includes(q)
      );
    });
  }, [logs, search, actor]);

  const pagination = usePagination(filtered);
  const rows = pagination.paginatedData;

  const resetFilters = () => {
    setModuleGroup('all');
    setSearch('');
    setActor('');
    setDateFrom('');
    setDateTo('');
  };

  const exportActivity = (format) => {
    const exportRowsData = filtered.map((l) => ({
      timestamp: formatDisplayDateTime(l.created_at),
      user: l.user_name || 'System',
      module: l.module || '—',
      activity: branchActivityLabel(l),
      reference: l.affected_record || '—',
      details: l.description || l.status_details || '—',
      branch: l.branch_name || branchName || '—',
    }));
    const ok = exportRows(exportRowsData, {
      format,
      filename: 'branch-activity',
      title: `Branch Activity — ${branchName || 'Branch'}`,
    });
    if (ok) showToast?.(format === 'pdf' ? 'Branch activity exported as PDF.' : 'Excel downloaded.', 'success');
    else showToast?.('Nothing to export.', 'error');
  };

  if (loading && !logs.length && !error) return <LoadingState message="Loading branch activity…" />;

  return <div className="page">
      <section className="panel content-panel" style={{ marginBottom: 12 }}>
        <div className="flex flex-col md:flex-row justify-between gap-3 items-start md:items-center">
          <div>
            <h3 style={{ margin: 0 }}>Branch Activity</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Review important financial and operational activities recorded within your branch.
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {branchName === 'All Branches' ? 'Organization-wide operational activity' : (branchName || 'Branch')}
              {` · ${filtered.length} shown`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button ghost" type="button" onClick={load}>Retry / Refresh</button>
            <button className="button secondary" type="button" onClick={() => exportActivity('pdf')}>Export PDF</button>
            <button className="button secondary" type="button" onClick={() => exportActivity('excel')}>Export Excel</button>
          </div>
        </div>
      </section>

      <section className="panel content-panel relative overflow-hidden">
        <div className="list-section-toolbar" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div className="segmented-control">
            {[
              { key: 'all', label: 'All' },
              { key: 'credit', label: 'Credit' },
              { key: 'approvals', label: 'Approvals' },
              { key: 'collections', label: 'Collections' },
              { key: 'invoices', label: 'Invoices' },
              { key: 'inventory', label: 'Inventory' },
            ].map((m) => (
              <button
                key={m.key}
                className={moduleGroup === m.key ? 'segment active' : 'segment'}
                type="button"
                onClick={() => setModuleGroup(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ minWidth: 160, flex: '1 1 160px' }}
            placeholder="Search activity, user, reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          />
          <input
            className="input"
            style={{ minWidth: 140 }}
            placeholder="Actor"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
          />
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          <button className="button ghost" type="button" onClick={resetFilters}>Reset</button>
        </div>

        {error && !filtered.length ? (
          <EmptyState title="Branch activity unavailable" description={error} />
        ) : filtered.length ? <>
          <div className="corvex-table-wrapper">
            <table className="corvex-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>User</th>
                  <th>Module</th>
                  <th>Activity</th>
                  <th>Reference</th>
                  <th>Details</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const deep = referenceDeepLink(l, opsBase);
                  return (
                    <tr key={l.audit_id ?? l.log_id}>
                      <td>{formatDisplayDateTime(l.created_at)}</td>
                      <td>
                        <strong>{l.user_name || 'System'}</strong>
                        {l.role_name ? <div className="muted" style={{ fontSize: '0.78rem' }}>{l.role_name}</div> : null}
                      </td>
                      <td>{l.module || '—'}</td>
                      <td>{branchActivityLabel(l)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{l.affected_record || '—'}</td>
                      <td style={{ maxWidth: 280 }}>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {String(l.description || l.status_details || '—').slice(0, 140)}
                        </span>
                      </td>
                      <td className="table-actions">
                        <button
                          className="icon-action-button"
                          type="button"
                          title="View details"
                          onClick={() => setViewingLog(l)}
                        >
                          <NavIcon name="view" />
                        </button>
                        {deep ? (
                          <button
                            className="button ghost"
                            type="button"
                            title="Open related record"
                            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                            onClick={() => navigate(deep)}
                          >
                            Open
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} />
        </> : (
          <EmptyState
            title="No branch activity"
            description={moduleGroup !== 'all' || search || actor || dateFrom || dateTo
              ? 'No records match the selected filters.'
              : 'Important credit, approval, collection, and inventory actions will appear here.'}
          />
        )}
      </section>

      {viewingLog ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Branch activity details"
          onClick={() => setViewingLog(null)}
        >
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between gap-3 items-start">
              <div>
                <h3 style={{ margin: 0 }}>{branchActivityLabel(viewingLog)}</h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>{viewingLog.module || 'Branch Activity'}</p>
              </div>
              <button className="button ghost" type="button" onClick={() => setViewingLog(null)}>Close</button>
            </div>
            <div style={{ marginTop: 16 }}>
              <DetailRowsTable rows={branchActivityDetailRows(viewingLog)} />
            </div>
            {referenceDeepLink(viewingLog, opsBase) ? (
              <div className="flex justify-end" style={{ marginTop: 12 }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    const to = referenceDeepLink(viewingLog, opsBase);
                    setViewingLog(null);
                    if (to) navigate(to);
                  }}
                >
                  Open related record
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>;
}

function SettingsPage({
  navigate,
  opsBase,
  embedded = false,
}) {
  return (
    <UserSettingsPanel embedded={embedded} role="branch">
      <p className="muted">Profile, approvals, audit history, and notifications for this branch.</p>
      <div className="settings-link-row">
        <button className="button" type="button" onClick={() => navigate(`${opsBase}/profile`)}>Profile</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/approval-center`)}>Approval Center</button>
        <button className="button secondary" type="button" onClick={() => navigate(`${opsBase}/audit-log`)}>Audit Log</button>
        <button className="button ghost" type="button" onClick={() => navigate(`${opsBase}/notifications`)}>Notifications</button>
      </div>
    </UserSettingsPanel>
  );
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
    customerId: page.params?.customerId || page.params?.accountId,
    reportId: page.params?.reportId,
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
      return <BranchCustomersPage {...p} />;
    case 'customerDetail':
      return <BranchCustomerDetailPage {...p} />;
    case 'territories':
      return <TerritoriesPage {...p} />;
    case 'fieldActivityReports':
      return <FieldActivityReportsPage {...p} />;
    case 'fieldActivityReportDetail':
      return <FieldActivityReportDetailPage {...p} />;
    case 'branchInventory':
      return (
        <BranchInventoryViewPage
          showToast={showToast}
          branchName={branchName}
          navigate={navigate}
          opsBase={opsBase}
          mode="readonly"
        />
      );
    case 'fieldOperations':
    case 'routePerformance':
      return <FieldOperationsHub {...p} />;
    case 'collectorRoutes':
      return <CollectorsDispatchRoster {...p} />;
    case 'collectorDetail':
      return <CollectorDispatchDetailPage {...p} />;
    case 'salesSchedules':
      return <SalesAgentsDispatchRoster {...p} />;
    case 'salesAgentDetail':
      return <SalesAgentDispatchDetailPage {...p} />;
    case 'ciQueue':
      return <CreditInvestigationQueuePage {...p} />;
    case 'ciDetail':
      return <CreditInvestigationDetailPage {...p} />;
    case 'leafletMap':
    case 'leafletTerritory':
    case 'leafletDelinquency':
    case 'leafletProfitability':
      return <BranchLeafletPage pageType={page.pageType} {...p} />;
    case 'reports':
    case 'reportCollection':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':
    case 'reportInvoices':
      return <ReportsHubPage {...p} />;
    case 'sawResults':
      return <SawResultsPage navigate={navigate} showToast={showToast} scope="branch" branchName={branchName} />;
    case 'staffPerformance':
    case 'staffCollectors':
    case 'staffSales':
    case 'staffScorecards':
      return <StaffPerformancePage {...p} />;
    case 'alerts':
      return <AlertsPage {...p} />;
    case 'creditHistory':
      return (
        <CreditHistoryListPage
          navigate={navigate}
          showToast={showToast}
          basePath={`${opsBase}/credit-history`}
          customerBasePath={`${opsBase}/customers`}
          variant="operations"
        />
      );
    case 'creditDetail':
      return (
        <CreditHistoryDetailPage
          creditId={page.params?.creditId}
          navigate={navigate}
          showToast={showToast}
          basePath={`${opsBase}/credit-history`}
          customerBasePath={`${opsBase}/customers`}
          variant="operations"
        />
      );
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