import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AUDIT_LOGS,
  CLIENTS,
  DASHBOARD_SUMMARY,
  LOW_STOCK_ITEMS,
  NOTIFICATIONS,
  OFFLINE_STATUS,
  PRODUCTS,
  ROUTE_TRACKING,
  SALES_AGENT_PROFILE,
  SALES_ANALYTICS,
  SALES_HISTORY,
  SCHEDULE_STOPS,
  formatCurrency,
  getClientById,
  getProductById,
  getProductStock,
  getSaleById,
} from '../../data/salesMockData';
import { ClientCard } from './ClientCard';
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

function OfflineBanner() {
  if (!OFFLINE_STATUS.enabled) return null;
  return (
    <section className={`panel offline-banner${OFFLINE_STATUS.isOnline ? ' online' : ' offline'}`}>
      <div>
        <strong>{OFFLINE_STATUS.isOnline ? 'Online' : 'Offline Mode Active'}</strong>
        <p className="muted">
          Last sync: {OFFLINE_STATUS.lastSync}
          {OFFLINE_STATUS.pendingSync > 0 ? ` · ${OFFLINE_STATUS.pendingSync} pending sync` : ''}
        </p>
      </div>
      <span className="offline-cache muted">
        Cached: {OFFLINE_STATUS.cachedSchedules} schedules, {OFFLINE_STATUS.cachedInventory} products
      </span>
    </section>
  );
}

