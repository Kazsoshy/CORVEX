import { Pagination } from '../shared/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AUDIT_LOGS, ALERTS, BRANCH_ANALYTICS, CI_QUEUE, formatCurrency, formatDisplayDate, formatDisplayDateTime, getCIById, getMapAccountById, MAP_ACCOUNTS, NOTIFICATIONS } from '../../data/branchManagerMockData';
import { EmptyState } from '../shared/EmptyState';
import { LoadingState } from '../shared/LoadingState';
import { NavIcon } from '../../navIcons';
import LeafletMap from '../common/LeafletMap';
import { StatusBadge } from '../StatusBadge';
import { requestLogout, getCurrentUser } from '../../api/authService.js';
import { getBranchAnalytics, getBranchStaff, getBranchCustomers, getBranchCustomerById, getBranchAlerts } from '../../api/branchManagerService.js';
import { getReportCollection, getReportSales, getReportInventory, getReportDelinquency, getReportCompliance, getReportKPI, getReportInvoices } from '../../api/reportsService.js';
import { CreditHistoryListPage, CreditHistoryDetailPage } from '../shared/CreditHistoryPages';
import { TerritoriesPage } from '../territories/TerritoriesPage';

// Re-export for use in other components
export { getBranchAnalytics, getBranchStaff, getBranchCustomers, getBranchAlerts };
const C = ['#093850', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
function cls(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}
function Stats({
  stats
}) {
  if (!stats?.length) return null;
  return <section className="stats-grid">
      {stats.map((s, i) => <article key={s.label} className="stat-card" style={{
      '--stat-index': i
    }}>
          <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
          <span className="stat-label">{s.label}</span>
          <strong className="stat-value">{s.value}</strong>
        </article>)}
    </section>;
}
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
function StaffCard({
  title,
  metrics,
  actions,
  onAction
}) {
  return <article className="account-card">
      <div className="account-card-header"><h4>{title}</h4></div>
      <div className="account-metrics">
        {metrics.map(m => <div key={m.label}><span className="metric-label">{m.label}</span><strong>{m.value}</strong></div>)}
      </div>
      <div className="account-card-actions">
        {actions.map(a => <button key={a.label} className={cls(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>)}
      </div>
    </article>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardPage({
  navigate,
  branchName
}) {
  const currentUser = getCurrentUser();
  const userName = currentUser?.fullName || 'User';
  const userBranch = currentUser?.branch?.name || branchName || 'Branch';
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
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [analyticsData, alertsData, staffData, customersData, reportCollection, reportSales, reportDelinquency, reportKpi] = await Promise.all([getBranchAnalytics(), getBranchAlerts(), getBranchStaff(), getBranchCustomers(), getReportCollection(), getReportSales(), getReportDelinquency(), getReportKPI()]);
      if (analyticsData.success) setAnalytics(analyticsData.data);
      if (alertsData.success) setAlerts(alertsData.data.alerts);
      if (staffData.success) setStaff(staffData.data);
      if (customersData.success) setCustomers(customersData.data);
      if (reportCollection.success) setCollectionData(reportCollection.data);
      if (reportSales.success) setSalesData(reportSales.data);
      if (reportDelinquency.success) setDelinquencyData(reportDelinquency.data);
      if (reportKpi.success) setKpi(reportKpi.data);
      setLoading(false);
    }
    fetchData();
  }, []);
  const unread = 0; // Would come from notifications API
  const critical = alerts.filter(a => a.severity === 'Critical');
  if (loading) return <LoadingState />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{userBranch}</p>
          <h2>{userName}</h2>
          <p className="text-ink/70">Branch Health: <strong>{analytics?.healthScore || 0}/100</strong></p>
        </div>
        <Link to="/branch-manager/notifications" className="relative p-2 text-ink/70 hover:text-blue hover:bg-blue/5 rounded-full transition-colors cursor-pointer" aria-label={`${unread} unread`}>
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
      label: 'Pending CI Approvals',
      value: String(analytics?.pendingCI || 0)
    }, {
      label: 'Overdue Accounts',
      value: String(kpi?.overdueCount || 0)
    }, {
      label: 'Stock Alerts',
      value: String(kpi?.stockAlertsCount || analytics?.stockAlertsCount || 0)
    }]} />

      <div className="grid two-up">
        <Card title="Daily Collection vs Target" sub="This week">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={collectionData?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="amount" name="Collected" stroke="#093850" fill="#093850" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Sales vs Target" sub="This week">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={salesData?.weekly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{
              fontSize: 12
            }} />
              <YAxis tick={{
              fontSize: 11
            }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} /><Legend />
              <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid two-up">
        <Card title="Delinquency Trend" sub="Weekly overdue accounts">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={delinquencyData?.delinquency || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="week" tick={{
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
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => navigate('/branch-manager/alerts')}>View All</button>
          </div>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {critical.slice(0, 4).map(a => <li key={a.id}><div><strong>{a.title}</strong><span className="text-ink/70">{a.category}</span></div><Severity severity={a.severity} /></li>)}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap gap-2 mt-2">
        <button className="button" type="button" onClick={() => navigate('/branch-manager/field-operations')}>Field Operations</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/customers')}>Customers</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/ci-approvals')}>Approve CIs</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/leaflet')}>Leaflet | OpenStreetMap</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/reports')}>Reports</button>
      </div>
    </div>;
}

