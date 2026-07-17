import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { AdminPageBody } from '../admin/AdminPageBody';
import { BranchManagerPageBody } from '../branchManager/BranchManagerPageBody';
import LeafletMap from '../common/LeafletMap';
import {
  ALERTS, BRANCHES, BRANCH_RADAR, CUSTOMER_RECORDS, ENTERPRISE_KPIS, LEAFLET_LAYERS,
  MONTHLY_COLLECTIONS, MONTHLY_DELINQUENCY, MONTHLY_REVENUE,
  NOTIFICATIONS, OPERATING_MANAGER_PROFILE, REPORT_CATEGORIES,
  TREND_DATA, WEEKLY_COLLECTION_RATE, WEEKLY_SALES_RATE,
  SALES_ANALYTICS, INVENTORY_ANALYTICS, PAYMENT_ANALYTICS,
  formatCurrency, getBranchById, getCustomerRecordById, getHighestPerformingBranch, getLowestPerformingBranch,
} from '../../data/operatingManagerMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';

const COLORS = ['#2563eb', '#06b6d4', '#ef4444', '#f59e0b'];
const BRANCH_COLORS = {
  'Davao City': '#2563eb',
  'General Santos': '#10b981',
  'Davao Oriental': '#ef4444',
};

function actionButtonClass(v) {
  if (v === 'secondary') return 'button secondary';
  if (v === 'ghost') return 'button ghost';
  return 'button';
}