function DashboardPage({ navigate, showToast }) {
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;
  const firstPending = SCHEDULE_STOPS.find((c) => c.status !== 'Completed');

  return (
    <div className="page">
      <OfflineBanner />

      <section className="panel dashboard-greeting">
        <div className="dashboard-greeting-main">
          <p className="dashboard-eyebrow">Good morning</p>
          <h2>{SALES_AGENT_PROFILE.name}</h2>
          <p className="muted">{today}</p>
        </div>
        <Link to="/sales/notifications" className="notification-bell" aria-label={`${unreadCount} unread notifications`}>
          <NavIcon name="bell" />
          {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
        </Link>
      </section>

      <StatsGrid
        stats={[
          { label: 'Accounts to Visit Today', value: String(DASHBOARD_SUMMARY.accountsToVisit) },
          { label: 'Sales Commitments Logged', value: String(DASHBOARD_SUMMARY.salesLogged) },
          { label: 'Pending Visits', value: String(DASHBOARD_SUMMARY.pendingVisits) },
          { label: 'Completed Visits', value: String(DASHBOARD_SUMMARY.completedVisits) },
        ]}
      />

      {LOW_STOCK_ITEMS.length ? (
        <section className="panel content-panel alert-panel">
          <div className="panel-section-header">
            <h3>Low Stock Alerts</h3>
          </div>
          <ul className="widget-list">
            {LOW_STOCK_ITEMS.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted">{item.sku} · {item.branch}</span>
                </div>
                <span className={`stock-status stock-${item.status.toLowerCase()}`}>{item.stock} units · {item.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PageToolbar
        actions={[
          { label: "View Today's Schedule", to: '/sales/schedule' },
          { label: 'Log a Sale', to: firstPending ? `/sales/visit-log/${firstPending.id}?from=schedule` : '/sales/clients', variant: 'secondary' },
          { label: 'Check Inventory', to: '/sales/inventory', variant: 'secondary' },
        ]}
        onAction={(a) => navigate(a.to)}
      />

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Today&apos;s Revenue</h3></div>
          <p className="analytics-value">{formatCurrency(SALES_ANALYTICS.dailyRevenue)}</p>
          <p className="muted">Weekly: {formatCurrency(SALES_ANALYTICS.weeklyRevenue)} · Monthly: {formatCurrency(SALES_ANALYTICS.monthlyRevenue)}</p>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Visit Completion Progress</h3></div>
          <div className="progress-bar" role="progressbar" aria-valuenow={DASHBOARD_SUMMARY.visitProgress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${DASHBOARD_SUMMARY.visitProgress}%` }} />
          </div>
          <p className="muted progress-caption">{DASHBOARD_SUMMARY.completedVisits} of {DASHBOARD_SUMMARY.accountsToVisit} visits completed</p>
        </section>
      </div>

      <div className="dashboard-widgets grid two-up">
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Recent Sales</h3></div>
          <ul className="widget-list">
            {SALES_HISTORY.slice(0, 3).map((sale) => (
              <li key={sale.id}>
                <div><strong>{sale.clientName}</strong><span className="muted">{sale.date}</span></div>
                <span>{formatCurrency(sale.totalAmount)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel content-panel">
          <div className="panel-section-header"><h3>Top Selling Products</h3></div>
          <ul className="widget-list">
            {SALES_ANALYTICS.topProducts.map((product) => (
              <li key={product.name}>
                <div><strong>{product.name}</strong></div>
                <span>{product.units} units</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Sales Analytics</h3>
          <button className="button ghost" type="button" onClick={() => navigate('/sales/route-tracking')}>Route Tracking</button>
        </div>
        <div className="analytics-grid three-up">
          <div className="analytics-card"><span className="metric-label">Daily Total</span><strong>{formatCurrency(SALES_ANALYTICS.dailyRevenue)}</strong></div>
          <div className="analytics-card"><span className="metric-label">Weekly Total</span><strong>{formatCurrency(SALES_ANALYTICS.weeklyRevenue)}</strong></div>
          <div className="analytics-card"><span className="metric-label">Monthly Total</span><strong>{formatCurrency(SALES_ANALYTICS.monthlyRevenue)}</strong></div>
        </div>
        <h4 className="subsection-title">Top Clients</h4>
        <ul className="widget-list">
          {SALES_ANALYTICS.topClients.map((client) => (
            <li key={client.name}><div><strong>{client.name}</strong></div><span>{formatCurrency(client.revenue)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SchedulePage({ pageType, navigate, showToast }) {
  const [filter, setFilter] = useState('All');
  const [showMap, setShowMap] = useState(pageType === 'scheduleMap');

  const filtered = useMemo(() => {
    if (filter === 'All') return SCHEDULE_STOPS;
    if (filter === 'Pending') return SCHEDULE_STOPS.filter((c) => c.status === 'Pending');
    if (filter === 'Completed') return SCHEDULE_STOPS.filter((c) => c.status === 'Completed');
    return SCHEDULE_STOPS.filter((c) => c.status === 'Rescheduled');
  }, [filter]);

  const actions = [
    { label: 'Schedule List', to: '/sales/schedule', variant: pageType === 'scheduleList' && !showMap ? undefined : 'secondary' },
    { label: 'Territory Map', to: '/sales/schedule/map', variant: pageType === 'scheduleMap' || showMap ? undefined : 'secondary' },
  ];

  if (pageType === 'scheduleMap' || showMap) {
    return (
      <div className="page">
        <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
        <StatsGrid stats={[
          { label: 'Clients to Visit', value: String(SCHEDULE_STOPS.length) },
          { label: 'Distance Today', value: '22 km' },
          { label: 'Completed', value: String(DASHBOARD_SUMMARY.completedVisits) },
        ]} />
        <section className="panel content-panel">
          <div className="panel-section-header">
            <h3>Territory Route View</h3>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule')}>Show List View</button>
          </div>
          <div className="placeholder-map">Territory map with SOPA-ranked client pins and GPS route overlay</div>
          <p className="muted">GPS tracking active · Territory coverage: {ROUTE_TRACKING.territoryCoverage}% · Visits verified: {ROUTE_TRACKING.visitsVerified}/{ROUTE_TRACKING.visitsPlanned}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageToolbar actions={actions} onAction={(a) => navigate(a.to)} />
      <StatsGrid stats={[
        { label: 'Clients to Visit', value: String(SCHEDULE_STOPS.length) },
        { label: 'Distance Today', value: '22 km' },
        { label: 'Completed', value: String(DASHBOARD_SUMMARY.completedVisits) },
      ]} />
      <section className="panel content-panel" style={{ padding: '14px 20px' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
          <strong style={{ color: '#1e293b' }}>SAW Priority Engine</strong> — Clients are ranked using Simple Additive Weighting:
          purchase volume <strong>(40%)</strong>, delinquency risk <strong>(35%)</strong>, proximity <strong>(25%)</strong>. Highest score = visit first.
        </p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>SAW Prioritized Visit Schedule</h3>
          <div className="inline-toolbar">
            <div className="segmented-control">
              {['All', 'Pending', 'Completed', 'Rescheduled'].map((item) => (
                <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <button className="button secondary" type="button" onClick={() => navigate('/sales/schedule/map')}>Territory Map View</button>
          </div>
        </div>
        {filtered.length ? (
          <div className="account-card-grid">
            {filtered.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                showRank
                onViewDetails={(c) => navigate(`/sales/client-detail/${c.id}?from=schedule`)}
                onLogVisit={(c) => navigate(`/sales/visit-log/${c.id}?from=schedule`)}
                onCall={() => showToast(`Calling ${client.clientName}...`, 'success')}
                onNavigate={() => showToast(`Opening navigation to ${client.address}`, 'success')}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No clients match this filter" description="Try a different status filter." />
        )}
      </section>
    </div>
  );
}

function ClientsPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active Clients');
  const [sortBy, setSortBy] = useState('Name');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredClients = useMemo(() => {
    let results = [...CLIENTS];
    const query = search.trim().toLowerCase();
    if (query) {
      results = results.filter(
        (c) => c.clientName.toLowerCase().includes(query) || c.businessName.toLowerCase().includes(query) || c.phone.includes(query),
      );
    }
    switch (filter) {
      case 'Active Clients': results = results.filter((c) => c.active); break;
      case 'Inactive Clients': results = results.filter((c) => !c.active); break;
      case 'High Value Clients': results = results.filter((c) => c.highValue); break;
      case 'Delinquent Clients': results = results.filter((c) => c.delinquent); break;
      default: break;
    }
    switch (sortBy) {
      case 'Sales Volume': results.sort((a, b) => b.totalPurchaseVolume - a.totalPurchaseVolume); break;
      case 'Last Purchase Date': results.sort((a, b) => b.lastPurchaseDate.localeCompare(a.lastPurchaseDate)); break;
      case 'Distance': results.sort((a, b) => a.distanceKm - b.distanceKm); break;
      default: results.sort((a, b) => a.clientName.localeCompare(b.clientName)); break;
    }
    return results;
  }, [search, filter, sortBy]);

  if (loading) return <LoadingState message="Loading clients..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Client List</h3></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by client name, business name, or contact number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {['Active Clients', 'Inactive Clients', 'High Value Clients', 'Delinquent Clients'].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {['Name', 'Sales Volume', 'Last Purchase Date', 'Distance'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}
            </select>
          </div>
        </div>
      </section>
      {filteredClients.length ? (
        <div className="account-card-grid">
          {filteredClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onViewDetails={(c) => navigate(`/sales/client-detail/${c.id}?from=clients`)}
              onCall={() => showToast(`Calling ${client.clientName}...`, 'success')}
              onNavigate={() => showToast(`Opening navigation to ${client.address}`, 'success')}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No clients found" description="Adjust your search or filters." actionLabel="Clear filters" onAction={() => { setSearch(''); setFilter('Active Clients'); }} />
      )}
    </div>
  );
}

function ClientDetailPage({ clientId, parentContext, navigate, showToast }) {
  const client = getClientById(clientId);
  if (!client) return <EmptyState title="Client not found" actionLabel="Back to Clients" onAction={() => navigate('/sales/clients')} />;

  const backTo = parentContext === 'schedule' ? '/sales/schedule' : '/sales/clients';
  const contextQuery = `?from=${parentContext}`;

  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Total Purchases', value: formatCurrency(client.totalPurchaseVolume) },
        { label: 'Last Visit', value: client.lastVisitDate },
        { label: 'Avg Order', value: formatCurrency(Math.round(client.totalPurchaseVolume / Math.max(client.purchaseHistory.length, 1))) },
      ]} />
      <section className="panel content-panel account-detail-panel">
        <div className="panel-section-header">
          <h3>{client.clientName}</h3>
          <p className="muted">{client.businessName}</p>
        </div>
        <div className="account-detail-grid two-up">
          <div>
            <p><strong>Address:</strong> {client.address}</p>
            <p><strong>Contact:</strong> {client.phone}</p>
            <p><strong>Last Purchase:</strong> {client.lastPurchaseDate}</p>
          </div>
          <div>
            <h4 className="subsection-title">Sales Performance</h4>
            <p>Monthly target: {formatCurrency(client.salesPerformance.monthlyTarget)}</p>
            <p>Achieved: {formatCurrency(client.salesPerformance.achieved)}</p>
            <p>Visits: {client.salesPerformance.visitsCompleted}/{client.salesPerformance.visitsPlanned}</p>
          </div>
        </div>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Purchase History</h3></div>
        {client.purchaseHistory.length ? (
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Products</th><th>Agent</th></tr></thead>
              <tbody>
                {client.purchaseHistory.map((row) => (
                  <tr key={row.date + row.amount}><td>{row.date}</td><td>{formatCurrency(row.amount)}</td><td>{row.products}</td><td>{row.agent}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No purchase history" description="Sales to this client will appear here." />}
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Current Stock Availability</h3></div>
        {client.stockAvailability.length ? (
          <ul className="widget-list">
            {client.stockAvailability.map((item) => (
              <li key={item.product}><div><strong>{item.product}</strong></div><span>{item.stock} units on hand</span></li>
            ))}
          </ul>
        ) : <EmptyState title="No stock data" description="Stock levels at this client location are not recorded." />}
      </section>
      <PageToolbar
        actions={[
          { label: 'Log Sales Visit', to: `/sales/visit-log/${client.id}${contextQuery}` },
          { label: 'Submit Credit Investigation', to: `/sales/ci-form/${client.id}${contextQuery}`, variant: 'secondary' },
          { label: 'Call Client', action: 'call', variant: 'secondary' },
          { label: 'Open Navigation', action: 'navigate', variant: 'secondary' },
          { label: 'Back', to: backTo, variant: 'ghost' },
        ]}
        onAction={(action) => {
          if (action.action === 'call') showToast(`Calling ${client.clientName}...`, 'success');
          else if (action.action === 'navigate') showToast(`Opening navigation to ${client.address}`, 'success');
          else if (action.to) navigate(action.to);
        }}
      />
    </div>
  );
}

function VisitLogPage({ clientId, parentContext, navigate, showToast }) {
  const client = getClientById(clientId);
  const [rows, setRows] = useState([{ id: 1, productId: 'p1', quantity: '', unitPrice: 250 }]);
  const [formData, setFormData] = useState({ paymentMethod: '', deliveryDate: '', notes: '', commitmentNotes: '' });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const contextQuery = `?from=${parentContext}`;

  if (!client) return <EmptyState title="Client not found" actionLabel="Back to Clients" onAction={() => navigate('/sales/clients')} />;

  const lineTotal = (row) => (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
  const grandTotal = rows.reduce((sum, row) => sum + lineTotal(row), 0);

  const addRow = () => setRows((prev) => [...prev, { id: Date.now(), productId: 'p1', quantity: '', unitPrice: PRODUCTS[0].unitPrice }]);
  const removeRow = (id) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const updateRow = (id, field, value) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value, ...(field === 'productId' ? { unitPrice: getProductById(value)?.unitPrice ?? r.unitPrice } : {}) } : r)));

  const handleSubmit = () => {
    const nextErrors = {};
    rows.forEach((row, i) => {
      const qty = Number(row.quantity);
      if (!qty || qty <= 0) nextErrors[`qty-${row.id}`] = `Row ${i + 1}: quantity must be greater than zero.`;
      const stock = getProductStock(row.productId);
      if (qty > stock) nextErrors[`qty-${row.id}`] = `Row ${i + 1}: exceeds available inventory (${stock} units).`;
    });
    if (!formData.paymentMethod) nextErrors.paymentMethod = 'Select a payment method.';
    if (submitted) nextErrors.submit = 'This sale has already been submitted.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showToast('Please fix the errors before submitting.', 'error'); return; }
    setSubmitted(true);
    showToast('Sale logged. Inventory deducted and visit marked completed.', 'success');
    navigate(`/sales/history/INV-2024-0089`);
  };

  return (
    <div className="page">
      <section className="panel content-panel">
        <p className="muted">Logging sale for <strong>{client.clientName}</strong></p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header">
          <h3>Product Selection</h3>
          <button className="button secondary" type="button" onClick={addRow}>Add Product Row</button>
        </div>
        <div className="table-shell">
          <table className="data-table product-table">
            <thead><tr><th>Product Name</th><th>Quantity</th><th>Unit Price</th><th>Line Total</th><th></th></tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const product = getProductById(row.productId);
                return (
                  <tr key={row.id}>
                    <td>
                      <select value={row.productId} onChange={(e) => updateRow(row.id, 'productId', e.target.value)}>
                        {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {p.stock})</option>)}
                      </select>
                      {errors[`qty-${row.id}`] ? <p className="form-error">{errors[`qty-${row.id}`]}</p> : null}
                    </td>
                    <td><input type="number" min="1" value={row.quantity} onChange={(e) => updateRow(row.id, 'quantity', e.target.value)} /></td>
                    <td><input type="number" min="0" value={row.unitPrice} onChange={(e) => updateRow(row.id, 'unitPrice', e.target.value)} /></td>
                    <td>{formatCurrency(lineTotal(row))}</td>
                    <td><button className="link-button" type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan="3"><strong>Grand Total</strong></td><td colSpan="2"><strong>{formatCurrency(grandTotal)}</strong></td></tr></tfoot>
          </table>
        </div>
      </section>
      <section className="panel form-panel content-panel">
        <div className="form-group">
          <label>Payment Method<span className="required">*</span></label>
          <select value={formData.paymentMethod} onChange={(e) => setFormData((p) => ({ ...p, paymentMethod: e.target.value }))}>
            <option value="">Select payment method</option>
            {['Cash', 'Check', 'Bank Transfer', 'Credit Terms'].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {errors.paymentMethod ? <p className="form-error">{errors.paymentMethod}</p> : null}
        </div>
        <div className="form-group">
          <label>Expected Delivery Date</label>
          <input type="date" value={formData.deliveryDate} onChange={(e) => setFormData((p) => ({ ...p, deliveryDate: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea placeholder="Visit notes..." value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Commitment Notes</label>
          <textarea placeholder="Sales commitments or follow-up actions..." value={formData.commitmentNotes} onChange={(e) => setFormData((p) => ({ ...p, commitmentNotes: e.target.value }))} />
        </div>
        {errors.submit ? <p className="form-error">{errors.submit}</p> : null}
      </section>
      <PageToolbar
        actions={[
          { label: 'Log Sale', action: 'submit' },
          { label: 'Cancel', to: `/sales/client-detail/${client.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(a) => (a.action === 'submit' ? handleSubmit() : navigate(a.to))}
      />
    </div>
  );
}

function CIFormPage({ clientId, parentContext, navigate, showToast }) {
  const client = getClientById(clientId);
  const [formData, setFormData] = useState({});
  const contextQuery = `?from=${parentContext}`;
  if (!client) return <EmptyState title="Client not found" actionLabel="Back" onAction={() => navigate('/sales/clients')} />;

  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Credit Investigation Form</h3><p className="muted">Client: {client.clientName}</p></div>
        <div className="form-group"><label>Purpose of CI</label><select value={formData.purpose ?? ''} onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}><option value="">Select purpose</option>{['Credit Limit Increase', 'New Account', 'Delinquency Review'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Monthly Income</label><input type="number" placeholder="PHP amount" value={formData.income ?? ''} onChange={(e) => setFormData((p) => ({ ...p, income: e.target.value }))} /></div>
        <div className="form-group"><label>Business Type</label><select value={formData.businessType ?? ''} onChange={(e) => setFormData((p) => ({ ...p, businessType: e.target.value }))}><option value="">Select type</option>{['Retail', 'Wholesale', 'Convenience Store', 'Service'].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div className="form-group"><label>Character References</label><textarea placeholder="Reference names and contacts..." value={formData.references ?? ''} onChange={(e) => setFormData((p) => ({ ...p, references: e.target.value }))} /></div>
        <div className="form-group"><label>Remarks</label><textarea placeholder="Additional notes..." value={formData.remarks ?? ''} onChange={(e) => setFormData((p) => ({ ...p, remarks: e.target.value }))} /></div>
      </section>
      <PageToolbar
        actions={[
          { label: 'Submit to Operating Manager', action: 'submit' },
          { label: 'Cancel', to: `/sales/client-detail/${client.id}${contextQuery}`, variant: 'secondary' },
        ]}
        onAction={(a) => {
          if (a.action === 'submit') { showToast('CI Form sent to Operating Manager.', 'success'); navigate(`/sales/client-detail/${client.id}${contextQuery}`); }
          else navigate(a.to);
        }}
      />
    </div>
  );
}

function InventoryPage({ navigate, showToast }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Name');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const categories = ['All', ...new Set(PRODUCTS.map((p) => p.category))];
  const filtered = useMemo(() => {
    let results = [...PRODUCTS];
    const query = search.trim().toLowerCase();
    if (query) results = results.filter((p) => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query));
    if (category !== 'All') results = results.filter((p) => p.category === category);
    if (sortBy === 'Stock Level') results.sort((a, b) => a.stock - b.stock);
    else results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }, [search, category, sortBy]);

  if (loading) return <LoadingState message="Loading inventory..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Inventory Viewer</h3><span className="muted">Read-only access</span></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search products by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}</select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{['Name', 'Stock Level'].map((o) => <option key={o} value={o}>Sort: {o}</option>)}</select>
          </div>
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Product Name</th><th>SKU</th><th>Current Stock</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{product.stock}</td>
                    <td>{product.branch}</td>
                    <td><span className={`stock-status stock-${product.status.toLowerCase()}`}>{product.status}</span></td>
                    <td>
                      <button className="link-button" type="button" onClick={() => setSelectedProduct(product)}>Details</button>
                      <button className="link-button" type="button" onClick={() => navigate(`/sales/inventory/${product.id}`)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No products found" description="Adjust your search or category filter." />}
      {selectedProduct ? (
        <aside className="panel content-panel product-drawer" role="dialog" aria-label="Product details">
          <div className="panel-section-header">
            <h3>{selectedProduct.name}</h3>
            <button className="toast-dismiss" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close">×</button>
          </div>
          <ul className="info-grid">
            <li><span className="info-item-label">SKU</span><span className="info-item-value">{selectedProduct.sku}</span></li>
            <li><span className="info-item-label">Category</span><span className="info-item-value">{selectedProduct.category}</span></li>
            <li><span className="info-item-label">Stock</span><span className="info-item-value">{selectedProduct.stock} units</span></li>
            <li><span className="info-item-label">Unit Price</span><span className="info-item-value">{formatCurrency(selectedProduct.unitPrice)}</span></li>
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{selectedProduct.branch}</span></li>
            <li><span className="info-item-label">Status</span><span className="info-item-value">{selectedProduct.status}</span></li>
          </ul>
          <button className="button" type="button" onClick={() => navigate(`/sales/inventory/${selectedProduct.id}`)}>Open Product Details</button>
        </aside>
      ) : null}
    </div>
  );
}

function ProductDetailsPage({ productId, navigate }) {
  const product = getProductById(productId);
  if (!product) return <EmptyState title="Product not found" actionLabel="Back to Inventory" onAction={() => navigate('/sales/inventory')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Current Stock', value: String(product.stock) },
        { label: 'Unit Price', value: formatCurrency(product.unitPrice) },
        { label: 'Status', value: product.status },
      ]} />
      <section className="panel content-panel">
        <ul className="info-grid">
          <li><span className="info-item-label">Product</span><span className="info-item-value">{product.name}</span></li>
          <li><span className="info-item-label">SKU</span><span className="info-item-value">{product.sku}</span></li>
          <li><span className="info-item-label">Category</span><span className="info-item-value">{product.category}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{product.branch}</span></li>
          <li><span className="info-item-label">Minimum Stock</span><span className="info-item-value">{product.minStock} units</span></li>
        </ul>
      </section>
      <PageToolbar actions={[{ label: 'Back to Inventory', to: '/sales/inventory', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SalesHistoryPage({ navigate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return SALES_HISTORY.filter((item) => {
      const matchesSearch = !query || item.clientName.toLowerCase().includes(query) || item.invoiceNumber.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesFrom = !dateFrom || item.date >= dateFrom;
      const matchesTo = !dateTo || item.date <= dateTo;
      const matchesProduct = productFilter === 'All' || item.products.some((p) => p.name === productFilter);
      return matchesSearch && matchesStatus && matchesFrom && matchesTo && matchesProduct;
    });
  }, [search, statusFilter, dateFrom, dateTo, productFilter]);

  if (loading) return <LoadingState message="Loading sales history..." />;

  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Sales Transactions</h3></div>
        <div className="accounts-toolbar">
          <input className="search-input" type="search" placeholder="Search by client or invoice number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="accounts-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{['All', 'Confirmed', 'Pending Review'].map((o) => <option key={o}>{o}</option>)}</select>
            <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}><option value="All">All Products</option>{PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
      </section>
      {filtered.length ? (
        <section className="panel content-panel">
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Invoice Number</th><th>Client Name</th><th>Total Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.invoiceNumber}</td>
                    <td>{item.clientName}</td>
                    <td>{formatCurrency(item.totalAmount)}</td>
                    <td>{item.date}</td>
                    <td>{item.status}</td>
                    <td><button className="link-button" type="button" onClick={() => navigate(`/sales/history/${item.id}`)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : <EmptyState title="No sales records found" description="Adjust your search or filters." />}
    </div>
  );
}

function SaleDetailsPage({ invoiceId, navigate, showToast }) {
  const sale = getSaleById(invoiceId);
  if (!sale) return <EmptyState title="Sale not found" actionLabel="Back to History" onAction={() => navigate('/sales/history')} />;
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'Invoice Number', value: sale.invoiceNumber },
        { label: 'Total Amount', value: formatCurrency(sale.totalAmount) },
        { label: 'Status', value: sale.status },
      ]} />
      <section className="panel content-panel">
        <ul className="info-grid">
          <li><span className="info-item-label">Client</span><span className="info-item-value">{sale.clientName}</span></li>
          <li><span className="info-item-label">Branch</span><span className="info-item-value">{sale.branch}</span></li>
          <li><span className="info-item-label">Payment Method</span><span className="info-item-value">{sale.paymentMethod}</span></li>
          <li><span className="info-item-label">Date</span><span className="info-item-value">{sale.date}</span></li>
          <li><span className="info-item-label">Notes</span><span className="info-item-value">{sale.notes}</span></li>
        </ul>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>
              {sale.products.map((p) => (
                <tr key={p.name}><td>{p.name}</td><td>{p.quantity}</td><td>{formatCurrency(p.unitPrice)}</td><td>{formatCurrency(p.lineTotal)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to History', to: '/sales/history', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function NotificationsPage({ navigate, showToast }) {
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [filter, setFilter] = useState('All');
  const filtered = useMemo(() => {
    if (filter === 'Unread') return notifications.filter((n) => !n.read);
    if (filter === 'Read') return notifications.filter((n) => n.read);
    if (filter === 'Stock') return notifications.filter((n) => n.type === 'stock');
    if (filter === 'Schedule') return notifications.filter((n) => n.type === 'schedule');
    if (filter === 'Sales') return notifications.filter((n) => n.type === 'sale');
    if (filter === 'Assignments') return notifications.filter((n) => n.type === 'assignment');
    if (filter === 'CI') return notifications.filter((n) => n.type === 'ci');
    return notifications;
  }, [notifications, filter]);

  return (
    <div className="page">
      <PageToolbar actions={[{ label: 'Mark All as Read', action: 'markAll' }]} onAction={() => { setNotifications((items) => items.map((n) => ({ ...n, read: true }))); showToast('All notifications marked as read.', 'success'); }} />
      <section className="panel content-panel">
        <div className="segmented-control">
          {['All', 'Unread', 'Read', 'Stock', 'Schedule', 'Sales', 'Assignments', 'CI'].map((item) => (
            <button key={item} className={filter === item ? 'segment active' : 'segment'} type="button" onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
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

function ProfilePage({ navigate, showToast }) {
  return (
    <div className="page">
      <OfflineBanner />
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{SALES_AGENT_PROFILE.avatarInitials}</div>
          <div><h3>{SALES_AGENT_PROFILE.name}</h3><p className="muted">{SALES_AGENT_PROFILE.employeeId}</p></div>
        </div>
        <ul className="info-grid">
          <li><span className="info-item-label">Assigned Branch</span><span className="info-item-value">{SALES_AGENT_PROFILE.branch}</span></li>
          <li><span className="info-item-label">Email</span><span className="info-item-value">{SALES_AGENT_PROFILE.email}</span></li>
          <li><span className="info-item-label">Phone</span><span className="info-item-value">{SALES_AGENT_PROFILE.phone}</span></li>
        </ul>
      </section>
      <PageToolbar
        actions={[
          { label: 'Update Profile', action: 'update' },
          { label: 'Change Password', action: 'password', variant: 'secondary' },
          { label: 'Audit Log', to: '/sales/audit-log', variant: 'ghost' },
          { label: 'Logout', action: 'logout', variant: 'ghost' },
        ]}
        onAction={(a) => {
          if (a.to) navigate(a.to);
          else if (a.action === 'logout') { showToast('Logged out.', 'success'); navigate('/login'); }
          else showToast(`${a.label} form would open here.`, 'success');
        }}
      />
    </div>
  );
}

function RouteTrackingPage({ navigate }) {
  return (
    <div className="page">
      <StatsGrid stats={[
        { label: 'GPS Status', value: ROUTE_TRACKING.gpsEnabled ? 'Active' : 'Off' },
        { label: 'Territory Coverage', value: `${ROUTE_TRACKING.territoryCoverage}%` },
        { label: 'Visits Verified', value: `${ROUTE_TRACKING.visitsVerified}/${ROUTE_TRACKING.visitsPlanned}` },
      ]} />
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Territory Coverage Map</h3></div>
        <div className="placeholder-map">GPS tracking map with visit verification pins and territory boundary</div>
        <p className="muted">Current location: {ROUTE_TRACKING.currentLocation}</p>
      </section>
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Visit Verification</h3></div>
        <ul className="widget-list">
          {SCHEDULE_STOPS.filter((c) => c.status === 'Completed').map((c) => (
            <li key={c.id}><div><strong>{c.clientName}</strong><span className="muted">GPS verified · {c.lastVisitDate}</span></div><span className="status-badge status-completed">Verified</span></li>
          ))}
        </ul>
      </section>
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/sales/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function AuditLogPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel content-panel">
        <div className="panel-section-header"><h3>Audit Log</h3><p className="muted">Tracks login, sales, inventory views, CI submissions, and schedule completion.</p></div>
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Action</th><th>Detail</th><th>Timestamp</th></tr></thead>
            <tbody>
              {AUDIT_LOGS.map((log) => (
                <tr key={log.id}><td>{log.action}</td><td>{log.detail}</td><td>{log.timestamp}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Profile', to: '/sales/profile', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

function SettingsPage({ navigate }) {
  return (
    <div className="page">
      <section className="panel form-panel content-panel">
        <div className="panel-section-header"><h3>Settings</h3></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Enable offline mode</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Auto-sync when online</label></div>
        <div className="form-group"><label className="toggle-label"><input type="checkbox" defaultChecked />Enable GPS route tracking</label></div>
      </section>
      <PageToolbar actions={[{ label: 'Back to Dashboard', to: '/sales/dashboard', variant: 'ghost' }]} onAction={(a) => navigate(a.to)} />
    </div>
  );
}

export function SalesPageBody({ page, navigate, showToast }) {
  if (!page) return <EmptyState title="Page not found" description="Use the sidebar to open a supported screen." />;
  const props = { clientId: page.params?.clientId, productId: page.params?.productId, invoiceId: page.params?.invoiceId, parentContext: page.parentContext, navigate, showToast };
  switch (page.pageType) {
    case 'dashboard': return <DashboardPage {...props} />;
    case 'settings': return <SettingsPage {...props} />;
    case 'scheduleList':
    case 'scheduleMap': return <SchedulePage pageType={page.pageType} {...props} />;
    case 'clients': return <ClientsPage {...props} />;
    case 'clientDetail': return <ClientDetailPage {...props} />;
    case 'visitLog': return <VisitLogPage {...props} />;
    case 'ciForm': return <CIFormPage {...props} />;
    case 'inventory': return <InventoryPage {...props} />;
    case 'productDetails': return <ProductDetailsPage {...props} />;
    case 'history': return <SalesHistoryPage {...props} />;
    case 'saleDetails': return <SaleDetailsPage {...props} />;
    case 'notifications': return <NotificationsPage {...props} />;
    case 'profile': return <ProfilePage {...props} />;
    case 'routeTracking': return <RouteTrackingPage {...props} />;
    case 'auditLog': return <AuditLogPage {...props} />;
    default: return <EmptyState title="Page not found" description="This screen is not configured yet." />;
  }
}