// ── Field Operations (combined hub + tab navigation) ─────────────────────────
function FieldOperationsHub({
  navigate,
  showToast
}) {
  const [tab, setTab] = useState('overview');
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
  if (loading) return <LoadingState />;
  return <div className="relative z-10 grid gap-[22px] w-full">
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
          <Card title="Collector Performance" sub="Compliance & recovery">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectorChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="compliance" name="Compliance" fill="#093850" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovery" name="Recovery" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Performance" sub="Visit completion & conversion">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="visits" name="Visit Completion" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversion" name="Conversion" fill="#10b981" radius={[4, 4, 0, 0]} />
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
            background: '#f8fafc',
            padding: 12,
            borderRadius: 8,
            border: '1px solid #e2e8f0'
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
              color: '#475569'
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

      {tab === 'collectors' && <div className="account-card-grid">
          {staff.collectors.map(c => <StaffCard key={c.id} title={c.name} metrics={[{
        label: 'Assigned',
        value: c.accountsAssigned
      }, {
        label: 'Visited',
        value: c.accountsVisited
      }, {
        label: 'Pending',
        value: c.accountsPending
      }, {
        label: 'Compliance',
        value: `${c.complianceScore}%`
      }, {
        label: 'Collected',
        value: formatCurrency(c.collectionAmount)
      }]} actions={[{
        label: 'Expand Route',
        action: 'detail'
      }, {
        label: 'View on Map',
        action: 'map',
        variant: 'ghost'
      }]} onAction={a => {
        if (a.action === 'detail') navigate(`/branch-manager/field-operations/collectors/${c.id}`);else navigate('/branch-manager/leaflet');
      }} />)}
        </div>}

      {tab === 'sales' && <div className="account-card-grid">
          {staff.salesAgents.map(a => <StaffCard key={a.id} title={a.name} metrics={[{
        label: 'Customers',
        value: a.customersAssigned
      }, {
        label: 'Visits',
        value: a.visitsCompleted
      }, {
        label: 'Sales',
        value: a.salesLogged
      }, {
        label: 'Revenue',
        value: formatCurrency(a.totalSalesAmount)
      }]} actions={[{
        label: 'Expand Schedule',
        action: 'detail'
      }, {
        label: 'View on Map',
        action: 'map',
        variant: 'ghost'
      }]} onAction={act => {
        if (act.action === 'detail') navigate(`/branch-manager/field-operations/sales/${a.id}`);else navigate('/branch-manager/leaflet');
      }} />)}
        </div>}

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
    </div>;
}
function CollectorDetailPage({
  collectorId,
  navigate
}) {
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBranchStaff();
      if (result.success) setStaff(result.data);
      setLoading(false);
    }
    load();
  }, []);
  const c = staff.collectors.find(x => x.id === String(collectorId));
  const pagination_c_route = usePagination(c.route);
  const paginated_c_route = pagination_c_route.paginatedData;
  if (loading) return <LoadingState />;
  if (!c) return <EmptyState title="Collector not found" actionLabel="Back" onAction={() => navigate('/branch-manager/field-operations')} />;
  return <div className="relative z-10 grid gap-[22px] w-full">
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
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Route Timeline</h3><span className="text-ink/70">GPS: {c.gpsAttendance ? 'Active' : 'Off'}</span></div>
        {c.route.length ? <><div className="corvex-table-wrapper"><table className="corvex-table"><thead><tr><th>Account</th><th>Status</th><th>Time</th><th>Amount</th></tr></thead><tbody>{paginated_c_route.map(r => <tr key={r.account}><td>{r.account}</td><td><StatusBadge status={r.status} /></td><td>{r.time}</td><td>{r.amount ? formatCurrency(r.amount) : '—'}</td></tr>)}</tbody></table></div><Pagination {...pagination_c_route} /></> : <EmptyState title="No route data" />}
        <div style={{
        marginTop: 16
      }}>
          <LeafletMap center={[7.1907, 125.4553]} zoom={13} height={400} polylines={[{
          id: 'route',
          positions: [[7.1907, 125.4553], [7.1950, 125.4600], [7.2000, 125.4500]],
          color: '#093850'
        }]} markers={[{
          id: 'start',
          position: [7.1907, 125.4553],
          label: 'S',
          color: '#10b981',
          popup: 'Start Location'
        }, {
          id: 'end',
          position: [7.2000, 125.4500],
          label: 'E',
          color: '#ef4444',
          popup: 'End Location'
        }]} />
        </div>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/field-operations')}>Back</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/leaflet')}>View on Map</button>
      </div>
    </div>;
}
function SalesAgentDetailPage({
  agentId,
  navigate
}) {
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBranchStaff();
      if (result.success) setStaff(result.data);
      setLoading(false);
    }
    load();
  }, []);
  const a = staff.salesAgents.find(x => x.id === String(agentId));
  if (loading) return <LoadingState />;
  if (!a) return <EmptyState title="Agent not found" actionLabel="Back" onAction={() => navigate('/branch-manager/field-operations')} />;
  return <div className="relative z-10 grid gap-[22px] w-full">
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
        {a.customers.length ? <><h4 className="subsection-title">Customers</h4><div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 8
        }}>{a.customers.map(c => <span key={c} style={{
            padding: '5px 12px',
            borderRadius: 999,
            background: 'var(--surface)',
            border: '1px solid var(--surface-3)',
            fontSize: '0.88rem',
            fontWeight: 500
          }}>{c}</span>)}</div></> : null}
        {a.productPerformance.length ? <><h4 className="subsection-title" style={{
          marginTop: 16
        }}>Product Performance</h4><ul className="list-none p-0 m-0 flex flex-col gap-3">{a.productPerformance.map(p => <li key={p.product}><div><strong>{p.product}</strong></div><span>{p.units} units</span></li>)}</ul></> : null}
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/field-operations')}>Back</button>
      </div>
    </div>;
}