function PageToolbar({ actions, onAction }) {
  if (!actions?.length) return null;
  return (
    <header className="page-toolbar">
      <div className="page-toolbar-main">
        <div className="page-toolbar-actions">
          {actions.map((action) => (
            <button key={action.label} className={actionButtonClass(action.variant)} type="button" onClick={() => onAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function StatsGrid({ stats }) {
  if (!stats?.length) return null;
  return (
    <section className="stats-grid">
      {stats.map((stat, index) => (
        <article key={stat.label} className="stat-card" style={{ '--stat-index': index }}>
          <div className="stat-card-top">
            <span className="stat-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="stat-dot" aria-hidden="true" />
          </div>
          <span className="stat-label">{stat.label}</span>
          <strong className="stat-value">{stat.value}</strong>
        </article>
      ))}
    </section>
  );
}

function SeverityBadge({ severity }) {
  const cls = { Critical: 'severity-critical', Warning: 'severity-warning', Informational: 'severity-info' }[severity] ?? '';
  return <span className={`severity-badge ${cls}`}>{severity}</span>;
}

function ChartCard({ title, subtitle, children, action, onAction }) {
  return (
    <section className="panel content-panel">
      <div className="panel-section-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.85rem' }}>{subtitle}</p> : null}
        </div>
        {action ? <button className="button ghost" type="button" onClick={onAction}>{action}</button> : null}
      </div>
      {children}
    </section>
  );
}

function DashboardPage({ navigate }) {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const topBranch = getHighestPerformingBranch();
  const lowBranch = getLowestPerformingBranch();
  const criticalAlerts = ALERTS.filter((a) => a.severity === 'Critical' && !a.resolved);

  const branchBarData = BRANCHES.map((b) => ({
    name: b.name,
    Collection: b.collectionRate,
    Sales: b.salesCompletionRate,
    Inventory: b.inventoryHealth,
  }));

  const revenueDonut = BRANCHES.map((b) => ({ name: b.name, value: b.revenue }));

  return (
    <div className="page">
      <section className="panel" style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--accent, #2563eb)', display: 'flex', alignItems: 'center' }}>
                <NavIcon name="dashboard" />
              </span>
              <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: '600' }}>Operational Overview</h2>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
              This dashboard provides centralized monitoring for Sales Performance, Inventory Analytics, Customer Payment Analytics, Branch Performance, Collection Performance, Staff Performance, and Operational KPIs and Business Trends. Use this overview to effectively track and manage branch operations across all regions.
            </p>
          </div>
          <Link to="/operating-manager/notifications" className="notification-bell" aria-label={`${unread} unread notifications`} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
            <NavIcon name="bell" />
            {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
          </Link>
        </div>
      </section>

      <StatsGrid stats={[
        { label: 'Sales Today', value: formatCurrency(SALES_ANALYTICS.salesToday) },
        { label: 'Total Revenue', value: formatCurrency(ENTERPRISE_KPIS.totalRevenue) },
        { label: 'Total Collections', value: formatCurrency(ENTERPRISE_KPIS.totalCollections) },
        { label: 'Total Sales', value: formatCurrency(ENTERPRISE_KPIS.totalSales) },
        { label: 'Total Delinquencies', value: formatCurrency(ENTERPRISE_KPIS.totalDelinquencies) },
        { label: 'Total Inventory Value', value: formatCurrency(ENTERPRISE_KPIS.totalInventoryValue) },
      ]} />

      <div className="grid two-up">
        <ChartCard title="Branch KPI Comparison" subtitle="Collection, Sales & Inventory rates">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={branchBarData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[60, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="Collection" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Sales" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Inventory" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue Distribution" subtitle="Share by branch">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={revenueDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {revenueDonut.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid two-up">
        <ChartCard title="Collection Rate Trend" subtitle="Weekly % across all branches">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={WEEKLY_COLLECTION_RATE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis domain={[75, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sales Completion Trend" subtitle="Weekly % across all branches">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={WEEKLY_SALES_RATE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis domain={[65, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>



      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Top vs Bottom Branch</h3>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="analytics-card" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Top Performer</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', marginTop: 4 }}>{topBranch.name}</strong>
              <span className="muted">Score: {topBranch.performanceScore}/100 · Collection: {topBranch.collectionRate}%</span>
            </div>
            <div className="analytics-card" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Needs Attention</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', marginTop: 4 }}>{lowBranch.name}</strong>
              <span className="muted">Score: {lowBranch.performanceScore}/100 · Collection: {lowBranch.collectionRate}%</span>
            </div>
          </div>
        </section>

        {criticalAlerts.length ? (
          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Critical Alerts</h3>
              <button className="button ghost" type="button" onClick={() => navigate('/operating-manager/alerts')}>View All</button>
            </div>
            <ul className="widget-list">
              {criticalAlerts.map((a) => (
                <li key={a.id}>
                  <div><strong>{a.type}</strong><span className="muted">{a.branch} · {a.date}</span></div>
                  <SeverityBadge severity={a.severity} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <PageToolbar actions={[
        { label: 'Compare Branches', to: '/operating-manager/branch-performance/comparison' },
        { label: 'Leaflet | OpenStreetMap', to: '/operating-manager/leaflet', variant: 'secondary' },
        { label: 'Reports', to: '/operating-manager/reports', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function BranchPerformanceHub({ navigate }) {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'comparison', label: 'Comparison' },
    { key: 'trends', label: 'Trends' },
  ];

  return (
    <div className="page">
      <div className="segmented-control" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button key={t.key} className={activeTab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid two-up">
            <ChartCard title="Performance Scores" subtitle="All branches ranked">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={BRANCHES.map((b) => ({ name: b.name, score: b.performanceScore, growth: b.growthScore }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="score" name="Performance" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="growth" name="Growth" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Risk vs Performance" subtitle="Bubble view by branch">
              <div style={{ display: 'grid', gap: 10, padding: '8px 0' }}>
                {[...BRANCHES].sort((a, b) => b.performanceScore - a.performanceScore).map((b, i) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 140, fontSize: '0.85rem', fontWeight: 600 }}>{b.name}</span>
                    <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${b.performanceScore}%`, background: COLORS[i % COLORS.length], borderRadius: 999 }} />
                    </div>
                    <span style={{ width: 36, fontSize: '0.82rem', color: '#64748b' }}>{b.performanceScore}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <section className="panel content-panel">
            <div className="panel-section-header"><h3>Branch Directory</h3></div>
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Branch</th><th>Performance</th><th>Risk</th><th>Growth</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {BRANCHES.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.performanceScore}/100</td>
                      <td>{b.riskScore}/100</td>
                      <td>{b.growthScore}/100</td>
                      <td>{b.status}</td>
                      <td><button className="button ghost" type="button" onClick={() => navigate(`/operating-manager/branch-performance/branch/${b.id}`)}>View Detail</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === 'comparison' && <BranchComparisonPage navigate={navigate} showToast={() => { }} />}
      {activeTab === 'trends' && <HistoricalTrendsPage />}
    </div>
  );
}

function BranchComparisonPage({ navigate, showToast }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setLoading(false), 400); return () => window.clearTimeout(t); }, []);
  if (loading) return <LoadingState message="Loading branch comparison…" />;

  return (
    <div className="page">
      <div className="grid two-up">
        <ChartCard title="Monthly Revenue by Branch" subtitle="6-month trend">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={MONTHLY_REVENUE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Collections by Branch">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={MONTHLY_COLLECTIONS}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="KPI Comparison Matrix">
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Metric</th>{BRANCHES.map((b) => <th key={b.id}>{b.name}</th>)}</tr></thead>
            <tbody>
              {[
                { metric: 'Collection Rate', key: 'collectionRate', suffix: '%' },
                { metric: 'Sales Completion', key: 'salesCompletionRate', suffix: '%' },
                { metric: 'Inventory Health', key: 'inventoryHealth', suffix: '%' },
                { metric: 'Route Compliance', key: 'routeCompliance', suffix: '%' },
                { metric: 'Overdue Accounts', key: 'overdueAccounts', suffix: '' },
                { metric: 'Performance Score', key: 'performanceScore', suffix: '/100' },
              ].map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  {BRANCHES.map((b) => <td key={b.id}>{b[row.key]}{row.suffix}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function HistoricalTrendsPage() {
  return (
    <div className="page">
      <div className="grid two-up">
        <ChartCard title="Collection Rate Over Time" subtitle="Weekly % by branch">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={WEEKLY_COLLECTION_RATE}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis domain={[75, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Delinquency Trend" subtitle="Monthly overdue accounts">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={MONTHLY_DELINQUENCY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {Object.keys(BRANCH_COLORS).map((b) => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} strokeWidth={2} />)}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Branch Performance Radar" subtitle="Multi-dimensional KPI comparison">
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={BRANCH_RADAR}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
            {Object.keys(BRANCH_COLORS).map((b) => (
              <Radar key={b} name={b} dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} />
            ))}
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function BranchDetailPage({ branchId, navigate }) {
  const branch = getBranchById(branchId);
  if (!branch) return <EmptyState title="Branch not found" description="Select a branch from Branch Performance." />;

  const kpiData = [
    { metric: 'Collection', value: branch.collectionRate },
    { metric: 'Sales', value: branch.salesCompletionRate },
    { metric: 'Inventory', value: branch.inventoryHealth },
    { metric: 'Compliance', value: branch.routeCompliance },
    { metric: 'Growth', value: branch.growthScore },
  ];

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{branch.status}</p>
          <h2>{branch.name}</h2>
          <p className="muted">{branch.collectors} collectors · {branch.salesAgents} sales agents · {branch.locations} locations</p>
        </div>
      </section>

      <StatsGrid stats={[
        { label: 'Performance Score', value: `${branch.performanceScore}/100` },
        { label: 'Risk Score', value: `${branch.riskScore}/100` },
        { label: 'Growth Score', value: `${branch.growthScore}/100` },
        { label: 'Collection Rate', value: `${branch.collectionRate}%` },
        { label: 'Sales Completion', value: `${branch.salesCompletionRate}%` },
        { label: 'Inventory Health', value: `${branch.inventoryHealth}%` },
      ]} />

      <div className="grid two-up">
        <ChartCard title="KPI Profile" subtitle="Branch performance dimensions">
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={kpiData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <Radar name={branch.name} dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} />
              <Tooltip formatter={(v) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Financial Overview">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[
              { name: 'Revenue', amount: branch.revenue },
              { name: 'Collections', amount: branch.collections },
              { name: 'Sales', amount: branch.sales },
              { name: 'Delinquency', amount: branch.delinquencies },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {[0, 1, 2, 3].map((i) => <Cell key={i} fill={COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <PageToolbar actions={[
        { label: 'View Leaflet | OpenStreetMap', to: '/operating-manager/leaflet', variant: 'secondary' },
        { label: 'View Alerts', to: '/operating-manager/alerts', variant: 'secondary' },
        { label: 'Back', to: '/operating-manager/branch-performance', variant: 'ghost' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function ReportsHubPage({ navigate, showToast }) {
  const [activeTab, setActiveTab] = useState('collections');
  const tabDefs = [
    { key: 'collections', label: 'Collections' },
    { key: 'sales', label: 'Sales' },
    { key: 'inventory', label: 'Inventory' },
    { key: 'delinquency', label: 'Payments & Delinquency' },
    { key: 'executive', label: 'Executive' },
  ];

  const exportRow = (
    <PageToolbar actions={[
      { label: 'Export PDF', action: 'pdf' },
      { label: 'Export Excel', action: 'excel', variant: 'secondary' },
    ]} onAction={(a) => showToast(`${a.label} started.`, 'success')} />
  );

  return (
    <div className="page">
      <div className="segmented-control" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        {tabDefs.map((t) => (
          <button key={t.key} className={activeTab === t.key ? 'segment active' : 'segment'} type="button" onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'collections' && (
        <>
          <div className="grid two-up">
            <ChartCard title="Monthly Collections by Branch" subtitle="6-month trend">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_COLLECTIONS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map((b) => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Collection Rate by Branch" subtitle="Weekly %">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={WEEKLY_COLLECTION_RATE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis domain={[75, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Branch Collection Summary">
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Branch</th><th>Collections</th><th>Rate</th><th>Overdue</th><th>Compliance</th></tr></thead>
                <tbody>
                  {BRANCHES.map((b) => <tr key={b.id}><td>{b.name}</td><td>{formatCurrency(b.collections)}</td><td>{b.collectionRate}%</td><td>{b.overdueAccounts}</td><td>{b.routeCompliance}%</td></tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          {exportRow}
        </>
      )}

      {activeTab === 'sales' && (
        <>
          <StatsGrid stats={[
            { label: 'Sales Today', value: formatCurrency(SALES_ANALYTICS.salesToday) },
            { label: 'Total Sales (YTD)', value: formatCurrency(ENTERPRISE_KPIS.totalSales) },
            { label: 'Total Revenue (YTD)', value: formatCurrency(ENTERPRISE_KPIS.totalRevenue) },
          ]} />

          <div className="grid two-up">
            <ChartCard title="Monthly Revenue by Branch" subtitle="6-month trend">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_REVENUE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map((b) => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.08} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sales Completion Rate" subtitle="Weekly %">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={WEEKLY_SALES_RATE}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis domain={[65, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map((b) => <Line key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} strokeWidth={2} dot={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Top-Selling Products">
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Product Name</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
                <tbody>
                  {SALES_ANALYTICS.topSellingProducts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td><td>{p.category}</td><td>{p.quantitySold}</td><td>{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Sales Summary">
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Branch</th><th>Sales Volume</th><th>Revenue</th><th>Completion Rate</th><th>Agents</th></tr></thead>
                <tbody>
                  {BRANCHES.map((b) => <tr key={b.id}><td>{b.name}</td><td>{formatCurrency(b.sales)}</td><td>{formatCurrency(b.revenue)}</td><td>{b.salesCompletionRate}%</td><td>{b.salesAgents}</td></tr>)}
                </tbody>
              </table>
            </div>
          </ChartCard>
          {exportRow}
        </>
      )}

      {activeTab === 'inventory' && (
        <>
          <StatsGrid stats={[
            { label: 'Current Stock Levels', value: INVENTORY_ANALYTICS.currentStockLevels.toLocaleString() },
            { label: 'Inbound Stock', value: INVENTORY_ANALYTICS.stockMovement.inbound.toLocaleString() },
            { label: 'Outbound Stock', value: INVENTORY_ANALYTICS.stockMovement.outbound.toLocaleString() },
            { label: 'Sync Status', value: INVENTORY_ANALYTICS.syncStatus.status },
          ]} />

          <div className="grid two-up">
            <ChartCard title="Inventory Health by Branch" subtitle="Current health scores">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={BRANCHES.map((b) => ({ name: b.name, health: b.inventoryHealth, value: b.inventoryValue / 1000000 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}M`} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="health" name="Health %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="value" name="Value (M PHP)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Low Stock Items" subtitle="Requires immediate attention">
              <div className="table-shell">
                <table className="data-table">
                  <thead><tr><th>Product Name</th><th>Branch</th><th>Current Stock</th><th>Status</th></tr></thead>
                  <tbody>
                    {INVENTORY_ANALYTICS.lowStockItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td><td>{item.branch}</td><td>{item.currentStock}</td>
                        <td><SeverityBadge severity={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
          {exportRow}
        </>
      )}

      {activeTab === 'delinquency' && (
        <>
          <StatsGrid stats={[
            { label: 'Outstanding Receivables', value: formatCurrency(PAYMENT_ANALYTICS.outstandingReceivables) },
            { label: 'Current Accounts', value: PAYMENT_ANALYTICS.currentAccountsCount.toLocaleString() },
            { label: 'Credit Utilization', value: `${PAYMENT_ANALYTICS.creditUtilizationRate}%` },
          ]} />

          <div className="grid two-up">
            <ChartCard title="Aging of Receivables" subtitle="Amount by age bucket">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={PAYMENT_ANALYTICS.agingOfReceivables}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="amount" name="Amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Monthly Delinquency Trend" subtitle="Overdue accounts per branch">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={MONTHLY_DELINQUENCY}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {Object.keys(BRANCH_COLORS).map((b) => <Area key={b} type="monotone" dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} strokeWidth={2} />)}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Delinquency by Branch" subtitle="Current overdue counts">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={BRANCHES.map((b) => ({ name: b.name, overdue: b.overdueAccounts, risk: b.riskScore }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overdue" name="Overdue Accounts" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="risk" name="Risk Score" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          {exportRow}
        </>
      )}

      {activeTab === 'executive' && (
        <>
          <StatsGrid stats={[
            { label: 'Total Revenue', value: formatCurrency(ENTERPRISE_KPIS.totalRevenue) },
            { label: 'Total Collections', value: formatCurrency(ENTERPRISE_KPIS.totalCollections) },
            { label: 'Total Sales', value: formatCurrency(ENTERPRISE_KPIS.totalSales) },
            { label: 'Total Delinquencies', value: formatCurrency(ENTERPRISE_KPIS.totalDelinquencies) },
          ]} />
          <ChartCard title="Branch Performance Radar" subtitle="Multi-dimensional comparison">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={BRANCH_RADAR}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                {Object.keys(BRANCH_COLORS).map((b) => <Radar key={b} name={b} dataKey={b} stroke={BRANCH_COLORS[b]} fill={BRANCH_COLORS[b]} fillOpacity={0.1} />)}
                <Legend />
                <Tooltip formatter={(v) => `${v}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
          {exportRow}
        </>
      )}
    </div>
  );
}

function LeafletPage({ navigate, subPage }) {
  const [layers, setLayers] = useState(LEAFLET_LAYERS);
  const [filters, setFilters] = useState({ branch: 'All Branches', dateRange: 'This Month', staffType: 'All Staff' });
  const toggleLayer = (id) => setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));

  const mockBranchMarkers = useMemo(() => [
    { id: 'davao-city', position: [7.1907, 125.4553], label: 'DC', color: '#2563eb', popup: 'Davao City Branch - Healthy' },
    { id: 'general-santos', position: [6.1164, 125.1716], label: 'GS', color: '#10b981', popup: 'General Santos Branch - Top Performer' },
    { id: 'davao-oriental', position: [6.9534, 126.1558], label: 'DO', color: '#ef4444', popup: 'Davao Oriental Branch - Needs Attention' },
  ], []);

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Map Filters</h3></div>
        <div className="accounts-filters">
          <select value={filters.branch} onChange={(e) => setFilters((f) => ({ ...f, branch: e.target.value }))}>
            <option>All Branches</option>{BRANCHES.map((b) => <option key={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.dateRange} onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value }))}>
            {['This Month', 'Last Month', 'Q2 2026', 'YTD'].map((d) => <option key={d}>{d}</option>)}
          </select>
          <select value={filters.staffType} onChange={(e) => setFilters((f) => ({ ...f, staffType: e.target.value }))}>
            {['All Staff', 'Collectors', 'Sales Agents'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>{subPage ? { delinquency: 'Delinquency Heatmap', profitability: 'Profitability Analysis', territory: 'Territory Analysis' }[subPage] : 'Leaflet | OpenStreetMap'}</h3>
        </div>
        <LeafletMap markers={mockBranchMarkers} center={[6.7534, 125.6558]} zoom={8} height={560} />
        <div className="layer-toggles" style={{ marginTop: 16 }}>
          {layers.map((layer) => (
            <label key={layer.id} className="toggle-label">
              <input type="checkbox" checked={layer.active} onChange={() => toggleLayer(layer.id)} />
              {layer.label}
            </label>
          ))}
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Delinquency Heatmap', to: '/operating-manager/leaflet/delinquency', variant: 'secondary' },
        { label: 'Profitability Analysis', to: '/operating-manager/leaflet/profitability', variant: 'secondary' },
        { label: 'Territory Analysis', to: '/operating-manager/leaflet/territory', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function AlertsPage({ navigate, showToast }) {
  const [alerts, setAlerts] = useState(ALERTS);
  const [severityFilter, setSeverityFilter] = useState('All');
  const filtered = useMemo(() => severityFilter === 'All' ? alerts : alerts.filter((a) => a.severity === severityFilter), [alerts, severityFilter]);
  const resolveAlert = (id) => { setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true } : a))); showToast('Alert resolved.', 'success'); };

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All', 'Critical', 'Warning', 'Informational'].map((f) => (
            <button key={f} className={severityFilter === f ? 'segment active' : 'segment'} type="button" onClick={() => setSeverityFilter(f)}>{f}</button>
          ))}
        </div>
      </section>
      {filtered.length === 0
        ? <EmptyState title="No alerts" description="No alerts match this filter." />
        : (
          <section className="panel content-panel">
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Type</th><th>Branch</th><th>Message</th><th>Severity</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id}>
                      <td>{a.type}</td><td>{a.branch}</td><td>{a.message}</td>
                      <td><SeverityBadge severity={a.severity} /></td>
                      <td>{a.date}</td><td>{a.resolved ? 'Resolved' : 'Open'}</td>
                      <td className="table-actions">
                        {!a.resolved ? <button className="button ghost" type="button" onClick={() => resolveAlert(a.id)}>Resolve</button> : null}
                        <button className="button ghost" type="button" onClick={() => navigate(`/operating-manager/branch-performance/branch/${a.branchId}`)}>Open Branch</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [items, setItems] = useState(NOTIFICATIONS);
  const markRead = (id) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  const markAllRead = () => { setItems((prev) => prev.map((n) => ({ ...n, read: true }))); showToast('All marked as read.', 'success'); };
  return (
    <div className="page">
      <PageToolbar actions={[{ label: 'Mark All as Read', variant: 'secondary' }]} onAction={markAllRead} />
      {items.length === 0 ? <EmptyState title="No notifications" description="You're all caught up." /> : (
        <ul className="notification-list">
          {items.map((n) => (
            <li key={n.id} className={`notification-item${n.read ? '' : ' unread'}`}>
              <div><strong>{n.type}</strong><p className="muted">{n.message}</p></div>
              <div className="notification-actions">
                {!n.read ? <button className="button ghost" type="button" onClick={() => markRead(n.id)}>Mark Read</button> : null}
                {n.relatedTo ? <button className="button ghost" type="button" onClick={() => navigate(n.relatedTo)}>Open Record</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Customer Records ──────────────────────────────────────────────────────────
function CustomerRecordsPage({ navigate }) {
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return CUSTOMER_RECORDS.filter((r) => {
      const matchSearch = !q || r.clientName.toLowerCase().includes(q) || r.accountNumber.toLowerCase().includes(q);
      const matchBranch = branchFilter === 'All' || r.branch === branchFilter;
      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      const matchRisk = riskFilter === 'All' || r.riskLevel === riskFilter;
      return matchSearch && matchBranch && matchStatus && matchRisk;
    });
  }, [search, branchFilter, statusFilter, riskFilter]);

  const riskBadge = (level) => {
    const map = { Low: { color: '#059669', bg: 'rgba(5,150,105,0.1)' }, Medium: { color: '#d97706', bg: 'rgba(217,119,6,0.1)' }, High: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)' }, Critical: { color: '#7f1d1d', bg: 'rgba(127,29,29,0.12)' } };
    const s = map[level] ?? {};
    return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', background: s.bg, color: s.color }}>{level}</span>;
  };

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Total Accounts', value: String(CUSTOMER_RECORDS.length) },
        { label: 'Current', value: String(CUSTOMER_RECORDS.filter(r => r.status === 'Current').length) },
        { label: 'Overdue', value: String(CUSTOMER_RECORDS.filter(r => r.status === 'Overdue').length) },
        { label: 'Blacklisted', value: String(CUSTOMER_RECORDS.filter(r => r.status === 'Blacklisted').length) },
        { label: 'High / Critical Risk', value: String(CUSTOMER_RECORDS.filter(r => r.riskLevel === 'High' || r.riskLevel === 'Critical').length) },
        { label: 'Total Outstanding', value: formatCurrency(CUSTOMER_RECORDS.reduce((s, r) => s + r.outstandingBalance, 0)) },
      ]} />

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>All Customer Accounts</h3></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by client name or account number" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
              <option value="All">All Branches</option>
              {BRANCHES.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {['All', 'Current', 'Pending', 'Overdue', 'Blacklisted'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
            </select>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
              {['All', 'Low', 'Medium', 'High', 'Critical'].map(r => <option key={r} value={r}>{r === 'All' ? 'All Risk Levels' : r}</option>)}
            </select>
          </div>
        </div>
      </section>

      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Account</th><th>Client</th><th>Branch</th><th>Outstanding</th><th>Days Overdue</th><th>Credit Limit</th><th>Risk</th><th>Last Visit</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>{r.accountNumber}</td>
                    <td><strong>{r.clientName}</strong><span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>{r.businessType}</span></td>
                    <td>{r.branch}</td>
                    <td style={{ fontWeight: 600, color: r.outstandingBalance > 0 ? '#dc2626' : '#059669' }}>
                      {r.outstandingBalance > 0 ? formatCurrency(r.outstandingBalance) : 'Clear'}
                    </td>
                    <td style={{ color: r.daysOverdue > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>{r.daysOverdue > 0 ? `${r.daysOverdue}d` : '—'}</td>
                    <td>{formatCurrency(r.creditLimit)}</td>
                    <td>{riskBadge(r.riskLevel)}</td>
                    <td>{r.lastVisit}</td>
                    <td className="table-actions">
                      <button className="icon-action-button" type="button" title="View" onClick={() => navigate(`/operating-manager/customers/${r.id}`)}><NavIcon name="view" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No records found" description="Adjust your search or filters." />}
    </div>
  );
}

function CustomerDetailPage({ customerId, navigate }) {
  const record = getCustomerRecordById(customerId);
  if (!record) return <EmptyState title="Customer not found" actionLabel="Back" onAction={() => navigate('/operating-manager/customers')} />;

  const riskColor = { Low: '#059669', Medium: '#d97706', High: '#dc2626', Critical: '#7f1d1d' }[record.riskLevel] ?? '#64748b';
  const utilizationPct = Math.round((record.outstandingBalance / record.creditLimit) * 100);

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow" style={{ color: riskColor }}>{record.riskLevel} Risk · {record.status}</p>
          <h2>{record.clientName}</h2>
          <p className="muted">{record.accountNumber} · {record.branch} Branch · {record.businessType}</p>
        </div>
      </section>

      <StatsGrid stats={[
        { label: 'Credit Limit', value: formatCurrency(record.creditLimit) },
        { label: 'Outstanding Balance', value: formatCurrency(record.outstandingBalance) },
        { label: 'Credit Utilization', value: `${utilizationPct}%` },
        { label: 'Days Overdue', value: record.daysOverdue > 0 ? `${record.daysOverdue} days` : 'None' },
        { label: 'Total Purchases', value: formatCurrency(record.totalPurchases) },
        { label: 'Account Since', value: record.accountOpenDate },
      ]} />

      <div className="grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Account Information</h3></div>
          <ul className="info-grid">
            <li><span className="info-item-label">Contact Person</span><span className="info-item-value">{record.contactPerson}</span></li>
            <li><span className="info-item-label">Phone</span><span className="info-item-value">{record.phone}</span></li>
            <li><span className="info-item-label">Email</span><span className="info-item-value">{record.email}</span></li>
            <li><span className="info-item-label">Address</span><span className="info-item-value">{record.address}</span></li>
            <li><span className="info-item-label">Assigned Collector</span><span className="info-item-value">{record.assignedCollector}</span></li>
            <li><span className="info-item-label">Last Visit</span><span className="info-item-value">{record.lastVisit}</span></li>
          </ul>
        </section>

        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Credit Utilization</h3></div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.88rem' }}>
              <span>Used: {formatCurrency(record.outstandingBalance)}</span>
              <span className="muted">Limit: {formatCurrency(record.creditLimit)}</span>
            </div>
            <div style={{ height: 12, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(utilizationPct, 100)}%`, background: utilizationPct > 70 ? '#dc2626' : '#2563eb', borderRadius: 999, transition: 'width 0.4s' }} />
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: '0.82rem' }}>{utilizationPct}% utilized</p>
          </div>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700 }}>Payment Trend (last 4 months)</h4>
            {record.paymentHistory.map(p => (
              <div key={p.month} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 72, fontSize: '0.8rem', color: '#64748b' }}>{p.month}</span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((p.paid / p.due) * 100)}%`, background: p.onTime ? '#059669' : '#f59e0b', borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: '0.8rem', color: p.onTime ? '#059669' : '#dc2626', fontWeight: 600, width: 40 }}>
                  {Math.round((p.paid / p.due) * 100)}%
                </span>
                <span style={{ fontSize: '0.75rem', color: p.onTime ? '#059669' : '#dc2626' }}>{p.onTime ? '✓' : '!'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <PageToolbar actions={[
        { label: 'Back to Customer Records', to: '/operating-manager/customers', variant: 'ghost' },
      ]} onAction={a => navigate(a.to)} />
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  const [profile, setProfile] = useState({ ...OPERATING_MANAGER_PROFILE });
  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Operating Manager Information</h3></div>
        <div className="form-grid">
          <label>Full Name<input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></label>
          <label>Employee ID<input value={profile.employeeId} readOnly /></label>
          <label>Assigned Region<input value={profile.region} readOnly /></label>
          <label>Email<input type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></label>
          <label>Phone<input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></label>
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Update Profile' },
        { label: 'Change Password', variant: 'secondary' },
        { label: 'Logout', variant: 'ghost' },
      ]} onAction={(a) => { if (a.label === 'Logout') requestLogout(); else showToast(`${a.label} action recorded.`, 'success'); }} />
    </div>
  );
}

export function OperatingManagerPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  if (page.module === 'admin') return <AdminPageBody page={page} navigate={navigate} showToast={showToast} />;
  if (page.module === 'operations') return <BranchManagerPageBody page={page} navigate={navigate} showToast={showToast} />;
  const props = { branchId: page.params?.branchId, customerId: page.params?.customerId, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard': return <DashboardPage {...props} />;
    case 'branchPerformance': return <BranchPerformanceHub {...props} />;
    case 'branchComparison': return <BranchComparisonPage {...props} />;
    case 'branchDetail': return <BranchDetailPage {...props} />;
    case 'historicalTrends': return <HistoricalTrendsPage {...props} />;
    case 'leafletMap': return <LeafletPage {...props} />;
    case 'leafletDelinquency': return <LeafletPage {...props} subPage="delinquency" />;
    case 'leafletProfitability': return <LeafletPage {...props} subPage="profitability" />;
    case 'leafletTerritory': return <LeafletPage {...props} subPage="territory" />;
    case 'reports':
    case 'reportCollections':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':
    case 'reportExecutive': return <ReportsHubPage {...props} />;
    case 'alerts': return <AlertsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'customers': return <CustomerRecordsPage {...props} />;
    case 'customerDetail': return <CustomerDetailPage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
