import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  ALERTS, BRANCHES, BRANCH_RADAR, ENTERPRISE_KPIS, GIS_LAYERS,
  MONTHLY_COLLECTIONS, MONTHLY_DELINQUENCY, MONTHLY_REVENUE,
  NOTIFICATIONS, OPERATING_MANAGER_PROFILE, REPORT_CATEGORIES,
  TREND_DATA, WEEKLY_COLLECTION_RATE, WEEKLY_SALES_RATE,
  formatCurrency, getBranchById, getHighestPerformingBranch, getLowestPerformingBranch,
} from '../../data/operatingManagerMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';

const COLORS = ['#2563eb', '#06b6d4', '#8b5cf6', '#f59e0b'];
const BRANCH_COLORS = { Main: '#2563eb', North: '#06b6d4', South: '#ef4444', Davao: '#10b981' };

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
    name: b.name.replace(' Branch', '').replace(' City', ''),
    Collection: b.collectionRate,
    Sales: b.salesCompletionRate,
    Inventory: b.inventoryHealth,
  }));

  const revenueDonut = BRANCHES.map((b) => ({ name: b.name.replace(' Branch', '').replace(' City', ''), value: b.revenue }));

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Executive overview</p>
          <h2>{OPERATING_MANAGER_PROFILE.name}</h2>
          <p className="muted">{OPERATING_MANAGER_PROFILE.region}</p>
        </div>
        <Link to="/operating-manager/notifications" className="notification-bell" aria-label={`${unread} unread notifications`}>
          <NavIcon name="bell" />
          {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[
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
        { label: 'GIS Intelligence', to: '/operating-manager/gis', variant: 'secondary' },
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
                <BarChart data={BRANCHES.map((b) => ({ name: b.name.replace(' Branch', '').replace(' City', ''), score: b.performanceScore, growth: b.growthScore }))} layout="vertical">
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
                    <span style={{ width: 120, fontSize: '0.85rem', fontWeight: 600 }}>{b.name.replace(' Branch', '').replace(' City', '')}</span>
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

      {activeTab === 'comparison' && <BranchComparisonPage navigate={navigate} showToast={() => {}} />}
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
        { label: 'View GIS Map', to: '/operating-manager/gis', variant: 'secondary' },
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
    { key: 'delinquency', label: 'Delinquency' },
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
          <ChartCard title="Inventory Health by Branch" subtitle="Current health scores">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={BRANCHES.map((b) => ({ name: b.name.replace(' Branch', '').replace(' City', ''), health: b.inventoryHealth, value: b.inventoryValue / 1000000 }))}>
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
          {exportRow}
        </>
      )}

      {activeTab === 'delinquency' && (
        <>
          <div className="grid two-up">
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
                <BarChart data={BRANCHES.map((b) => ({ name: b.name.replace(' Branch', '').replace(' City', ''), overdue: b.overdueAccounts, risk: b.riskScore }))}>
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

function GisPage({ navigate, subPage }) {
  const [layers, setLayers] = useState(GIS_LAYERS);
  const [filters, setFilters] = useState({ branch: 'All Branches', dateRange: 'This Month', staffType: 'All Staff' });
  const toggleLayer = (id) => setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));

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
          <h3>{subPage ? { delinquency: 'Delinquency Heatmap', profitability: 'Profitability Analysis', territory: 'Territory Analysis' }[subPage] : 'All-Branch GIS Map'}</h3>
        </div>
        <div className="placeholder-map">Interactive multi-branch map · {layers.filter((l) => l.active).length} active layers</div>
        <div className="layer-toggles">
          {layers.map((layer) => (
            <label key={layer.id} className="toggle-label">
              <input type="checkbox" checked={layer.active} onChange={() => toggleLayer(layer.id)} />
              {layer.label}
            </label>
          ))}
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Delinquency Heatmap', to: '/operating-manager/gis/delinquency', variant: 'secondary' },
        { label: 'Profitability Analysis', to: '/operating-manager/gis/profitability', variant: 'secondary' },
        { label: 'Territory Analysis', to: '/operating-manager/gis/territory', variant: 'secondary' },
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
      ]} onAction={(a) => { if (a.label === 'Logout') navigate('/login'); else showToast(`${a.label} action recorded.`, 'success'); }} />
    </div>
  );
}

export function OperatingManagerPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = { branchId: page.params?.branchId, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard': return <DashboardPage {...props} />;
    case 'branchPerformance': return <BranchPerformanceHub {...props} />;
    case 'branchComparison': return <BranchComparisonPage {...props} />;
    case 'branchDetail': return <BranchDetailPage {...props} />;
    case 'historicalTrends': return <HistoricalTrendsPage {...props} />;
    case 'gisMap': return <GisPage {...props} />;
    case 'gisDelinquency': return <GisPage {...props} subPage="delinquency" />;
    case 'gisProfitability': return <GisPage {...props} subPage="profitability" />;
    case 'gisTerritory': return <GisPage {...props} subPage="territory" />;
    case 'reports':
    case 'reportCollections':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency':
    case 'reportExecutive': return <ReportsHubPage {...props} />;
    case 'alerts': return <AlertsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