// ── Reports & Analytics (combined with tab nav) ───────────────────────────────
function ReportsHubPage({
  navigate,
  showToast
}) {
  const [tab, setTab] = useState('collection');
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
      if (staffResult.success) setStaff(staffResult.data);
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
  const collectorAmt = staff.collectors.map(c => ({
    name: c.name.split(' ')[0],
    amount: c.collectionAmount,
    compliance: c.complianceScore
  }));
  const agentRev = staff.salesAgents.map(a => ({
    name: a.name.split(' ')[0],
    revenue: a.totalSalesAmount,
    visits: a.visitCompletionRate
  }));
  const pagination_inventoryData_lowStockItems = usePagination(inventoryData.lowStockItems);
  const paginated_inventoryData_lowStockItems = pagination_inventoryData_lowStockItems.paginatedData;
  const pagination_invoices = usePagination(invoices);
  const paginated_invoices = pagination_invoices.paginatedData;
  if (loading) return <LoadingState message="Loading reports..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      marginBottom: 20
    }}>
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => showToast('Export PDF initiated.', 'success')}>Export PDF</button>
        <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => showToast('Export Excel initiated.', 'success')}>Export Excel</button>
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
            <Card title="Daily Collection vs Target" sub="Last 7 days">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={collectionData?.daily || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="target" name="Target" stroke="#e2e8f0" fill="#f1f5f9" strokeWidth={2} strokeDasharray="5 5" />
                  <Area type="monotone" dataKey="amount" name="Collected" stroke="#093850" fill="#093850" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Collector Amounts">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={collectorAmt}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="amount" name="Collected (PHP)" fill="#093850" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="compliance" name="Compliance %" fill="#06b6d4" radius={[4, 4, 0, 0]} />
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
            <Card title="Sales vs Target" sub="Last 7 days">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salesData?.weekly || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{
                fontSize: 12
              }} />
                  <YAxis tick={{
                fontSize: 11
              }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Agent Revenue & Visits">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentRev}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
                  <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="r" dataKey="visits" name="Visit %" fill="#10b981" radius={[4, 4, 0, 0]} />
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
            <Card title="Inventory Status">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={[{
                name: 'Sufficient',
                value: inventoryData?.summary?.sufficient || 0,
                color: '#10b981'
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
                color: '#64748b'
              }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({
                name,
                value
              }) => `${name}: ${value}`}>
                    {[{
                  name: 'Sufficient',
                  color: '#10b981'
                }, {
                  name: 'Low Stock',
                  color: '#f59e0b'
                }, {
                  name: 'Critical',
                  color: '#ef4444'
                }, {
                  name: 'Out of Stock',
                  color: '#64748b'
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
            <Card title="Delinquency Trend" sub="Weekly overdue accounts">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={delinquencyData?.delinquency || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{
                fontSize: 12
              }} />
                  <YAxis domain={[80, 100]} unit="%" tick={{
                fontSize: 12
              }} />
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                  {complianceData?.compliance?.map((c, i) => <Line key={c.name} type="monotone" dataKey={c.name} stroke={['#093850', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'][i % 5]} strokeWidth={2} dot={false} />)}
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
          gridTemplateColumns: 'repeat(4, 1fr)',
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
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8
          }}>
                    <span style={{
              fontSize: '0.78rem',
              color: '#64748b',
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
                      <th>Sales Agent</th>
                      <th>Branch</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Status</th>
                      <th>Invoice Date</th>
                      <th>Due Date</th>
                      <th>Notes</th>
                      <th>Created At</th>
                      <th>Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated_invoices.map(inv => {
                  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'Cancelled';
                  return <tr key={inv.sales_invoices_id}>
                          <td style={{
                      fontFamily: 'monospace',
                      fontSize: '0.82rem'
                    }}>{inv.invoice_number}</td>
                          <td>{inv.customer_name || '—'}</td>
                          <td>{inv.sales_agent_name || '—'}</td>
                          <td>{inv.branch_name || '—'}</td>
                          <td style={{
                      fontWeight: 600
                    }}>{formatCurrency(Number(inv.total_amount))}</td>
                          <td>{inv.payment_method || '—'}</td>
                          <td>
                            <StatusBadge status={inv.status} />
                          </td>
                          <td>{formatDisplayDate(inv.invoices_date)}</td>
                          <td style={{
                      color: isOverdue ? '#dc2626' : 'inherit',
                      fontWeight: isOverdue ? 700 : 400
                    }}>
                            {formatDisplayDate(inv.due_date)}
                          </td>
                          <td style={{
                      maxWidth: 200,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }} title={inv.notes || ''}>
                            {inv.notes || '—'}
                          </td>
                          <td>{formatDisplayDateTime(inv.created_at)}</td>
                          <td>{formatDisplayDateTime(inv.updated_at)}</td>
                        </tr>;
                })}
                  </tbody>
                </table>
              </div><Pagination {...pagination_invoices} /></>
            </> : <EmptyState title="No invoices found" description="No sales invoices exist for this branch yet." />}
        </section>}

      {tab !== 'invoices' && <div style={{
      marginTop: 24
    }}>
          <Card title="Overall KPI Summary">
            <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px 20px',
          padding: '16px 0'
        }}>
              <div><strong>Health Score</strong><div style={{
              fontSize: '1.5rem',
              color: '#093850'
            }}>{kpi?.healthScore || 0}/100</div></div>
              <div><strong>Active Collectors</strong><div style={{
              fontSize: '1.5rem',
              color: '#10b981'
            }}>{kpi?.activeCollectors || 0}</div></div>
              <div><strong>Active Sales Agents</strong><div style={{
              fontSize: '1.5rem',
              color: '#8b5cf6'
            }}>{kpi?.activeSalesAgents || 0}</div></div>
              <div><strong>Total Customers</strong><div style={{
              fontSize: '1.5rem'
            }}>{kpi?.totalCustomers || 0}</div></div>
              <div><strong>Outstanding Balance</strong><div style={{
              fontSize: '1.5rem',
              color: '#ef4444'
            }}>{formatCurrency(kpi?.totalOutstanding || 0)}</div></div>
              <div><strong>Collections (7d)</strong><div style={{
              fontSize: '1.5rem',
              color: '#059669'
            }}>{formatCurrency(kpi?.totalCollectionsAmount || 0)}</div></div>
              <div><strong>Sales (7d)</strong><div style={{
              fontSize: '1.5rem',
              color: '#093850'
            }}>{formatCurrency(kpi?.totalSalesAmount || 0)}</div></div>
              <div><strong>Inventory Health</strong><div style={{
              fontSize: '1.5rem'
            }}>{kpi?.inventoryHealth || 0}%</div></div>
            </div>
          </Card>
        </div>}
    </div>;
}

// ── Staff Performance (improved) ──────────────────────────────────────────────
function StaffPerformancePage({
  navigate
}) {
  const [tab, setTab] = useState('overview');
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
  return <div className="relative z-10 grid gap-[22px] w-full">
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
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="score" name="Compliance" fill="#093850" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovery" name="Recovery" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Sales Agent Scorecard" sub="Visit completion & conversion">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salesBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="name" tick={{
                fontSize: 12
              }} /><YAxis domain={[0, 100]} unit="%" tick={{
                fontSize: 12
              }} /><Tooltip formatter={v => `${v}%`} /><Legend />
                <Bar dataKey="visits" name="Visit Completion" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversion" name="Conversion" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
        <Card title="Route Compliance Trend" sub="Weekly per collector">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={complianceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" /><XAxis dataKey="week" tick={{
              fontSize: 12
            }} /><YAxis domain={[80, 100]} unit="%" tick={{
              fontSize: 12
            }} /><Tooltip formatter={v => `${v}%`} /><Legend />
              {complianceData?.compliance?.map((c, i) => <Line key={c.name} type="monotone" dataKey={c.name} stroke={['#093850', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'][i % 5]} strokeWidth={2} dot={false} />)}
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
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Overall Rankings</h3></div>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {combined.map((s, i) => <li key={s.name}>
                <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
                  <span style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#093850',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              flexShrink: 0
            }}>#{i + 1}</span>
                  <div><strong>{s.name}</strong><span className="text-ink/70" style={{
                display: 'block',
                fontSize: '0.82rem'
              }}>{s.role}</span></div>
                </div>
                <div style={{
            textAlign: 'right'
          }}>
                  <strong>{s.score}%</strong>
                  <span className="text-ink/70" style={{
              display: 'block',
              fontSize: '0.82rem'
            }}>{s.metric}</span>
                </div>
              </li>)}
          </ul>
        </section>}
    </div>;
}

// ── CI Queue ──────────────────────────────────────────────────────────────────
function CIQueuePage({
  navigate,
  showToast
}) {
  const [filter, setFilter] = useState('Pending');
  const filtered = useMemo(() => CI_QUEUE.filter(c => filter === 'All' || c.status === filter), [filter]);
  const pagination_filtered = usePagination(filtered);
  const paginated_filtered = pagination_filtered.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
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
            <tbody>{paginated_filtered.map(ci => <tr key={ci.id}><td>{ci.customerName}</td><td>{ci.submittedBy}</td><td>{ci.submissionDate}</td><td><StatusBadge status={ci.delinquencyStatus} /></td><td><StatusBadge status={ci.status} /></td><td className="table-actions">
              <button className="icon-action-button" type="button" title="Open" onClick={() => navigate(`/branch-manager/ci-approvals/${ci.id}`)}><NavIcon name="view" /></button>
              {ci.status === 'Pending' && <><button className="icon-action-button" type="button" title="Approve" onClick={() => showToast(`Approved CI for ${ci.customerName}.`, 'success')}><NavIcon name="check" /></button><button className="icon-action-button danger" type="button" title="Reject" onClick={() => showToast(`Rejected CI for ${ci.customerName}.`, 'error')}><NavIcon name="close" /></button></>}
            </td></tr>)}</tbody>
          </table></div><Pagination {...pagination_filtered} /></>
        : <EmptyState title="No CI records" description="No items match this filter." />}
      </section>
    </div>;
}
function CIDetailPage({
  ciId,
  navigate,
  showToast
}) {
  const ci = getCIById(ciId);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const pagination_ci_paymentHistory = usePagination(ci.paymentHistory);
  const paginated_ci_paymentHistory = pagination_ci_paymentHistory.paginatedData;
  if (!ci) return <EmptyState title="CI not found" actionLabel="Back" onAction={() => navigate('/branch-manager/ci-approvals')} />;
  return <div className="relative z-10 grid gap-[22px] w-full">
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
        <ul className="info-grid"><li><span className="info-item-label">Purpose</span><span className="info-item-value">{ci.purpose}</span></li><li><span className="info-item-label">Monthly Income</span><span className="info-item-value">{formatCurrency(ci.monthlyIncome)}</span></li><li><span className="info-item-label">Business Type</span><span className="info-item-value">{ci.businessType}</span></li><li><span className="info-item-label">References</span><span className="info-item-value">{ci.references}</span></li><li><span className="info-item-label">Remarks</span><span className="info-item-value">{ci.formRemarks}</span></li></ul>
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
          <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/ci-approvals')}>Back</button>
          <button className="button secondary" type="button" onClick={() => {
        showToast('Revision requested.', 'success');
        navigate('/branch-manager/ci-approvals');
      }}>Request Revision</button>
          <button className="button secondary" type="button" onClick={() => {
        if (showReject) {
          if (!rejectReason.trim()) {
            showToast('Reason required.', 'error');
            return;
          }
          showToast(`CI rejected.`, 'error');
          navigate('/branch-manager/ci-approvals');
        } else setShowReject(true);
      }}>{showReject ? 'Confirm Reject' : 'Reject'}</button>
          <button className="button" type="button" onClick={() => {
        showToast('CI approved.', 'success');
        navigate('/branch-manager/ci-approvals');
      }}>Approve</button>
        </div> : <div className="flex justify-end gap-2 mt-4">
          <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/ci-approvals')}>Back</button>
        </div>}
    </div>;
}

// ── Customers ─────────────────────────────────────────────────────────────────
function CustomersPage({
  navigate,
  branchName
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
  return <div className="relative z-10 grid gap-[22px] w-full">
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
            <button className="button secondary" type="button" onClick={() => {}}>Export Data</button>
          </div>
        </div>
        <div className="list-section-toolbar" style={{
        marginBottom: 12
      }}>
          <div className="list-section-controls">
            <input className="filter-input search" type="search" placeholder="Search by customer name, address, or phone" value={search} onChange={e => setSearch(e.target.value)} style={{
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
              {['All', 'Active', 'Inactive'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <select className="filter-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '0.9rem'
          }}>
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
                    <td>{c.contact_phone || '—'}</td>
                    <td>{formatCurrency(c.outstanding_balance || 0)}</td>
                    <td><StatusBadge status={c.paymentStatus} /></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/branch-manager/customers/${c.id}`)}>
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
  branchName
}) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
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
    return <EmptyState title="Customer not found" description="This customer may not belong to your branch or no longer exists." actionLabel="Back to Customers" onAction={() => navigate('/branch-manager/customers')} />;
  }
  const name = `${customer.first_name} ${customer.last_name}`;
  const paymentStatus = Number(customer.activity?.outstanding_balance || 0) > 0 ? 'Overdue' : 'Current';
  const customerSince = customer.created_at ? formatDisplayDate(customer.created_at) : '—';
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel dashboard-greeting">
        <div className="flex flex-col gap-1">
          <p className="text-[0.82rem] font-bold tracking-widest uppercase text-navy/60 m-0">{customer.branch_name || branchName}</p>
          <h2>{name}</h2>
          <p className="text-ink/70">{customer.address || 'No address on file'}</p>
        </div>
      </section>

      <Stats stats={[{
      label: 'Status',
      value: customer.status || '—'
    }, {
      label: 'Payment Status',
      value: paymentStatus
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

      <div className="grid two-up">
        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Contact Information</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Customer Name</span><span className="info-item-value">{name}</span></li>
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{customer.branch_name || branchName}</span></li>
            <li><span className="info-item-label">Address</span><span className="info-item-value">{customer.address || '—'}</span></li>
            <li><span className="info-item-label">Contact Phone</span><span className="info-item-value">{customer.contact_phone || '—'}</span></li>
            <li><span className="info-item-label">Contact Person</span><span className="info-item-value">{customer.contact_person_fname} {customer.contact_person_lname}</span></li>
            <li><span className="info-item-label">Contact Person Phone</span><span className="info-item-value">{customer.contact_person_phone || '—'}</span></li>
            <li><span className="info-item-label">Account Manager</span><span className="info-item-value">{customer.account_manager_name || '—'}</span></li>
            <li><span className="info-item-label">Customer Since</span><span className="info-item-value">{customerSince}</span></li>
          </ul>
        </section>

        <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Account Activity</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Outstanding Balance</span><span className="info-item-value">{formatCurrency(Number(customer.activity?.outstanding_balance || 0))}</span></li>
            <li><span className="info-item-label">Purchase Volume</span><span className="info-item-value">{formatCurrency(Number(customer.activity?.purchase_volume || 0))}</span></li>
            <li><span className="info-item-label">Last Collection</span><span className="info-item-value">{customer.activity?.last_collection_date || '—'}</span></li>
            <li><span className="info-item-label">Last Sales Visit</span><span className="info-item-value">{customer.activity?.last_sales_visit || '—'}</span></li>
          </ul>
        </section>
      </div>

      {customer.creditInfo ? <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Credit Information</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Credit Limit</span><span className="info-item-value">{formatCurrency(Number(customer.creditInfo.credit_limit || 0))}</span></li>
            <li><span className="info-item-label">Monthly Income</span><span className="info-item-value">{formatCurrency(Number(customer.creditInfo.monthly_income || 0))}</span></li>
            <li><span className="info-item-label">Credit Score</span><span className="info-item-value">{customer.creditInfo.credit_score || '—'}</span></li>
            <li><span className="info-item-label">Employment Status</span><span className="info-item-value">{customer.creditInfo.employment_status || '—'}</span></li>
            <li><span className="info-item-label">Approved By</span><span className="info-item-value">{customer.creditInfo.approved_by_name || '—'}</span></li>
            <li><span className="info-item-label">Approved Date</span><span className="info-item-value">{customer.creditInfo.approved_date || '—'}</span></li>
          </ul>
        </section> : null}

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
          color: paymentStatus === 'Overdue' ? '#ef4444' : '#093850',
          popup: name
        }]} />
          </div>
        </section> : null}

      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/customers')}>Back to Customers</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/leaflet')}>View on Map</button>
      </div>
    </div>;
}

// ── GIS, Alerts, Notifications, Profile, Audit ───────────────────────────────
function LeafletPage({
  pageType,
  navigate,
  showToast
}) {
  const [layers, setLayers] = useState(['Collector Routes', 'Delinquency Clusters']);
  const [mapAccounts, setMapAccounts] = useState([]);
  const [staff, setStaff] = useState({
    collectors: [],
    salesAgents: []
  });
  const [loading, setLoading] = useState(true);
  const layerOptions = ['Collector Routes', 'Sales Territories', 'Payment Behavior Zones', 'Delinquency Clusters', 'Profitability Zones', 'High Collection Areas', 'Route Efficiency Layer'];
  const toggle = l => setLayers(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]);
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [customersResult, staffResult] = await Promise.all([getBranchCustomers(), getBranchStaff()]);
      if (customersResult.success) setMapAccounts(customersResult.data.mapAccounts || []);
      if (staffResult.success) setStaff(staffResult.data);
      setLoading(false);
    }
    load();
  }, []);
  const mapCenter = mapAccounts.find(a => a.lat && a.lng) ? [mapAccounts.find(a => a.lat && a.lng).lat, mapAccounts.find(a => a.lat && a.lng).lng] : [7.1907, 125.4553];
  const pagination_mapAccounts = usePagination(mapAccounts);
  const paginated_mapAccounts = pagination_mapAccounts.paginatedData;
  if (loading) return <LoadingState message="Loading map data..." />;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Leaflet | OpenStreetMap</h3></div>
        <div className="accounts-filters">
          <select className="filter-select"><option>Today</option><option>This Week</option><option>This Month</option></select>
          <select className="filter-select"><option>All Staff</option>{staff.collectors.map(c => <option key={c.id}>{c.name}</option>)}{staff.salesAgents.map(a => <option key={a.id}>{a.name}</option>)}</select>
        </div>
        <div className="layer-toggles">{layerOptions.map(l => <label key={l} className="toggle-label"><input type="checkbox" checked={layers.includes(l)} onChange={() => toggle(l)} />{l}</label>)}</div>
        <div style={{
        marginTop: 16
      }}>
          <LeafletMap center={mapCenter} zoom={12} height={560} markers={mapAccounts.filter(a => a.lat && a.lng).map(a => ({
          id: a.id,
          position: [a.lat, a.lng],
          label: a.customerName.substring(0, 2).toUpperCase(),
          color: a.paymentStatus === 'Overdue' ? '#ef4444' : '#10b981',
          popup: `${a.customerName} - ${a.paymentStatus}`
        }))} />
        </div>
      </section>
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Customer Pins</h3></div>
        {mapAccounts.length ? <><div className="corvex-table-wrapper"><table className="corvex-table">
            <thead><tr><th>Customer</th><th>Balance</th><th>Status</th><th>Last Visit</th><th>Staff</th><th>Actions</th></tr></thead>
            <tbody>{paginated_mapAccounts.map(a => <tr key={a.id}><td>{a.customerName}</td><td>{formatCurrency(a.balance)}</td><td><StatusBadge status={a.paymentStatus} /></td><td>{a.lastVisit}</td><td>{a.assignedStaff}</td><td className="table-actions"><button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/branch-manager/customers/${a.id}`)}><NavIcon name="view" /></button></td></tr>)}</tbody>
          </table></div><Pagination {...pagination_mapAccounts} /></> : <EmptyState title="No customers on map" description="Customers for your branch will appear here once they have location data." />}
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/leaflet/delinquency')}>Delinquency Heatmap</button>
        <button className="button secondary" type="button" onClick={() => navigate('/branch-manager/leaflet/profitability')}>Profitability Zones</button>
      </div>
    </div>;
}
function AlertsPage({
  navigate,
  showToast
}) {
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => filter === 'All' ? ALERTS : ALERTS.filter(a => a.category.includes(filter)), [filter]);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="segmented-control">
          {['All', 'Collection', 'Sales', 'Inventory', 'Route'].map(f => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}
        </div>
      </section>
      <div className="notification-list">
        {filtered.map(a => <article key={a.id} className="notification-item">
            <div><h4>{a.title}</h4><p className="text-ink/70">{a.message}</p><span className="notification-time">{a.category} · {a.time}</span></div>
            <div className="notification-actions"><Severity severity={a.severity} /><button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => showToast('Follow-up assigned.', 'success')}>Assign</button><button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" onClick={() => showToast('Resolved.', 'success')}>Resolve</button></div>
          </article>)}
      </div>
    </div>;
}
function NotificationsPage({
  navigate,
  showToast
}) {
  const [items, setItems] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'Unread') return items.filter(n => !n.read);
    if (filter === 'All') return items;
    return items.filter(n => n.type === filter.toLowerCase());
  }, [items, filter]);
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
          <div className="segmented-control">{['All', 'Unread', 'CI', 'Route', 'Delinquency', 'Inventory', 'Staff'].map(f => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}</div>
          <button className="button" type="button" onClick={() => {
          setItems(n => n.map(i => ({
            ...i,
            read: true
          })));
          showToast('All marked read.', 'success');
        }}>Mark All as Read</button>
        </div>
      </section>
      {filtered.length ? <div className="notification-list">
          {filtered.map(item => <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="text-ink/70">{item.message}</p><span className="notification-time">{item.time}</span></div>
              <div className="notification-actions">
                {!item.read && <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => setItems(ns => ns.map(n => n.id === item.id ? {
            ...n,
            read: true
          } : n))}>Mark Read</button>}
                <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => navigate(item.relatedTo)}>Open</button>
              </div>
            </article>)}
        </div> : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>;
}
function ProfilePage({
  navigate,
  showToast,
  branchName
}) {
  const currentUser = getCurrentUser();
  const userName = currentUser?.fullName || 'User';
  const userBranch = currentUser?.branch?.name || branchName || 'Branch';
  const userEmail = currentUser?.email || 'N/A';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase();
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="profile-header">
          <div className="profile-avatar">{userInitials}</div>
          <div><h3>{userName}</h3><p className="text-ink/70">Branch Manager</p></div>
        </div>
        <ul className="info-grid"><li><span className="info-item-label">Branch</span><span className="info-item-value">{userBranch}</span></li><li><span className="info-item-label">Email</span><span className="info-item-value">{userEmail}</span></li><li><span className="info-item-label">Phone</span><span className="info-item-value">N/A</span></li></ul>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/audit-log')}>Audit Log</button>
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/approval-center')}>Approval Center</button>
        <button className="button secondary" type="button" onClick={() => showToast('Change Password opened.', 'success')}>Change Password</button>
        <button className="button" type="button" onClick={() => showToast('Update Profile opened.', 'success')}>Update Profile</button>
      </div>
    </div>;
}
function ApprovalCenterPage({
  navigate,
  showToast
}) {
  const [tab, setTab] = useState('ci');
  const [ciList, setCiList] = useState(CI_QUEUE);
  const [transferList, setTransferList] = useState([{
    id: 'TRF-301',
    product: '3-Seater Fabric Sofa (Beige)',
    qty: 4,
    from: 'Davao Oriental Branch',
    to: 'Davao City Branch',
    requestedBy: 'Ana Reyes',
    date: '2026-06-25',
    status: 'Pending Approval',
    value: 114000
  }, {
    id: 'TRF-300',
    product: '6-Seater Dining Table Set (Narra)',
    qty: 2,
    from: 'Davao Oriental Branch',
    to: 'General Santos Branch',
    requestedBy: 'Ana Reyes',
    date: '2026-06-24',
    status: 'Pending Approval',
    value: 84000
  }, {
    id: 'TRF-297',
    product: 'Coffee Table (Tempered Glass & Steel)',
    qty: 5,
    from: 'Davao Oriental Branch',
    to: 'General Santos Branch',
    requestedBy: 'Ana Reyes',
    date: '2026-06-25',
    status: 'Pending Approval',
    value: 37500
  }]);
  const [specialList, setSpecialList] = useState([{
    id: 'SC-001',
    customerName: 'Mabuhay Sala Sets',
    accountNumber: 'ACC-1006',
    requestType: 'Extended Payment Term',
    requestedBy: 'John Dela Cruz',
    date: '2026-06-24',
    amount: 38000,
    status: 'Pending',
    notes: 'Customer requested 90-day extension due to business slowdown.'
  }, {
    id: 'SC-002',
    customerName: 'Hardin ng Bahay Home Store',
    accountNumber: 'ACC-1003',
    requestType: 'Partial Collection',
    requestedBy: 'Maria Dela Cruz',
    date: '2026-06-23',
    amount: 10000,
    status: 'Pending',
    notes: 'Customer can only settle ₱10,000 of ₱15,800 balance this week.'
  }]);
  const tabs = [{
    key: 'ci',
    label: `Credit Investigations (${ciList.filter(c => c.status === 'Pending').length})`
  }, {
    key: 'transfers',
    label: `Inventory Transfers (${transferList.filter(t => t.status === 'Pending Approval').length})`
  }, {
    key: 'special',
    label: `Special Collections (${specialList.filter(s => s.status === 'Pending').length})`
  }];
  const totalPending = ciList.filter(c => c.status === 'Pending').length + transferList.filter(t => t.status === 'Pending Approval').length + specialList.filter(s => s.status === 'Pending').length;
  const approveCI = id => {
    setCiList(p => p.map(c => c.id === id ? {
      ...c,
      status: 'Approved'
    } : c));
    showToast('CI approved successfully.', 'success');
  };
  const rejectCI = id => {
    setCiList(p => p.map(c => c.id === id ? {
      ...c,
      status: 'Rejected'
    } : c));
    showToast('CI rejected.', 'success');
  };
  const approveTransfer = id => {
    setTransferList(p => p.map(t => t.id === id ? {
      ...t,
      status: 'Approved'
    } : t));
    showToast('Transfer approved.', 'success');
  };
  const rejectTransfer = id => {
    setTransferList(p => p.map(t => t.id === id ? {
      ...t,
      status: 'Rejected'
    } : t));
    showToast('Transfer rejected.', 'success');
  };
  const approveSpecial = id => {
    setSpecialList(p => p.map(s => s.id === id ? {
      ...s,
      status: 'Approved'
    } : s));
    showToast('Special collection approved.', 'success');
  };
  const rejectSpecial = id => {
    setSpecialList(p => p.map(s => s.id === id ? {
      ...s,
      status: 'Rejected'
    } : s));
    showToast('Special collection rejected.', 'success');
  };
  const RiskBadge = ({
    score
  }) => {
    const color = score >= 70 ? '#dc2626' : score >= 40 ? '#d97706' : '#059669';
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
  return <div className="relative z-10 grid gap-[22px] w-full">
      {/* Summary bar */}
      <section className="stats-grid">
        {[{
        label: 'Total Pending',
        value: String(totalPending),
        idx: 0
      }, {
        label: 'CI Approvals',
        value: String(ciList.filter(c => c.status === 'Pending').length),
        idx: 1
      }, {
        label: 'Transfer Approvals',
        value: String(transferList.filter(t => t.status === 'Pending Approval').length),
        idx: 2
      }, {
        label: 'Special Collections',
        value: String(specialList.filter(s => s.status === 'Pending').length),
        idx: 3
      }].map((s, i) => <article key={s.label} className="stat-card" style={{
        '--stat-index': i
      }}>
            <div className="stat-card-top"><span className="stat-index">{String(i + 1).padStart(2, '0')}</span><span className="stat-dot" /></div>
            <span className="stat-label">{s.label}</span>
            <strong className="stat-value">{s.value}</strong>
          </article>)}
      </section>

      {/* Tab navigation */}
      <div className="segmented-control">
        {tabs.map(t => <button key={t.key} className={tab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ── CI Approvals ── */}
      {tab === 'ci' && <section className="panel content-panel relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Credit Investigation Queue</h3>
            <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-transparent text-blue border-[1.5px] border-blue-30 shadow-none hover:bg-blue-08 transition-all duration-160 cursor-pointer" type="button" onClick={() => navigate('/branch-manager/ci-approvals')}>Open Full CI Queue</button>
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
                  }}>{ci.submissionDate}</span></td>
                      <td>{ci.purpose}</td>
                      <td>{formatCurrency(ci.monthlyIncome)}</td>
                      <td><RiskBadge score={ci.riskScore} /></td>
                      <td><StatusBadge status={ci.delinquencyStatus} /></td>
                      <td><StatusBadge status={ci.status} /></td>
                      <td className="table-actions">
                        <button className="icon-action-button" type="button" title="Review" onClick={() => navigate(`/branch-manager/ci-approvals/${ci.id}`)}><NavIcon name="view" /></button>
                        {ci.status === 'Pending' && <>
                          <button className="icon-action-button" type="button" title="Approve" onClick={() => approveCI(ci.id)}><NavIcon name="check" /></button>
                          <button className="icon-action-button danger" type="button" title="Reject" onClick={() => rejectCI(ci.id)}><NavIcon name="close" /></button>
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
                      <td><strong>{t.id}</strong></td>
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
                      <td>{t.date}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="table-actions">
                        {t.status === 'Pending Approval' && <>
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
          <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
            <h3>Special Collection Requests</h3>
            <p className="text-ink/70" style={{
          margin: 0,
          fontSize: '0.85rem'
        }}>Extended terms and partial collection approvals submitted by field collectors.</p>
          </div>
          {specialList.length ? <div className="grid" style={{
        gap: 16
      }}>
              {specialList.map(s => <article key={s.id} className="panel content-panel relative overflow-hidden" style={{
          padding: 20
        }}>
                  <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 12
          }}>
                    <div>
                      <h4 style={{
                margin: 0,
                fontSize: '1rem'
              }}>{s.customerName}</h4>
                      <span className="text-ink/70" style={{
                fontSize: '0.82rem'
              }}>{s.accountNumber} · submitted by {s.requestedBy} on {s.date}</span>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 14
          }}>
                    <div><span className="metric-label" style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748b'
              }}>Request Type</span><strong style={{
                display: 'block',
                marginTop: 2
              }}>{s.requestType}</strong></div>
                    <div><span className="metric-label" style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748b'
              }}>Amount Involved</span><strong style={{
                display: 'block',
                marginTop: 2
              }}>{formatCurrency(s.amount)}</strong></div>
                  </div>
                  <p style={{
            margin: '0 0 14px',
            fontSize: '0.88rem',
            color: '#475569',
            padding: '10px 14px',
            background: '#f8fafc',
            borderRadius: 8,
            border: '1px solid #e2e8f0'
          }}>{s.notes}</p>
                  {s.status === 'Pending' && <div style={{
            display: 'flex',
            gap: 10
          }}>
                      <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md border-0 bg-blue text-white font-semibold cursor-pointer transition-all duration-160 hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:brightness-105 active:translate-y-0" type="button" onClick={() => approveSpecial(s.id)}>Approve Request</button>
                      <button className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-md bg-mint text-ink border-[1.5px] border-surface-3 shadow-none hover:border-blue hover:text-blue transition-all duration-160 cursor-pointer" type="button" onClick={() => rejectSpecial(s.id)}>Reject</button>
                    </div>}
                </article>)}
            </div> : <EmptyState title="No special collection requests" description="All requests have been processed." />}
        </section>}
    </div>;
}
function AuditLogPage({
  navigate
}) {
  const pagination_AUDIT_LOGS = usePagination(AUDIT_LOGS);
  const paginated_AUDIT_LOGS = pagination_AUDIT_LOGS.paginatedData;
  return <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4"><h3>Audit Log</h3></div>
        <><div className="corvex-table-wrapper"><table className="corvex-table"><thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead><tbody>{paginated_AUDIT_LOGS.map(l => <tr key={l.id}><td>{l.action}</td><td>{l.detail}</td><td>{l.timestamp}</td></tr>)}</tbody></table></div><Pagination {...pagination_AUDIT_LOGS} /></>
      </section>
      <div className="flex justify-end gap-2 mt-4">
        <button className="button ghost" type="button" onClick={() => navigate('/branch-manager/profile')}>Back to Profile</button>
      </div>
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
  const branchName = currentUser?.branch?.name || 'All Branches';
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const p = {
    collectorId: page.params?.collectorId,
    agentId: page.params?.agentId,
    ciId: page.params?.ciId,
    accountId: page.params?.accountId,
    customerId: page.params?.customerId,
    navigate,
    showToast,
    branchName
  };
  switch (page.pageType) {
    case 'dashboard':
      return <DashboardPage {...p} />;
    case 'customers':
      return <CustomersPage {...p} />;
    case 'customerDetail':
      return <CustomerDetailPage {...p} />;
    case 'territories':
      return <TerritoriesPage {...p} />;
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
      return <LeafletPage pageType={page.pageType} {...p} />;
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
      return <CreditHistoryListPage navigate={navigate} showToast={showToast} basePath="/branch-manager/credit-history" userBranch={currentUser?.branch?.name} />;
    case 'creditDetail':
      return <CreditHistoryDetailPage creditId={page.params?.creditId} navigate={navigate} basePath="/branch-manager/credit-history" />;
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