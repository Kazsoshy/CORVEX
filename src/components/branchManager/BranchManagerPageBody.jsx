import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ALERTS,
  AUDIT_LOGS,
  BRANCH_ANALYTICS,
  BRANCH_MANAGER_PROFILE,
  CI_QUEUE,
  COLLECTORS,
  MAP_ACCOUNTS,
  NOTIFICATIONS,
  PENDING_APPROVALS,
  SALES_AGENTS,
  TRENDS,
  formatCurrency,
  getAlertById,
  getCIById,
  getCollectorById,
  getMapAccountById,
  getSalesAgentById,
} from '../../data/branchManagerMockData';
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

function StaffCard({ title, metrics, actions, onAction }) {
  return (
    <article className="account-card">
      <div className="account-card-header"><h4>{title}</h4></div>
      <div className="account-metrics">
        {metrics.map((m) => (
          <div key={m.label}><span className="metric-label">{m.label}</span><strong>{m.value}</strong></div>
        ))}
      </div>
      <div className="account-card-actions">
        {actions.map((a) => (
          <button key={a.label} className={actionButtonClass(a.variant)} type="button" onClick={() => onAction(a)}>{a.label}</button>
        ))}
      </div>
    </article>
  );
}

function DashboardPage({ navigate }) {
  const unread = NOTIFICATIONS.filter((n) => !n.read).length;
  const criticalAlerts = ALERTS.filter((a) => a.severity === 'Critical');

  return (
    <div className="page">
      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">{BRANCH_MANAGER_PROFILE.branch}</p>
          <h2>{BRANCH_MANAGER_PROFILE.name}</h2>
          <p className="muted">Branch Health Score: <strong>{BRANCH_ANALYTICS.healthScore}/100</strong></p>
        </div>
        <Link to="/branch-manager/notifications" className="notification-bell" aria-label={`${unread} unread`}>
          <NavIcon name="bell" />
          {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
        </Link>
      </section>

      <StatsGrid stats={[
        { label: 'Collection Rate Today', value: `${BRANCH_ANALYTICS.collectionRateToday}%` },
        { label: 'Route Compliance Score', value: `${BRANCH_ANALYTICS.routeCompliance}%` },
        { label: 'Sales Visit Completion', value: `${BRANCH_ANALYTICS.salesVisitCompletion}%` },
        { label: 'Stock Alerts Count', value: String(BRANCH_ANALYTICS.stockAlertsCount) },
        { label: 'Pending CI Approvals', value: String(BRANCH_ANALYTICS.pendingCI) },
        { label: 'Overdue Accounts', value: String(BRANCH_ANALYTICS.overdueAccounts) },
      ]} />

      <StatsGrid stats={[
        { label: 'Total Collections Today', value: formatCurrency(BRANCH_ANALYTICS.totalCollectionsToday) },
        { label: 'Total Sales Today', value: formatCurrency(BRANCH_ANALYTICS.totalSalesToday) },
        { label: 'Active Collectors', value: String(BRANCH_ANALYTICS.activeCollectors) },
        { label: 'Active Sales Agents', value: String(BRANCH_ANALYTICS.activeSalesAgents) },
        { label: 'Inventory Health Score', value: `${BRANCH_ANALYTICS.inventoryHealth}%` },
        { label: 'Branch Efficiency', value: `${BRANCH_ANALYTICS.collectionEfficiency}%` },
      ]} />

      <PageToolbar actions={[
        { label: 'View Collector Routes', to: '/branch-manager/field-operations/collectors' },
        { label: 'View Sales Schedules', to: '/branch-manager/field-operations/sales', variant: 'secondary' },
        { label: 'Approve CI Forms', to: '/branch-manager/ci-approvals', variant: 'secondary' },
        { label: 'Open GIS Map', to: '/branch-manager/gis', variant: 'secondary' },
        { label: 'View Reports', to: '/branch-manager/reports', variant: 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Branch Analytics</h3></div>
          <div className="analytics-grid two-up">
            <div className="analytics-card"><span className="metric-label">Collection Efficiency</span><strong>{BRANCH_ANALYTICS.collectionEfficiency}%</strong></div>
            <div className="analytics-card"><span className="metric-label">Sales Efficiency</span><strong>{BRANCH_ANALYTICS.salesEfficiency}%</strong></div>
            <div className="analytics-card"><span className="metric-label">Inventory Health</span><strong>{BRANCH_ANALYTICS.inventoryHealth}%</strong></div>
            <div className="analytics-card"><span className="metric-label">Branch Health</span><strong>{BRANCH_ANALYTICS.healthScore}%</strong></div>
          </div>
        </section>
        <section className="panel content-panel alert-panel">
          <div className="panel-section-header"><h3>Critical Alerts Feed</h3><button className="button ghost" type="button" onClick={() => navigate('/branch-manager/alerts')}>View All</button></div>
          <ul className="widget-list">
            {criticalAlerts.map((a) => (
              <li key={a.id}><div><strong>{a.title}</strong><span className="muted">{a.category}</span></div><SeverityBadge severity={a.severity} /></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Performance Trends</h3></div>
        <div className="trend-grid four-up">
          <TrendChart label="Delinquency Trend" values={TRENDS.delinquency} />
          <TrendChart label="Route Compliance" values={TRENDS.routeCompliance} />
          <TrendChart label="Sales Trend" values={TRENDS.sales.map((v) => v / 1000)} />
          <TrendChart label="Collection Trend" values={TRENDS.collection.map((v) => v / 1000)} />
        </div>
      </section>
    </div>
  );
}

function FieldOperationsHub({ navigate }) {
  return (
    <div className="page">
      <div className="quick-link-grid">
        <Link to="/branch-manager/field-operations/collectors" className="quick-link-card">
          <span className="quick-link-icon"><NavIcon label="Collector Routes" /></span>
          <span className="quick-link-copy"><strong>Collector Route Overview</strong><span className="muted">{COLLECTORS.length} active collectors</span></span>
        </Link>
        <Link to="/branch-manager/field-operations/sales" className="quick-link-card">
          <span className="quick-link-icon"><NavIcon label="Sales Schedules" /></span>
          <span className="quick-link-copy"><strong>Sales Schedule Overview</strong><span className="muted">{SALES_AGENTS.length} active agents</span></span>
        </Link>
        <Link to="/branch-manager/field-operations/performance" className="quick-link-card">
          <span className="quick-link-icon"><NavIcon name="reports" /></span>
          <span className="quick-link-copy"><strong>Route Performance</strong><span className="muted">Compliance & efficiency</span></span>
        </Link>
      </div>
    </div>
  );
}

function CollectorRoutesPage({ navigate, showToast }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setLoading(false), 400); return () => window.clearTimeout(t); }, []);
  if (loading) return <LoadingState message="Loading collector routes..." />;

  return (
    <div className="page">
      <div className="account-card-grid">
        {COLLECTORS.map((c) => (
          <StaffCard
            key={c.id}
            title={c.name}
            metrics={[
              { label: 'Assigned', value: c.accountsAssigned },
              { label: 'Visited', value: c.accountsVisited },
              { label: 'Pending', value: c.accountsPending },
              { label: 'Compliance', value: `${c.complianceScore}%` },
              { label: 'Collected', value: formatCurrency(c.collectionAmount) },
            ]}
            actions={[
              { label: 'Expand Route', action: 'detail' },
              { label: 'View Performance', action: 'performance', variant: 'secondary' },
              { label: 'View on Map', action: 'map', variant: 'ghost' },
            ]}
            onAction={(a) => {
              if (a.action === 'detail') navigate(`/branch-manager/field-operations/collectors/${c.id}`);
              else if (a.action === 'performance') navigate('/branch-manager/staff-performance/collectors');
              else if (a.action === 'map') navigate('/branch-manager/gis');
              else showToast('Action completed.', 'success');
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CollectorDetailPage({ collectorId, navigate, showToast }) {
  const collector = getCollectorById(collectorId);
  if (!collector) return <EmptyState title="Collector not found" actionLabel="Back" onAction={() => navigate('/branch-manager/field-operations/collectors')} />;

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Route Compliance', value: `${collector.complianceScore}%` },
        { label: 'Collection Success', value: `${collector.collectionSuccessRate}%` },
        { label: 'Avg Visit Duration', value: collector.avgVisitDuration },
        { label: 'Recovery Rate', value: `${collector.recoveryRate}%` },
      ]} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Assigned Route & Visit Timeline</h3><span className="muted">GPS Attendance: {collector.gpsAttendance ? 'Active' : 'Off'}</span></div>
        {collector.route.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Account</th><th>Status</th><th>Time</th><th>Amount</th></tr></thead>
              <tbody>{collector.route.map((r) => <tr key={r.account}><td>{r.account}</td><td>{r.status}</td><td>{r.time}</td><td>{r.amount ? formatCurrency(r.amount) : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState title="No route data" description="Route timeline will populate during field operations." />}
        <div className="placeholder-map" style={{ marginTop: 16 }}>GPS route playback placeholder</div>
      </section>
      {collector.missedAccounts.length ? (
        <section className="panel content-panel alert-panel">
          <h4 className="subsection-title">Missed Accounts</h4>
          <ul className="bullet-list">{collector.missedAccounts.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      ) : null}
      <PageToolbar actions={[
        { label: 'View on Map', to: '/branch-manager/gis', variant: 'secondary' },
        { label: 'Back', to: '/branch-manager/field-operations/collectors', variant: 'ghost' },
      ]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SalesSchedulesPage({ navigate }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setLoading(false), 400); return () => window.clearTimeout(t); }, []);
  if (loading) return <LoadingState message="Loading sales schedules..." />;

  return (
    <div className="page">
      <div className="account-card-grid">
        {SALES_AGENTS.map((a) => (
          <StaffCard
            key={a.id}
            title={a.name}
            metrics={[
              { label: 'Clients Assigned', value: a.clientsAssigned },
              { label: 'Visits Completed', value: a.visitsCompleted },
              { label: 'Sales Logged', value: a.salesLogged },
              { label: 'Total Sales', value: formatCurrency(a.totalSalesAmount) },
            ]}
            actions={[
              { label: 'Expand Schedule', action: 'detail' },
              { label: 'View Performance', action: 'performance', variant: 'secondary' },
              { label: 'View on Map', action: 'map', variant: 'ghost' },
            ]}
            onAction={(act) => {
              if (act.action === 'detail') navigate(`/branch-manager/field-operations/sales/${a.id}`);
              else if (act.action === 'performance') navigate('/branch-manager/staff-performance/sales');
              else navigate('/branch-manager/gis');
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SalesAgentDetailPage({ agentId, navigate }) {
  const agent = getSalesAgentById(agentId);
  if (!agent) return <EmptyState title="Agent not found" actionLabel="Back" onAction={() => navigate('/branch-manager/field-operations/sales')} />;

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Visit Completion', value: `${agent.visitCompletionRate}%` },
        { label: 'Conversion Rate', value: `${agent.conversionRate}%` },
        { label: 'Avg Sale Value', value: formatCurrency(agent.avgSaleValue) },
        { label: 'New Clients', value: String(agent.newClientsAcquired) },
      ]} />
      <section className="panel content-panel">
        <h4 className="subsection-title">Assigned Clients</h4>
        {agent.clients.length ? <ul className="bullet-list">{agent.clients.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="muted">No client assignments recorded.</p>}
        <h4 className="subsection-title">Product Performance</h4>
        {agent.productPerformance.length ? (
          <ul className="widget-list">{agent.productPerformance.map((p) => <li key={p.product}><div><strong>{p.product}</strong></div><span>{p.units} units</span></li>)}</ul>
        ) : <p className="muted">No product sales data.</p>}
      </section>
      <PageToolbar actions={[{ label: 'Back', to: '/branch-manager/field-operations/sales', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function RoutePerformancePage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Route Performance Summary</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Type</th><th>Compliance</th><th>Recovery / Revenue</th><th>Missed</th></tr></thead>
            <tbody>
              {COLLECTORS.map((c) => <tr key={c.id}><td>{c.name}</td><td>Collector</td><td>{c.complianceScore}%</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>)}
              {SALES_AGENTS.map((a) => <tr key={a.id}><td>{a.name}</td><td>Sales Agent</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>—</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Field Operations', to: '/branch-manager/field-operations', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function CIQueuePage({ navigate, showToast }) {
  const [filter, setFilter] = useState('Pending');
  const filtered = useMemo(() => CI_QUEUE.filter((c) => filter === 'All' || c.status === filter), [filter]);

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">
          {['Pending', 'Approved', 'Rejected', 'All'].map((f) => (
            <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Client</th><th>Submitted By</th><th>Date</th><th>Delinquency</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((ci) => (
                  <tr key={ci.id}>
                    <td>{ci.clientName}</td>
                    <td>{ci.submittedBy}</td>
                    <td>{ci.submissionDate}</td>
                    <td>{ci.delinquencyStatus}</td>
                    <td>{ci.status}</td>
                    <td className="table-actions">
                      <button className="link-button" type="button" onClick={() => navigate(`/branch-manager/ci-approvals/${ci.id}`)}>Open CI</button>
                      {ci.status === 'Pending' ? (
                        <>
                          <button className="link-button" type="button" onClick={() => showToast(`Approved CI for ${ci.clientName}.`, 'success')}>Approve</button>
                          <button className="link-button" type="button" onClick={() => showToast(`Rejected CI for ${ci.clientName}.`, 'error')}>Reject</button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No CI records" description="No items match this filter." />}
    </div>
  );
}

function CIDetailPage({ ciId, navigate, showToast }) {
  const ci = getCIById(ciId);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  if (!ci) return <EmptyState title="CI not found" actionLabel="Back" onAction={() => navigate('/branch-manager/ci-approvals')} />;

  const handleReject = () => {
    if (!rejectReason.trim()) { showToast('Rejection reason is required.', 'error'); return; }
    showToast(`CI rejected. Submitter notified: ${rejectReason}`, 'error');
    navigate('/branch-manager/ci-approvals');
  };

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Client', value: ci.clientName },
        { label: 'Risk Score', value: String(ci.riskScore) },
        { label: 'Delinquency', value: ci.delinquencyStatus },
        { label: 'GIS Zone', value: ci.gisClassification },
      ]} />
      <section className="panel content-panel">
        <ul className="bullet-list">
          <li>Purpose: {ci.purpose}</li>
          <li>Monthly Income: {formatCurrency(ci.monthlyIncome)}</li>
          <li>Business Type: {ci.businessType}</li>
          <li>References: {ci.references}</li>
          <li>Remarks: {ci.formRemarks}</li>
        </ul>
        {ci.delinquencyFlags.length ? (
          <div className="alert-panel" style={{ marginTop: 16, padding: 12 }}>
            <strong>Delinquency Flags:</strong>
            <ul className="bullet-list">{ci.delinquencyFlags.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        ) : null}
        <h4 className="subsection-title">Payment History</h4>
        {ci.paymentHistory.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{ci.paymentHistory.map((p) => <tr key={p.date}><td>{p.date}</td><td>{formatCurrency(p.amount)}</td><td>{p.status}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="muted">No payment history on file.</p>}
      </section>
      {showReject ? (
        <section className="panel form-panel content-panel">
          <div className="form-group">
            <label>Rejection Reason<span className="required">*</span></label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Mandatory reason for rejection..." />
          </div>
        </section>
      ) : null}
      {ci.status === 'Pending' ? (
        <PageToolbar actions={[
          { label: 'Approve', action: 'approve' },
          { label: showReject ? 'Confirm Reject' : 'Reject', action: 'reject', variant: 'secondary' },
          { label: 'Request Revision', action: 'revision', variant: 'secondary' },
          { label: 'Back to Queue', to: '/branch-manager/ci-approvals', variant: 'ghost' },
        ]} onAction={(a) => {
          if (a.action === 'approve') { showToast('CI approved.', 'success'); navigate('/branch-manager/ci-approvals'); }
          else if (a.action === 'reject') { if (showReject) handleReject(); else setShowReject(true); }
          else if (a.action === 'revision') { showToast('Revision requested. Submitter notified.', 'success'); navigate('/branch-manager/ci-approvals'); }
          else navigate(a.to);
        }} />
      ) : (
        <PageToolbar actions={[{ label: 'Back to Queue', to: '/branch-manager/ci-approvals', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
      )}
    </div>
  );
}

function GISPage({ pageType, navigate, showToast }) {
  const [layers, setLayers] = useState(['Collector Routes', 'Delinquency Clusters']);
  const [dateRange, setDateRange] = useState('Today');
  const [staffFilter, setStaffFilter] = useState('All');
  const layerOptions = ['Collector Routes', 'Sales Territories', 'Payment Behavior Zones', 'Delinquency Clusters', 'Profitability Zones', 'High Collection Areas', 'Low Collection Areas', 'High Sales Areas', 'Route Efficiency Layer'];

  const mapTitle = {
    gisMap: 'GIS & Location Intelligence',
    gisTerritory: 'Territory Map',
    gisDelinquency: 'Delinquency Heatmap',
    gisProfitability: 'Profitability Zones',
  }[pageType] ?? 'GIS Map';

  const toggleLayer = (layer) => setLayers((prev) => (prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]));

  return (
    <div className="page">
      <PageToolbar actions={[
        { label: 'Territory Map', to: '/branch-manager/gis/territory', variant: pageType === 'gisTerritory' ? undefined : 'secondary' },
        { label: 'Delinquency Heatmap', to: '/branch-manager/gis/delinquency', variant: pageType === 'gisDelinquency' ? undefined : 'secondary' },
        { label: 'Profitability Zones', to: '/branch-manager/gis/profitability', variant: pageType === 'gisProfitability' ? undefined : 'secondary' },
      ]} onAction={(a) => navigate(a.to)} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>{mapTitle}</h3></div>
        <div className="accounts-filters">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>{['Today', 'This Week', 'This Month'].map((d) => <option key={d}>{d}</option>)}</select>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
            <option value="All">All Staff</option>
            {COLLECTORS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            {SALES_AGENTS.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div className="layer-toggles">
          {layerOptions.map((layer) => (
            <label key={layer} className="toggle-label">
              <input type="checkbox" checked={layers.includes(layer)} onChange={() => toggleLayer(layer)} />
              {layer}
            </label>
          ))}
        </div>
        <div className="placeholder-map">Interactive map with {layers.length} active layers · Route playback enabled</div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Client Pins</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Client</th><th>Balance</th><th>Status</th><th>Last Visit</th><th>Staff</th><th>Actions</th></tr></thead>
            <tbody>
              {MAP_ACCOUNTS.map((a) => (
                <tr key={a.id}>
                  <td>{a.clientName}</td>
                  <td>{formatCurrency(a.balance)}</td>
                  <td>{a.paymentStatus}</td>
                  <td>{a.lastVisit}</td>
                  <td>{a.assignedStaff}</td>
                  <td><button className="link-button" type="button" onClick={() => navigate(`/branch-manager/gis/account/${a.id}`)}>Open Detail</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AccountLocationDetailPage({ accountId, navigate }) {
  const account = getMapAccountById(accountId);
  if (!account) return <EmptyState title="Account not found" actionLabel="Back" onAction={() => navigate('/branch-manager/gis')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Balance', value: formatCurrency(account.balance) },
        { label: 'Payment Status', value: account.paymentStatus },
        { label: 'Zone', value: account.zone },
      ]} />
      <section className="panel content-panel">
        <ul className="bullet-list">
          <li>Client: {account.clientName}</li>
          <li>Last Visit: {account.lastVisit}</li>
          <li>Assigned Staff: {account.assignedStaff}</li>
          <li>Coordinates: {account.lat}, {account.lng}</li>
        </ul>
        <div className="placeholder-map mini-map">Account location pin on territory map</div>
      </section>
      <PageToolbar actions={[
        { label: 'Open Account Detail', action: 'account' },
        { label: 'Back to Map', to: '/branch-manager/gis', variant: 'ghost' },
      ]} onAction={(a) => (a.to ? navigate(a.to) : navigate('/branch-manager/gis'))} />
    </div>
  );
}

function ReportsHubPage({ navigate, showToast }) {
  const categories = [
    { label: 'Collection Reports', to: '/branch-manager/reports/collection', desc: 'Daily trends, collector performance, success rate' },
    { label: 'Sales Reports', to: '/branch-manager/reports/sales', desc: 'Revenue trends, agent & product performance' },
    { label: 'Inventory Reports', to: '/branch-manager/reports/inventory', desc: 'Stock levels, movements, forecasted stockouts' },
    { label: 'Delinquency Reports', to: '/branch-manager/reports/delinquency', desc: 'Delinquency rate, heatmap, risk categories' },
  ];
  return (
    <div className="page">
      <div className="quick-link-grid">
        {categories.map((cat) => (
          <Link key={cat.to} to={cat.to} className="quick-link-card">
            <span className="quick-link-icon"><NavIcon name="reports" /></span>
            <span className="quick-link-copy"><strong>{cat.label}</strong><span className="muted">{cat.desc}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReportPage({ reportType, navigate, showToast }) {
  const titles = { reportCollection: 'Collection Reports', reportSales: 'Sales Reports', reportInventory: 'Inventory Reports', reportDelinquency: 'Delinquency Reports' };
  const charts = {
    reportCollection: ['Daily Collection Trend', 'Collector Performance', 'Collection Success Rate'],
    reportSales: ['Sales Revenue Trend', 'Agent Performance', 'Product Performance'],
    reportInventory: ['Inventory Levels', 'Stock Movement Trends', 'Forecasted Stockouts'],
    reportDelinquency: ['Delinquency Rate', 'Delinquency Heatmap', 'Risk Categories'],
  };
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>{titles[reportType]}</h3></div>
        <div className="trend-grid three-up">
          {charts[reportType].map((chart) => (
            <div key={chart} className="analytics-card">
              <span className="metric-label">{chart}</span>
              <div className="placeholder-map chart-placeholder">Chart placeholder</div>
            </div>
          ))}
        </div>
      </section>
      <PageToolbar actions={[
        { label: 'Export PDF', action: 'pdf' },
        { label: 'Export Excel', action: 'excel', variant: 'secondary' },
        { label: 'Back', to: '/branch-manager/reports', variant: 'ghost' },
      ]} onAction={(a) => {
        if (a.to) navigate(a.to);
        else showToast(`${a.label} initiated.`, 'success');
      }} />
    </div>
  );
}

function StaffPerformanceHub({ navigate }) {
  return (
    <div className="page">
      <div className="quick-link-grid">
        <Link to="/branch-manager/staff-performance/collectors" className="quick-link-card">
          <span className="quick-link-copy"><strong>Collectors</strong><span className="muted">Route compliance, recovery, missed visits</span></span>
        </Link>
        <Link to="/branch-manager/staff-performance/sales" className="quick-link-card">
          <span className="quick-link-copy"><strong>Sales Agents</strong><span className="muted">Visit completion, revenue, new clients</span></span>
        </Link>
        <Link to="/branch-manager/staff-performance/scorecards" className="quick-link-card">
          <span className="quick-link-copy"><strong>Performance Scorecards</strong><span className="muted">Daily, weekly, monthly rankings</span></span>
        </Link>
      </div>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Staff Monitoring</h3></div>
        <ul className="bullet-list">
          <li>GPS Attendance: All collectors checked in today</li>
          <li>Route Tracking: 5 active routes monitored</li>
          <li>Daily Activity: 37 field activities logged</li>
        </ul>
      </section>
    </div>
  );
}

function StaffCollectorsPage({ navigate }) {
  const [ranking, setRanking] = useState('Daily');
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">{['Daily', 'Weekly', 'Monthly'].map((r) => <button key={r} className={ranking === r ? 'segment active' : 'segment'} type="button" onClick={() => setRanking(r)}>{r}</button>)}</div>
      </section>
      <div className="table-shell panel content-panel">
        <table className="data-table">
          <thead><tr><th>Collector</th><th>Route Compliance</th><th>Collections</th><th>Recovery Rate</th><th>Missed Visits</th></tr></thead>
          <tbody>{COLLECTORS.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.complianceScore}%</td><td>{formatCurrency(c.collectionAmount)}</td><td>{c.recoveryRate}%</td><td>{c.missedVisits}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function StaffSalesPage({ navigate }) {
  const [ranking, setRanking] = useState('Daily');
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">{['Daily', 'Weekly', 'Monthly'].map((r) => <button key={r} className={ranking === r ? 'segment active' : 'segment'} type="button" onClick={() => setRanking(r)}>{r}</button>)}</div>
      </section>
      <div className="table-shell panel content-panel">
        <table className="data-table">
          <thead><tr><th>Agent</th><th>Visit Completion</th><th>Revenue</th><th>New Clients</th><th>Product Sales</th></tr></thead>
          <tbody>{SALES_AGENTS.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.visitCompletionRate}%</td><td>{formatCurrency(a.totalSalesAmount)}</td><td>{a.newClientsAcquired}</td><td>{a.salesLogged}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function StaffScorecardsPage({ navigate }) {
  const combined = [
    ...COLLECTORS.map((c) => ({ name: c.name, role: 'Collector', score: c.complianceScore, metric: `${c.recoveryRate}% recovery` })),
    ...SALES_AGENTS.map((a) => ({ name: a.name, role: 'Sales Agent', score: a.visitCompletionRate, metric: formatCurrency(a.totalSalesAmount) })),
  ].sort((a, b) => b.score - a.score);

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Performance Scorecards</h3></div>
        <ul className="widget-list">
          {combined.map((s, i) => (
            <li key={s.name}>
              <div><strong>#{i + 1} {s.name}</strong><span className="muted">{s.role}</span></div>
              <span>{s.score}% · {s.metric}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AlertsPage({ navigate, showToast }) {
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'All') return ALERTS;
    return ALERTS.filter((a) => a.type === filter.toLowerCase() || a.category.includes(filter));
  }, [filter]);

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All', 'Collection', 'Sales', 'Inventory', 'Route'].map((f) => (
            <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </section>
      <div className="notification-list">
        {filtered.map((alert) => (
          <article key={alert.id} className="notification-item">
            <div>
              <h4>{alert.title}</h4>
              <p className="muted">{alert.message}</p>
              <span className="notification-time">{alert.category} · {alert.time}</span>
            </div>
            <div className="notification-actions">
              <SeverityBadge severity={alert.severity} />
              <button className="button ghost" type="button" onClick={() => showToast('Follow-up assigned.', 'success')}>Assign Follow-Up</button>
              <button className="button secondary" type="button" onClick={() => showToast('Alert details opened.', 'success')}>View Details</button>
              <button className="button" type="button" onClick={() => showToast('Alert resolved.', 'success')}>Resolve</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => !n.read);
    if (filter === 'CI') return notifications.filter((n) => n.type === 'ci');
    if (filter === 'Route') return notifications.filter((n) => n.type === 'route');
    if (filter === 'Delinquency') return notifications.filter((n) => n.type === 'delinquency');
    if (filter === 'Inventory') return notifications.filter((n) => n.type === 'inventory');
    if (filter === 'Staff') return notifications.filter((n) => n.type === 'staff');
    return notifications;
  }, [notifications, filter]);

  return (
    <div className="page">
      <PageToolbar actions={[{ label: 'Mark All as Read', action: 'markAll' }]} onAction={() => { setNotifications((n) => n.map((i) => ({ ...i, read: true }))); showToast('All marked as read.', 'success'); }} />
      <section className="panel content-panel">
        <div className="segmented-control">{['All', 'Unread', 'CI', 'Route', 'Delinquency', 'Inventory', 'Staff'].map((f) => <button key={f} className={filter === f ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(f)}>{f}</button>)}</div>
      </section>
      {filtered.length ? (
        <div className="notification-list">
          {filtered.map((item) => (
            <article key={item.id} className={`notification-item${item.read ? '' : ' unread'}`}>
              <div><h4>{item.title}</h4><p className="muted">{item.message}</p><span className="notification-time">{item.time}</span></div>
              <div className="notification-actions">
                {!item.read ? <button className="button ghost" type="button" onClick={() => { setNotifications((items) => items.map((n) => (n.id === item.id ? { ...n, read: true } : n))); showToast('Marked as read.', 'success'); }}>Mark as Read</button> : null}
                <button className="button secondary" type="button" onClick={() => navigate(item.relatedTo)}>Open Related Record</button>
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No notifications" description="You're all caught up." />}
    </div>
  );
}

function ApprovalCenterPage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Approval Center</h3><p className="muted">Centralized approvals for CI, inventory transfers, and special collection requests.</p></div>
        <div className="analytics-grid three-up">
          <button className="analytics-card report-card" type="button" onClick={() => navigate('/branch-manager/ci-approvals')}>
            <span className="metric-label">Credit Investigations</span><strong>{PENDING_APPROVALS.ci} pending</strong>
          </button>
          <button className="analytics-card report-card" type="button" onClick={() => showToast('Transfer approvals opened.', 'success')}>
            <span className="metric-label">Inventory Transfers</span><strong>{PENDING_APPROVALS.transfers} pending</strong>
          </button>
          <button className="analytics-card report-card" type="button" onClick={() => showToast('Special collection requests opened.', 'success')}>
            <span className="metric-label">Special Collections</span><strong>{PENDING_APPROVALS.specialCollections} pending</strong>
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{BRANCH_MANAGER_PROFILE.avatarInitials}</div>
          <div><h3>{BRANCH_MANAGER_PROFILE.name}</h3><p className="muted">{BRANCH_MANAGER_PROFILE.employeeId}</p></div>
        </div>
        <ul className="bullet-list">
          <li>Branch Assignment: {BRANCH_MANAGER_PROFILE.branch}</li>
          <li>Email: {BRANCH_MANAGER_PROFILE.email}</li>
          <li>Phone: {BRANCH_MANAGER_PROFILE.phone}</li>
        </ul>
      </section>
      <PageToolbar actions={[
        { label: 'Update Profile', action: 'update' },
        { label: 'Change Password', action: 'password', variant: 'secondary' },
        { label: 'Approval Center', to: '/branch-manager/approval-center', variant: 'ghost' },
        { label: 'Audit Log', to: '/branch-manager/audit-log', variant: 'ghost' },
        { label: 'Logout', action: 'logout', variant: 'ghost' },
      ]} onAction={(a) => {
        if (a.to) navigate(a.to);
        else if (a.action === 'logout') { showToast('Logged out.', 'success'); navigate('/login'); }
        else showToast(`${a.label} form would open here.`, 'success');
      }} />
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>{AUDIT_LOGS.map((log) => <tr key={log.id}><td>{log.action}</td><td>{log.detail}</td><td>{log.timestamp}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Profile', to: '/branch-manager/profile', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

export function BranchManagerPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = {
    collectorId: page.params?.collectorId,
    agentId: page.params?.agentId,
    ciId: page.params?.ciId,
    accountId: page.params?.accountId,
    navigate,
    showToast,
  };

  switch (page.pageType) {
    case 'dashboard': return <DashboardPage {...props} />;
    case 'fieldOperations': return <FieldOperationsHub {...props} />;
    case 'routePerformance': return <RoutePerformancePage {...props} />;
    case 'collectorRoutes': return <CollectorRoutesPage {...props} />;
    case 'collectorDetail': return <CollectorDetailPage {...props} />;
    case 'salesSchedules': return <SalesSchedulesPage {...props} />;
    case 'salesAgentDetail': return <SalesAgentDetailPage {...props} />;
    case 'ciQueue': return <CIQueuePage {...props} />;
    case 'ciDetail': return <CIDetailPage {...props} />;
    case 'gisMap':
    case 'gisTerritory':
    case 'gisDelinquency':
    case 'gisProfitability': return <GISPage pageType={page.pageType} {...props} />;
    case 'accountLocationDetail': return <AccountLocationDetailPage {...props} />;
    case 'reports': return <ReportsHubPage {...props} />;
    case 'reportCollection':
    case 'reportSales':
    case 'reportInventory':
    case 'reportDelinquency': return <ReportPage reportType={page.pageType} {...props} />;
    case 'staffPerformance': return <StaffPerformanceHub {...props} />;
    case 'staffCollectors': return <StaffCollectorsPage {...props} />;
    case 'staffSales': return <StaffSalesPage {...props} />;
    case 'staffScorecards': return <StaffScorecardsPage {...props} />;
    case 'alerts': return <AlertsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'approvalCenter': return <ApprovalCenterPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'auditLog': return <AuditLogPage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
