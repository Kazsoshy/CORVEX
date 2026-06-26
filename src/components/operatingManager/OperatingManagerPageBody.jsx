import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ALERTS,
  BRANCHES,
  ENTERPRISE_KPIS,
  GIS_LAYERS,
  NOTIFICATIONS,
  OPERATING_MANAGER_PROFILE,
  REPORT_CATEGORIES,
  TREND_DATA,
  formatCurrency,
  getBranchById,
  getHighestPerformingBranch,
  getLowestPerformingBranch,
} from '../../data/operatingManagerMockData';
import { EmptyState } from '../collector/EmptyState';
import { LoadingState } from '../collector/LoadingState';
import { NavIcon } from '../../navIcons';

function actionButtonClass(variant) {
  if (variant === 'secondary') return 'button secondary';
  if (variant === 'ghost') return 'button ghost';
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

function TrendChart({ label, values }) {
  const max = Math.max(...values);
  return (
    <div className="trend-chart">
      <span className="metric-label">{label}</span>
      <div className="trend-bars">
        {values.map((v, i) => (
          <div key={i} className="trend-bar" style={{ height: `${(v / max) * 100}%` }} title={String(v)} />
        ))}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const cls = { Critical: 'severity-critical', Warning: 'severity-warning', Informational: 'severity-info' }[severity] ?? '';
  return <span className={`severity-badge ${cls}`}>{severity}</span>;
}

function FilterPanel({ title, fields, values, onChange }) {
  return (
    <section className="panel form-panel content-panel">
      <div className="panel-section-header"><h3>{title}</h3></div>
      <div className="form-grid">
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.type === 'select' ? (
              <select value={values[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)}>
                {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input type="text" value={values[field.name] ?? ''} onChange={(e) => onChange(field.name, e.target.value)} placeholder={field.placeholder} />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

function MapPlaceholder({ layers, onToggleLayer }) {
  return (
    <section className="panel content-panel map-panel">
      <div className="panel-section-header"><h3>All-Branch GIS Map</h3></div>
      <div className="map-placeholder" role="img" aria-label="Interactive GIS map placeholder">
        <NavIcon name="map" className="map-placeholder-icon" />
        <p className="muted">Multi-branch map with layer toggles and territory filters</p>
      </div>
      <div className="layer-toggles">
        {layers.map((layer) => (
          <label key={layer.id} className="toggle-label">
            <input type="checkbox" checked={layer.active} onChange={() => onToggleLayer(layer.id)} />
            {layer.label}
          </label>
        ))}
      </div>
    </section>
  );
}

function DashboardPage({ navigate }) {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const topBranch = getHighestPerformingBranch();
  const lowBranch = getLowestPerformingBranch();
  const criticalAlerts = ALERTS.filter((a) => a.severity === 'Critical' && !a.resolved);

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

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Branch KPI Overview</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Collection Rate</th>
                <th>Sales Completion</th>
                <th>Inventory Health</th>
                <th>Overdue Accounts</th>
                <th>Route Compliance</th>
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map((b) => (
                <tr key={b.id}>
                  <td><button className="link-button" type="button" onClick={() => navigate(`/operating-manager/branch-performance/branch/${b.id}`)}>{b.name}</button></td>
                  <td>{b.collectionRate}%</td>
                  <td>{b.salesCompletionRate}%</td>
                  <td>{b.inventoryHealth}%</td>
                  <td>{b.overdueAccounts}</td>
                  <td>{b.routeCompliance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <StatsGrid stats={[
        { label: 'Total Revenue', value: formatCurrency(ENTERPRISE_KPIS.totalRevenue) },
        { label: 'Total Collections', value: formatCurrency(ENTERPRISE_KPIS.totalCollections) },
        { label: 'Total Sales', value: formatCurrency(ENTERPRISE_KPIS.totalSales) },
        { label: 'Total Delinquencies', value: formatCurrency(ENTERPRISE_KPIS.totalDelinquencies) },
        { label: 'Total Inventory Value', value: formatCurrency(ENTERPRISE_KPIS.totalInventoryValue) },
      ]} />

      <PageToolbar actions={[
        { label: 'Compare Branches', to: '/operating-manager/branch-performance/comparison' },
        { label: 'GIS Intelligence', to: '/operating-manager/gis', variant: 'secondary' },
        { label: 'Reports', to: '/operating-manager/reports', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Highest Performing Branch</h3></div>
          <div className="analytics-card highlight">
            <strong>{topBranch.name}</strong>
            <span className="muted">Performance score: {topBranch.performanceScore}/100</span>
            <span>Collection: {topBranch.collectionRate}%</span>
          </div>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Lowest Performing Branch</h3></div>
          <div className="analytics-card">
            <strong>{lowBranch.name}</strong>
            <span className="muted">Performance score: {lowBranch.performanceScore}/100</span>
            <span>Collection: {lowBranch.collectionRate}%</span>
          </div>
        </section>
      </div>

      {criticalAlerts.length ? (
        <section className="panel content-panel alert-panel">
          <div className="panel-section-header"><h3>Critical Branch Alerts</h3></div>
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

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Trend Comparison</h3></div>
        <div className="analytics-grid three-up">
          <TrendChart label="Collection Rate (%)" values={TREND_DATA.collection} />
          <TrendChart label="Sales Completion (%)" values={TREND_DATA.sales} />
          <TrendChart label="Delinquency Rate (%)" values={TREND_DATA.delinquency} />
        </div>
      </section>
    </div>
  );
}

function BranchPerformanceHub({ navigate }) {
  return (
    <div className="page">
      <div className="quick-link-grid">
        {[
          { label: 'Branch Comparison', desc: 'Side-by-side KPI comparison', to: '/operating-manager/branch-performance/comparison' },
          { label: 'Historical Trends', desc: 'Performance trends over time', to: '/operating-manager/branch-performance/trends' },
        ].map((item) => (
          <button key={item.label} className="quick-link-card" type="button" onClick={() => navigate(item.to)}>
            <span className="quick-link-icon"><NavIcon name="compare" /></span>
            <span className="quick-link-copy"><strong>{item.label}</strong><span className="muted">{item.desc}</span></span>
          </button>
        ))}
      </div>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>All Branches</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Branch</th><th>Performance</th><th>Risk</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {BRANCHES.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.performanceScore}/100</td>
                  <td>{b.riskScore}/100</td>
                  <td>{b.status}</td>
                  <td><button className="button ghost" type="button" onClick={() => navigate(`/operating-manager/branch-performance/branch/${b.id}`)}>View Detail</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BranchComparisonPage({ navigate, showToast }) {
  const [filters, setFilters] = useState({ dateRange: 'This Month', branch: 'All Branches', kpiType: 'All KPIs' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) return <LoadingState message="Loading branch comparison…" />;

  return (
    <div className="page">
      <FilterPanel
        title="Comparison Filters"
        fields={[
          { name: 'dateRange', label: 'Date Range', type: 'select', options: ['This Month', 'Last Month', 'Q2 2026', 'YTD'] },
          { name: 'branch', label: 'Branch', type: 'select', options: ['All Branches', ...BRANCHES.map((b) => b.name)] },
          { name: 'kpiType', label: 'KPI Type', type: 'select', options: ['All KPIs', 'Collection', 'Sales', 'Inventory', 'Delinquency'] },
        ]}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
      />

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>KPI Comparison</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr><th>Metric</th>{BRANCHES.map((b) => <th key={b.id}>{b.name}</th>)}</tr>
            </thead>
            <tbody>
              {[
                { metric: 'Collection Rate', key: 'collectionRate', suffix: '%' },
                { metric: 'Sales Completion', key: 'salesCompletionRate', suffix: '%' },
                { metric: 'Inventory Health', key: 'inventoryHealth', suffix: '%' },
                { metric: 'Route Compliance', key: 'routeCompliance', suffix: '%' },
                { metric: 'Overdue Accounts', key: 'overdueAccounts', suffix: '' },
              ].map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  {BRANCHES.map((b) => <td key={b.id}>{b[row.key]}{row.suffix}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Branch Rankings</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Branch</th><th>Performance Score</th><th>Growth Score</th></tr></thead>
            <tbody>
              {[...BRANCHES].sort((a, b) => b.performanceScore - a.performanceScore).map((b, i) => (
                <tr key={b.id}><td>{i + 1}</td><td>{b.name}</td><td>{b.performanceScore}</td><td>{b.growthScore}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PageToolbar actions={[
        { label: 'Export PDF', variant: 'secondary' },
        { label: 'Export Excel', variant: 'secondary' },
      ]} onAction={(a) => showToast(`${a.label} started.`, 'success')} />
    </div>
  );
}

function BranchDetailPage({ branchId, navigate }) {
  const branch = getBranchById(branchId);
  if (!branch) return <EmptyState title="Branch not found" description="Select a branch from Branch Performance." />;

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

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Collection Metrics</h3></div>
          <div className="analytics-grid two-up">
            <div className="analytics-card"><span className="metric-label">Collections</span><strong>{formatCurrency(branch.collections)}</strong></div>
            <div className="analytics-card"><span className="metric-label">Overdue Accounts</span><strong>{branch.overdueAccounts}</strong></div>
            <div className="analytics-card"><span className="metric-label">Delinquencies</span><strong>{formatCurrency(branch.delinquencies)}</strong></div>
            <div className="analytics-card"><span className="metric-label">Route Compliance</span><strong>{branch.routeCompliance}%</strong></div>
          </div>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Sales & Inventory</h3></div>
          <div className="analytics-grid two-up">
            <div className="analytics-card"><span className="metric-label">Sales Volume</span><strong>{formatCurrency(branch.sales)}</strong></div>
            <div className="analytics-card"><span className="metric-label">Revenue</span><strong>{formatCurrency(branch.revenue)}</strong></div>
            <div className="analytics-card"><span className="metric-label">Inventory Value</span><strong>{formatCurrency(branch.inventoryValue)}</strong></div>
            <div className="analytics-card"><span className="metric-label">Sales Completion</span><strong>{branch.salesCompletionRate}%</strong></div>
          </div>
        </section>
      </div>

      <PageToolbar actions={[
        { label: 'View GIS Map', to: '/operating-manager/gis', variant: 'secondary' },
        { label: 'View Alerts', to: '/operating-manager/alerts', variant: 'secondary' },
        { label: 'Back to Comparison', to: '/operating-manager/branch-performance/comparison', variant: 'ghost' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function HistoricalTrendsPage() {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Historical Performance Trends</h3></div>
        <div className="analytics-grid three-up">
          <TrendChart label="Collection Rate (%)" values={TREND_DATA.collection} />
          <TrendChart label="Sales Completion (%)" values={TREND_DATA.sales} />
          <TrendChart label="Delinquency Rate (%)" values={TREND_DATA.delinquency} />
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Branch Trend Lines</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Branch</th><th>Collection Trend</th><th>Sales Trend</th><th>Delinquency Trend</th></tr></thead>
            <tbody>
              {BRANCHES.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.collectionRate >= 90 ? '↑ Improving' : b.collectionRate >= 85 ? '→ Stable' : '↓ Declining'}</td>
                  <td>{b.salesCompletionRate >= 85 ? '↑ Improving' : '→ Stable'}</td>
                  <td>{b.riskScore >= 35 ? '↑ Rising' : '→ Stable'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function GisPage({ navigate, subPage }) {
  const [layers, setLayers] = useState(GIS_LAYERS);
  const [filters, setFilters] = useState({ branch: 'All Branches', dateRange: 'This Month', staffType: 'All Staff' });

  const toggleLayer = (id) => setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l)));

  const subTitles = {
    delinquency: 'Delinquency Heatmap',
    profitability: 'Profitability Analysis',
    territory: 'Territory Analysis',
  };

  return (
    <div className="page">
      <FilterPanel
        title="Map Filters"
        fields={[
          { name: 'branch', label: 'Branch', type: 'select', options: ['All Branches', ...BRANCHES.map((b) => b.name)] },
          { name: 'dateRange', label: 'Date Range', type: 'select', options: ['This Month', 'Last Month', 'Q2 2026', 'YTD'] },
          { name: 'staffType', label: 'Staff Type', type: 'select', options: ['All Staff', 'Collectors', 'Sales Agents'] },
        ]}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
      />

      {subPage ? (
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>{subTitles[subPage]}</h3></div>
          <div className="map-placeholder" role="img" aria-label={`${subTitles[subPage]} visualization`}>
            <NavIcon name="map" className="map-placeholder-icon" />
            <p className="muted">Geographic analysis layer for {subTitles[subPage].toLowerCase()}</p>
          </div>
        </section>
      ) : (
        <>
          <MapPlaceholder layers={layers} onToggleLayer={toggleLayer} />
          <section className="panel content-panel">
            <div className="panel-section-header"><h3>Branch Coverage</h3></div>
            <div className="table-shell">
              <table className="data-table">
                <thead><tr><th>Branch</th><th>Collectors</th><th>Sales Agents</th><th>Locations</th><th>Status</th></tr></thead>
                <tbody>
                  {BRANCHES.map((b) => (
                    <tr key={b.id}><td>{b.name}</td><td>{b.collectors}</td><td>{b.salesAgents}</td><td>{b.locations}</td><td>{b.status}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <PageToolbar actions={[
        { label: 'Delinquency Heatmap', to: '/operating-manager/gis/delinquency', variant: 'secondary' },
        { label: 'Profitability Analysis', to: '/operating-manager/gis/profitability', variant: 'secondary' },
        { label: 'Territory Analysis', to: '/operating-manager/gis/territory', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function ReportsHubPage({ navigate }) {
  return (
    <div className="page">
      <div className="quick-link-grid">
        {REPORT_CATEGORIES.map((cat) => (
          <button key={cat.id} className="quick-link-card report-card" type="button" onClick={() => navigate(cat.path)}>
            <span className="quick-link-icon"><NavIcon name="reports" /></span>
            <span className="quick-link-copy"><strong>{cat.title}</strong><span className="muted">{cat.reports.length} reports</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportCategoryPage({ categoryId, showToast }) {
  const category = REPORT_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return <EmptyState title="Report not found" description="Select a report category from Reports & Analytics." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>{category.title}</h3></div>
        <ul className="bullet-list">
          {category.reports.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Generate Report</h3></div>
        <div className="form-grid">
          <label>Date Range<select defaultValue="This Month"><option>This Month</option><option>Last Month</option><option>Q2 2026</option><option>YTD</option></select></label>
          <label>Branch<select defaultValue="All Branches"><option>All Branches</option>{BRANCHES.map((b) => <option key={b.id}>{b.name}</option>)}</select></label>
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Generate Report' },
        { label: 'Export PDF', variant: 'secondary' },
        { label: 'Export Excel', variant: 'secondary' },
      ]} onAction={(a) => showToast(`${a.label} for ${category.title} started.`, 'success')} />
    </div>
  );
}

function AlertsPage({ navigate, showToast }) {
  const [alerts, setAlerts] = useState(ALERTS);
  const [severityFilter, setSeverityFilter] = useState('All');

  const filtered = useMemo(() => {
    if (severityFilter === 'All') return alerts;
    return alerts.filter((a) => a.severity === severityFilter);
  }, [alerts, severityFilter]);

  const resolveAlert = (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true } : a)));
    showToast('Alert marked as resolved.', 'success');
  };

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Filter Alerts</h3></div>
        <label>Severity<select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option>All</option><option>Critical</option><option>Warning</option><option>Informational</option>
        </select></label>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="No alerts" description="No alerts match the selected severity filter." />
      ) : (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Branch</th><th>Message</th><th>Severity</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>{a.type}</td>
                    <td>{a.branch}</td>
                    <td>{a.message}</td>
                    <td><SeverityBadge severity={a.severity} /></td>
                    <td>{a.date}</td>
                    <td>{a.resolved ? 'Resolved' : 'Open'}</td>
                    <td className="table-actions">
                      {!a.resolved ? <button className="button ghost" type="button" onClick={() => resolveAlert(a.id)}>Mark Resolved</button> : null}
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
  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast('All notifications marked as read.', 'success');
  };

  return (
    <div className="page">
      <PageToolbar actions={[{ label: 'Mark All as Read', variant: 'secondary' }]} onAction={markAllRead} />
      {items.length === 0 ? (
        <EmptyState title="No notifications" description="You're all caught up." />
      ) : (
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
  const [profile, setProfile] = useState({ ...OPERATING_MANAGER_PROFILE, phone: OPERATING_MANAGER_PROFILE.phone });

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
      ]} onAction={(a) => {
        if (a.label === 'Logout') navigate('/login');
        else showToast(`${a.label} action recorded.`, 'success');
      }} />
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
    case 'reports': return <ReportsHubPage {...props} />;
    case 'reportCollections': return <ReportCategoryPage {...props} categoryId="collections" />;
    case 'reportSales': return <ReportCategoryPage {...props} categoryId="sales" />;
    case 'reportInventory': return <ReportCategoryPage {...props} categoryId="inventory" />;
    case 'reportDelinquency': return <ReportCategoryPage {...props} categoryId="delinquency" />;
    case 'reportExecutive': return <ReportCategoryPage {...props} categoryId="executive" />;
    case 'alerts': return <AlertsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
